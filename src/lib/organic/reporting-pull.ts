/**
 * The reporting half of the nightly organic pull (migration 114): followers,
 * posts published, the top post per week and the pins that were new that
 * week. Runs after pullWeeklyKpis() for every organic store.
 *
 * What the API allows decides the shape here, and each is stated in 114:
 * followers are a current count (snapshotted daily), posts are read from
 * GET /pins (board-warming saves counted apart), new pins are measured one by
 * one. Every part is its own try: a store whose top-pins call refuses still
 * gets its followers and its posts.
 */
import { organicPool } from "./db";
import { ownTopPins } from "./own-pins";
import type { PinterestClient } from "@/lib/pinterest/client";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s + "T00:00:00Z") + n * DAY));

/** Monday of the week a date falls in. */
function mondayOf(dateIso: string): string {
  const d = new Date(dateIso.slice(0, 10) + "T00:00:00Z");
  return addDays(iso(d), -((d.getUTCDay() + 6) % 7));
}

type Images = Record<string, { url?: string }> | undefined;
function imageOf(images: Images, fallback?: string | null): string | null {
  if (!images) return fallback ?? null;
  return images["600x"]?.url ?? images["400x300"]?.url ?? images["1200x"]?.url ?? images["150x150"]?.url ?? fallback ?? null;
}

const n = (m: Record<string, number> | undefined, k: string) => {
  const v = m?.[k];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};

/** Most pages of GET /pins read per store per run (250 each). */
const MAX_PIN_PAGES = 8;
/** New pins measured per store per run; the rest follow the next night. */
const MAX_NEW_PIN_MEASURES = 60;
/** A week's new pins keep being re-measured this long after it ends, while
 *  Pinterest is still settling the last days. */
const REMEASURE_DAYS = 10;

export interface ReportingPullResult {
  followers: number | null;
  posts: number;
  new_pins_measured: number;
  top_pins: number;
  notes: string[];
}

export async function pullReportingExtras(
  orgId: string,
  client: PinterestClient,
  weekStarts: string[],
): Promise<ReportingPullResult> {
  const pool = organicPool();
  const out: ReportingPullResult = { followers: null, posts: 0, new_pins_measured: 0, top_pins: 0, notes: [] };
  const today = iso(new Date());
  const spanStart = weekStarts[0];
  const spanEnd = addDays(weekStarts[weekStarts.length - 1], 6);

  // 1. Followers — today's count, the only one Pinterest gives.
  try {
    const u = await client.getUser();
    if (typeof u.follower_count === "number") {
      await pool.query(
        `INSERT INTO organic.follower_snapshots (org_id, measured_on, followers)
         VALUES ($1, $2::date, $3)
         ON CONFLICT (org_id, measured_on) DO UPDATE SET followers = EXCLUDED.followers`,
        [orgId, today, u.follower_count],
      );
      out.followers = u.follower_count;
    }
  } catch (e) {
    out.notes.push(`followers: ${(e as Error).message.slice(0, 80)}`);
  }

  // 2. Posts published — own pins created in the span.
  try {
    type Item = Awaited<ReturnType<PinterestClient["getAccountPins"]>>["items"][number];
    const items: Item[] = [];
    let bookmark: string | undefined;
    // Whether the read reached past the span. If the page cap stopped it
    // first, the oldest weeks were only partly read: those are left alone
    // rather than written as a count that is too low and looks exact.
    let complete = false;
    for (let page = 0; page < MAX_PIN_PAGES; page++) {
      const res = await client.getAccountPins(bookmark);
      items.push(...(res.items ?? []));
      // Newest first, but not strictly — so stop only when a whole page is
      // older than the span, never on the first old pin.
      const newest = (res.items ?? []).map((i) => i.created_at ?? "").sort().pop() ?? "";
      if (!res.bookmark || newest.slice(0, 10) < spanStart) { complete = true; break; }
      bookmark = res.bookmark;
    }
    const oldestRead = items.map((i) => (i.created_at ?? "").slice(0, 10)).filter(Boolean).sort()[0] ?? today;
    const readWeeks = complete ? weekStarts : weekStarts.filter((w) => w > oldestRead);
    if (!complete) out.notes.push(`posts: page cap reached, ${weekStarts.length - readWeeks.length} oldest week(s) not counted`);

    // Board-warming saves copy an existing pin (same title and link) onto a
    // new board. seed_plan does not record the id of the copy, so it is
    // recognised by what it copies.
    const seeds = await pool.query<{ k: string }>(
      `SELECT lower(coalesce(pin_title, '')) || '|' || lower(coalesce(pin_link, '')) AS k
         FROM organic.seed_plan WHERE org_id = $1 AND status = 'SAVED'`,
      [orgId],
    );
    const seedKeys = new Set(seeds.rows.map((r) => r.k));
    const ours = await pool.query<{ id: string }>(
      `SELECT p.pinterest_pin_id AS id
         FROM organic.pins p JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1 AND p.pinterest_pin_id IS NOT NULL`,
      [orgId],
    );
    const oursSet = new Set(ours.rows.map((r) => r.id));

    // Pages can overlap; one pin once, or the batched upsert below refuses.
    const seen = new Set<string>();
    const inSpan = items.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      const d = (i.created_at ?? "").slice(0, 10);
      return d >= spanStart && d <= spanEnd;
    });
    const perWeek = new Map<string, { posts: number; seeds: number }>(
      readWeeks.map((w) => [w, { posts: 0, seeds: 0 }]),
    );
    const newPins: Item[] = [];
    for (const i of inSpan) {
      const w = mondayOf(i.created_at!);
      const bucket = perWeek.get(w);
      if (!bucket) continue;
      const key = `${(i.title ?? "").toLowerCase()}|${(i.link ?? "").toLowerCase()}`;
      if (seedKeys.has(key) && !oursSet.has(i.id)) { bucket.seeds += 1; continue; }
      bucket.posts += 1;
      newPins.push(i);
    }
    const weeks = [...perWeek.keys()];
    await pool.query(
      `INSERT INTO organic.weekly_kpis (org_id, week_start, posts_published, board_warming_saves)
       SELECT $1, w, p, s FROM unnest($2::date[], $3::int[], $4::int[]) AS t(w, p, s)
       ON CONFLICT (org_id, week_start) DO UPDATE SET
         posts_published = EXCLUDED.posts_published,
         board_warming_saves = EXCLUDED.board_warming_saves`,
      [orgId, weeks, weeks.map((w) => perWeek.get(w)!.posts), weeks.map((w) => perWeek.get(w)!.seeds)],
    );
    out.posts = newPins.length;

    // A pin counted before and not now (deleted, or since recognised as a
    // warming save) leaves the week, or new_pins and posts_published disagree.
    await pool.query(
      `DELETE FROM organic.new_pins
        WHERE org_id = $1 AND week_start = ANY($2::date[]) AND NOT (pin_id = ANY($3::text[]))`,
      [orgId, weeks, newPins.map((i) => i.id)],
    );

    // 3. The new pins themselves, measured from creation to the end of their
    //    week. Re-measured while the week is recent; after that frozen.
    // One statement, not one per pin: a store that posts a lot has hundreds.
    const rows = newPins.map((i) => {
      const media = i.media as { media_type?: string; url?: string; images?: Images } | null | undefined;
      return {
        id: i.id, week: mondayOf(i.created_at!), created: i.created_at!, title: i.title ?? null,
        image: imageOf(media?.images, media?.url ?? null), link: i.link ?? null,
        media: media?.media_type ?? null, ours: oursSet.has(i.id),
      };
    });
    if (rows.length > 0) {
      await pool.query(
        `INSERT INTO organic.new_pins (org_id, pin_id, week_start, created_at, title, image_url, link, media_type, is_ours)
         SELECT $1, * FROM unnest($2::text[], $3::date[], $4::timestamptz[], $5::text[], $6::text[],
                                  $7::text[], $8::text[], $9::boolean[])
         ON CONFLICT (org_id, pin_id) DO UPDATE SET
           title = EXCLUDED.title, image_url = EXCLUDED.image_url, link = EXCLUDED.link,
           media_type = EXCLUDED.media_type, is_ours = EXCLUDED.is_ours`,
        [orgId, rows.map((r) => r.id), rows.map((r) => r.week), rows.map((r) => r.created),
         rows.map((r) => r.title), rows.map((r) => r.image), rows.map((r) => r.link),
         rows.map((r) => r.media), rows.map((r) => r.ours)],
      );
    }
    const due = await pool.query<{ pin_id: string; created_at: string; week_start: string }>(
      `SELECT pin_id, created_at::date::text AS created_at, week_start::text AS week_start
         FROM organic.new_pins
        WHERE org_id = $1
          AND (measured_at IS NULL OR week_start + 6 + $2::int >= current_date)
        ORDER BY measured_at NULLS FIRST, created_at DESC
        LIMIT $3`,
      [orgId, REMEASURE_DAYS, MAX_NEW_PIN_MEASURES],
    );
    const yesterday = addDays(today, -1);
    for (let k = 0; k < due.rows.length; k += 4) {
      await Promise.all(due.rows.slice(k, k + 4).map(async (p) => {
        const end = [addDays(p.week_start, 6), yesterday].sort()[0];
        if (end < p.created_at) return;
        try {
          const r = (await client.getPinAnalytics(p.pin_id, p.created_at, end,
            ["IMPRESSION", "SAVE", "OUTBOUND_CLICK", "PIN_CLICK"])) as {
            all?: { daily_metrics?: Array<{ data_status?: string; metrics: Record<string, number> }> };
          };
          const days = r?.all?.daily_metrics ?? [];
          const sum = (m: string) => days.reduce((t, d) => t + n(d.metrics, m), 0);
          await pool.query(
            `UPDATE organic.new_pins SET impressions = $3, saves = $4, outbound_clicks = $5,
                    pin_clicks = $6, measured_at = now()
              WHERE org_id = $1 AND pin_id = $2`,
            [orgId, p.pin_id, sum("IMPRESSION"), sum("SAVE"), sum("OUTBOUND_CLICK"), sum("PIN_CLICK")],
          );
          out.new_pins_measured += 1;
        } catch (e) {
          const msg = (e as Error).message;
          // Deleted since. Left in place it stays unmeasured, sorts first and
          // is asked for again every night; and a deleted pin is not a post.
          if (/\b404\b/.test(msg)) {
            await pool.query(`DELETE FROM organic.new_pins WHERE org_id = $1 AND pin_id = $2`, [orgId, p.pin_id]);
            out.notes.push(`pin ${p.pin_id} deleted on Pinterest, dropped`);
            return;
          }
          out.notes.push(`pin ${p.pin_id}: ${msg.slice(0, 60)}`);
        }
      }));
    }
  } catch (e) {
    out.notes.push(`posts: ${(e as Error).message.slice(0, 80)}`);
  }

  // 4. Top post per week — own image + video pins, by impressions. The last
  //    two weeks every night (still settling), older weeks only once.
  try {
    const have = await pool.query<{ week_start: string }>(
      `SELECT week_start::text FROM organic.weekly_kpis
        WHERE org_id = $1 AND top_pin_id IS NOT NULL AND week_start = ANY($2::date[])`,
      [orgId, weekStarts],
    );
    const done = new Set(have.rows.map((r) => r.week_start));
    const recent = new Set(weekStarts.slice(-2));
    const todo = weekStarts.filter((w) => recent.has(w) || !done.has(w));
    await Promise.all(todo.map(async (w) => {
      const end = [addDays(w, 6), addDays(today, -1)].sort()[0];
      const top = await ownTopPins(client, w, end, "IMPRESSION", ["IMPRESSION", "SAVE", "OUTBOUND_CLICK"]);
      const t = top.pins[0];
      if (!t) return;
      let title: string | null = null, image: string | null = null, link: string | null = null;
      try {
        const d = await client.getPin(t.pin_id);
        title = d.title || null;
        link = d.link || null;
        image = imageOf(d.media?.images as Images, d.media?.cover_image_url ?? null);
      } catch { /* the figures stand without the picture */ }
      await pool.query(
        `INSERT INTO organic.weekly_kpis (org_id, week_start, top_pin_id, top_pin_title, top_pin_image,
            top_pin_link, top_pin_impressions, top_pin_saves, top_pin_outbound_clicks)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (org_id, week_start) DO UPDATE SET
           top_pin_id = EXCLUDED.top_pin_id, top_pin_title = EXCLUDED.top_pin_title,
           top_pin_image = EXCLUDED.top_pin_image, top_pin_link = EXCLUDED.top_pin_link,
           top_pin_impressions = EXCLUDED.top_pin_impressions, top_pin_saves = EXCLUDED.top_pin_saves,
           top_pin_outbound_clicks = EXCLUDED.top_pin_outbound_clicks`,
        [orgId, w, t.pin_id, title, image, link,
         n(t.metrics, "IMPRESSION"), n(t.metrics, "SAVE"), n(t.metrics, "OUTBOUND_CLICK")],
      );
      out.top_pins += 1;
    }));
  } catch (e) {
    out.notes.push(`top pins: ${(e as Error).message.slice(0, 80)}`);
  }

  return out;
}
