/**
 * P4.4.1 and P4.4.2 — putting the waterfall live, and watching it.
 *
 * Until now `pushWaterfallToPinterest` returned `{ queued: 0, mode:
 * "handoff-todo" }`. The button existed, the API answered 200, and nothing
 * reached Pinterest. Everything upstream — the research, the brief, the
 * designs, the copy, the rotation — ended in a no-op.
 *
 * The split here matters and is not an implementation detail:
 *
 *   scheduleWaterfall()  is the approval. It moves sixteen PLANNED pins to
 *                        SCHEDULED and the waterfall to RUNNING. It posts
 *                        nothing, because the sixteen pins are deliberately
 *                        spread over weeks — publishing them on approval
 *                        would collapse the whole waterfall into one day
 *                        and undo the only thing it exists to do.
 *
 *   publishDuePins()     is the cron. Every quarter of an hour it takes the
 *                        pins whose date has arrived and posts them, and
 *                        that is where the caps live: the 20/day hard
 *                        ceiling, the store's own daily target, and a
 *                        minimum gap so a day's pins do not all land at
 *                        06:00.
 *
 * Enforcing the caps at publish time rather than at generate time is what
 * lets two cycles run concurrently without either of them knowing about the
 * other. A generator that reserved slots would have to hold a lock across
 * the whole account.
 */
import { organicPool } from "./db";
import {
  pinterestClientsForOrgs,
  type PinterestAuthError,
} from "@/lib/pinterest/for-org";

/** The method's absolute ceiling. No store setting may exceed it. */
const HARD_DAILY_CAP = 20;

/** A publish attempt that should be retried rather than recorded as a failure. */
function isTransient(message: string): boolean {
  // 429 is the rate limit; 5xx is Pinterest having a moment. Neither means
  // the pin is wrong, so neither may consume its one chance to go out.
  return /Pinterest API error (429|5\d\d)\b/.test(message) ||
         /fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i.test(message);
}

/* ------------------------------------------------------------------ */
/* P4.4.1 — approval                                                   */
/* ------------------------------------------------------------------ */

/**
 * The waterfall a cycle is currently on.
 *
 * Every phase-4 control in the UI is addressed by URL — that is the unit a
 * cycle is, and the manager never sees a waterfall id. Resolving it here
 * keeps that true for the publishing step as well.
 */
export async function currentWaterfallForUrl(
  orgId: string,
  urlId: string
): Promise<string> {
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM organic.waterfalls
      WHERE org_id = $1 AND url_id = $2
        AND status <> 'ABANDONED'::organic.waterfall_status
      ORDER BY created_at DESC
      LIMIT 1`,
    [orgId, urlId]
  );
  if (r.rowCount === 0) {
    throw new Error("No waterfall for this URL yet — generate it first (P4.3.1)");
  }
  return r.rows[0].id;
}

export interface ScheduleReport {
  waterfall_id: string;
  scheduled: number;
  /** Pins that cannot be posted at all. These are hard stops. */
  blocked: Array<{ sequence: number; reason: string }>;
  /** Things worth knowing that do not stop the run. */
  warnings: string[];
  first_date: string | null;
  last_date: string | null;
}

/**
 * Move an approved waterfall into the publishing queue.
 *
 * Blocks only on what makes the API call impossible or the result wrong:
 * no image, no board on Pinterest, no title, or copy a human explicitly
 * rejected. Everything else warns. That line is deliberate — the manager
 * may always overrule a rule of the method, but "publish a design nobody
 * has an image for" is not an override, it is a crash.
 */
export async function scheduleWaterfall(
  orgId: string,
  waterfallId: string
): Promise<ScheduleReport> {
  const pool = organicPool();


  const rows = await pool.query<{
    id: string;
    sequence_number: number;
    scheduled_date: string;
    status: string;
    image_path: string | null;
    pinterest_board_id: string | null;
    board_name: string;
    title: string | null;
    description: string | null;
    human_qc_status: string | null;
    validator_status: string | null;
    design_qc: string | null;
  }>(
    `SELECT p.id::text,
            p.sequence_number,
            p.scheduled_date,
            p.status::text                AS status,
            p.image_path,
            b.pinterest_board_id,
            b.name                        AS board_name,
            cs.title,
            cs.description,
            cs.human_qc_status::text      AS human_qc_status,
            cs.validator_status::text     AS validator_status,
            d.qc_status::text             AS design_qc
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
       LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
       LEFT JOIN organic.designs d    ON d.id = p.design_id
      WHERE p.waterfall_id = $1 AND w.org_id = $2
      ORDER BY p.sequence_number`,
    [waterfallId, orgId]
  );
  if (rows.rowCount === 0) throw new Error("Waterfall not found for this org");

  const blocked: ScheduleReport["blocked"] = [];
  const warnings: string[] = [];
  const ready: string[] = [];

  let pendingCopyQc = 0;
  let pendingDesignQc = 0;

  for (const p of rows.rows) {
    const problems: string[] = [];
    if (!p.image_path) problems.push("no image — run P4.2.4 and P4.2.5");
    if (!p.pinterest_board_id) problems.push(`board "${p.board_name}" does not exist on Pinterest yet`);
    if (!p.title?.trim()) problems.push("no title — run P4.2.8");
    if (p.human_qc_status === "REJECTED") problems.push("copy was rejected in QC");
    if (p.design_qc === "REJECTED") problems.push("design was rejected in QC");

    if (problems.length > 0) {
      blocked.push({ sequence: p.sequence_number, reason: problems.join("; ") });
      continue;
    }
    if (p.human_qc_status !== "APPROVED") pendingCopyQc += 1;
    if (p.design_qc !== "APPROVED") pendingDesignQc += 1;
    if (p.validator_status === "FAIL") {
      warnings.push(`Pin ${p.sequence_number}: copy still fails the validator.`);
    }
    // Already published or cancelled pins are left alone — re-approving a
    // waterfall must never repost what is already live.
    if (p.status === "PLANNED" || p.status === "FAILED") ready.push(p.id);
  }

  if (pendingCopyQc > 0) {
    warnings.push(`${pendingCopyQc} copy set(s) have not passed copy QC (P4.2.10).`);
  }
  if (pendingDesignQc > 0) {
    warnings.push(`${pendingDesignQc} design(s) have not passed design QC (P4.2.7).`);
  }

  if (ready.length > 0) {
    await pool.query(
      `UPDATE organic.pins
          SET status = 'SCHEDULED'::organic.pin_status,
              failure_reason = NULL
        WHERE id = ANY($1::uuid[])`,
      [ready]
    );
    await pool.query(
      `UPDATE organic.waterfalls
          SET status = 'RUNNING'::organic.waterfall_status,
              end_date = (SELECT MAX(scheduled_date) FROM organic.pins WHERE waterfall_id = $1)
        WHERE id = $1`,
      [waterfallId]
    );
  }

  const dates = rows.rows.map((r) => r.scheduled_date).sort();
  return {
    waterfall_id: waterfallId,
    scheduled: ready.length,
    blocked,
    warnings,
    first_date: dates[0] ?? null,
    last_date: dates[dates.length - 1] ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* P4.4.1 — the cron that actually posts                               */
/* ------------------------------------------------------------------ */

interface DuePin {
  pin_id: string;
  org_id: string;
  sequence_number: number;
  image_path: string;
  pinterest_board_id: string;
  title: string;
  description: string | null;
  url: string;
  alt_text: string | null;
  daily_pin_target: number | null;
}

export interface PublishRunReport {
  due: number;
  published: number;
  failed: number;
  /** Held back by a cap, a gap, or a rate limit. Retried next run. */
  deferred: number;
  orgs: Array<{
    org_id: string;
    org_name: string;
    published: number;
    failed: number;
    deferred: number;
    note?: string;
  }>;
  /** Stores that need a human to reconnect. These never fix themselves. */
  reconnect_required: Array<{
    org_id: string;
    org_name: string;
    reason: PinterestAuthError["reason"];
    message: string;
  }>;
}

export async function publishDuePins(
  opts: { orgId?: string; dryRun?: boolean; limitPerOrg?: number } = {}
): Promise<PublishRunReport> {
  const pool = organicPool();

  const due = await pool.query<DuePin>(
    `SELECT p.id::text          AS pin_id,
            w.org_id::text      AS org_id,
            p.sequence_number,
            p.image_path,
            b.pinterest_board_id,
            cs.title,
            cs.description,
            u.url,
            cs.tagline          AS alt_text,
            s.daily_pin_target
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.urls u       ON u.id = w.url_id
       JOIN organic.boards b     ON b.id = p.board_id
       JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
       LEFT JOIN organic.client_settings s ON s.org_id = w.org_id
      WHERE p.status = 'SCHEDULED'::organic.pin_status
        AND p.scheduled_date <= CURRENT_DATE
        AND p.image_path IS NOT NULL
        AND b.pinterest_board_id IS NOT NULL
        AND cs.title IS NOT NULL
        AND ($1::uuid IS NULL OR w.org_id = $1::uuid)
      ORDER BY p.scheduled_date, p.sequence_number`,
    [opts.orgId ?? null]
  );

  const report: PublishRunReport = {
    due: due.rowCount ?? 0,
    published: 0,
    failed: 0,
    deferred: 0,
    orgs: [],
    reconnect_required: [],
  };
  if (report.due === 0) return report;

  const byOrg = new Map<string, DuePin[]>();
  for (const p of due.rows) {
    const list = byOrg.get(p.org_id) ?? [];
    list.push(p);
    byOrg.set(p.org_id, list);
  }

  const { clients, failed: authFailed } = await pinterestClientsForOrgs([...byOrg.keys()]);
  for (const f of authFailed) {
    report.reconnect_required.push(f);
    const held = byOrg.get(f.org_id)?.length ?? 0;
    report.deferred += held;
    report.orgs.push({
      org_id: f.org_id,
      org_name: f.org_name,
      published: 0,
      failed: 0,
      deferred: held,
      note: `needs reconnect: ${f.reason}`,
    });
    byOrg.delete(f.org_id);
  }

  for (const [orgId, pins] of byOrg) {
    const entry = clients.get(orgId)!;
    const target = Math.min(pins[0].daily_pin_target ?? 5, HARD_DAILY_CAP);

    // How many already went out today, and when the last one did. Both come
    // from the same table the cron writes, so a re-run inside one day cannot
    // double-post past the cap.
    const today = await pool.query<{ n: string; last_at: string | null }>(
      `SELECT COUNT(*)::text AS n, MAX(published_at)::text AS last_at
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1
          AND p.status = 'PUBLISHED'::organic.pin_status
          AND p.published_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
      [orgId]
    );
    const postedToday = Number(today.rows[0].n);
    const lastAt = today.rows[0].last_at ? new Date(today.rows[0].last_at) : null;

    // Spread the day's allowance rather than dumping it. With a target of
    // four that is one pin every six hours, which is what "unpaid
    // advertising" should look like on a timeline.
    const minGapMs = Math.floor((24 * 60) / Math.max(1, target)) * 60_000;
    if (lastAt && Date.now() - lastAt.getTime() < minGapMs) {
      report.deferred += pins.length;
      report.orgs.push({
        org_id: orgId,
        org_name: entry.orgName,
        published: 0,
        failed: 0,
        deferred: pins.length,
        note: `waiting out the ${Math.round(minGapMs / 60_000)}-minute gap`,
      });
      continue;
    }

    let room = Math.max(0, target - postedToday);
    if (opts.limitPerOrg !== undefined) room = Math.min(room, opts.limitPerOrg);

    let published = 0;
    let failed = 0;
    let deferred = 0;

    for (const pin of pins) {
      if (room <= 0) { deferred += 1; continue; }

      if (opts.dryRun) { published += 1; room -= 1; continue; }

      try {
        const created = await entry.client.createPin({
          board_id: pin.pinterest_board_id,
          title: pin.title.slice(0, 100),
          description: pin.description ?? undefined,
          link: pin.url,
          alt_text: pin.alt_text?.slice(0, 500) ?? undefined,
          media_source: { source_type: "image_url", url: pin.image_path },
        });
        await pool.query(
          `UPDATE organic.pins
              SET status = 'PUBLISHED'::organic.pin_status,
                  pinterest_pin_id = $2,
                  published_at = now(),
                  failure_reason = NULL
            WHERE id = $1`,
          [pin.pin_id, created?.id ?? null]
        );
        published += 1;
        room -= 1;
      } catch (e) {
        const message = (e as Error).message;
        if (isTransient(message)) {
          // Left SCHEDULED on purpose: the next run picks it up. Recording
          // a rate limit as a failure would burn a pin the method has
          // already paid for in research and design.
          deferred += 1;
          await pool.query(
            `UPDATE organic.pins SET failure_reason = $2 WHERE id = $1`,
            [pin.pin_id, `Retrying: ${message.slice(0, 400)}`]
          );
          break; // stop this org for now — the whole account is throttled
        }
        await pool.query(
          `UPDATE organic.pins
              SET status = 'FAILED'::organic.pin_status,
                  failure_reason = $2
            WHERE id = $1`,
          [pin.pin_id, message.slice(0, 900)]
        );
        failed += 1;
      }
    }

    report.published += published;
    report.failed += failed;
    report.deferred += deferred;
    report.orgs.push({
      org_id: orgId,
      org_name: entry.orgName,
      published,
      failed,
      deferred,
      note: room <= 0 && deferred > 0 ? `daily cap ${target} reached` : undefined,
    });
  }

  return report;
}

/* ------------------------------------------------------------------ */
/* P4.4.2 — the readout                                                */
/* ------------------------------------------------------------------ */

export interface PublishHealth {
  counts: { planned: number; scheduled: number; published: number; failed: number; cancelled: number };
  /** Due today or earlier and still not out. */
  overdue: number;
  /**
   * Of those, the ones the cron will never pick up because something they
   * need is missing. Counted separately on purpose: the publish query
   * filters on image, board and title, so without this the panel says
   * "6 overdue" while the cron reports "0 due" and nothing reconciles the
   * two. A pin can sit here indefinitely and look merely late.
   */
  stuck: Array<{ sequence: number; scheduled_date: string; reason: string }>;
  next_scheduled: string | null;
  last_published: string | null;
  failures: Array<{
    sequence: number;
    board: string;
    scheduled_date: string;
    reason: string;
    retrying: boolean;
  }>;
  /** Present when the store cannot publish at all until somebody acts. */
  blocker: { kind: "token"; message: string } | null;
}

/**
 * What P4.4.2 shows. Two kinds of problem, answered differently: a rate
 * limit queues itself and needs nobody, an expired token needs a person and
 * will otherwise sit there until the next cycle fails too.
 */
export async function loadPublishHealth(orgId: string): Promise<PublishHealth> {
  const pool = organicPool();

  const counts = await pool.query<{ status: string; n: string }>(
    `SELECT p.status::text AS status, COUNT(*)::text AS n
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
      GROUP BY 1`,
    [orgId]
  );
  const c = { planned: 0, scheduled: 0, published: 0, failed: 0, cancelled: 0 };
  for (const r of counts.rows) {
    const k = r.status.toLowerCase() as keyof typeof c;
    if (k in c) c[k] = Number(r.n);
  }

  const timing = await pool.query<{
    overdue: string; next_scheduled: string | null; last_published: string | null;
  }>(
    `SELECT COUNT(*) FILTER (
              WHERE p.status = 'SCHEDULED'::organic.pin_status
                AND p.scheduled_date <= CURRENT_DATE
            )::text AS overdue,
            MIN(p.scheduled_date) FILTER (
              WHERE p.status = 'SCHEDULED'::organic.pin_status
                AND p.scheduled_date > CURRENT_DATE
            )      AS next_scheduled,
            MAX(p.published_at)::text AS last_published
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1`,
    [orgId]
  );

  // Scheduled, its date has passed, and it fails the publish query's own
  // conditions. Same three columns the cron filters on, so this cannot drift
  // apart from it silently.
  const stuck = await pool.query<{
    sequence_number: number; scheduled_date: string;
    has_image: boolean; has_board: boolean; has_title: boolean; board_name: string;
  }>(
    `SELECT p.sequence_number,
            p.scheduled_date,
            p.image_path IS NOT NULL          AS has_image,
            b.pinterest_board_id IS NOT NULL  AS has_board,
            cs.title IS NOT NULL              AS has_title,
            b.name                            AS board_name
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
       LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
      WHERE w.org_id = $1
        AND p.status = 'SCHEDULED'::organic.pin_status
        AND p.scheduled_date <= CURRENT_DATE
        AND (p.image_path IS NULL OR b.pinterest_board_id IS NULL OR cs.title IS NULL)
      ORDER BY p.scheduled_date
      LIMIT 20`,
    [orgId]
  );

  const fails = await pool.query<{
    sequence_number: number; board_name: string; scheduled_date: string;
    failure_reason: string; status: string;
  }>(
    `SELECT p.sequence_number, b.name AS board_name, p.scheduled_date,
            p.failure_reason, p.status::text AS status
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.boards b     ON b.id = p.board_id
      WHERE w.org_id = $1 AND p.failure_reason IS NOT NULL
      ORDER BY p.scheduled_date DESC
      LIMIT 20`,
    [orgId]
  );

  // The token is only reported as a blocker when there is something waiting
  // on it. A store between cycles with an expired token is not an incident.
  let blocker: PublishHealth["blocker"] = null;
  const waiting = c.scheduled > 0 || Number(timing.rows[0].overdue) > 0;
  if (waiting) {
    const { failed } = await pinterestClientsForOrgs([orgId]);
    if (failed.length > 0) {
      blocker = { kind: "token", message: failed[0].message };
    }
  }

  return {
    counts: c,
    overdue: Number(timing.rows[0].overdue),
    stuck: stuck.rows.map((s) => ({
      sequence: s.sequence_number,
      scheduled_date: s.scheduled_date,
      reason: [
        !s.has_image ? "no image (P4.2.4 / P4.2.5)" : null,
        !s.has_board ? `board "${s.board_name}" not on Pinterest yet` : null,
        !s.has_title ? "no copy (P4.2.8)" : null,
      ].filter(Boolean).join("; "),
    })),
    next_scheduled: timing.rows[0].next_scheduled,
    last_published: timing.rows[0].last_published,
    failures: fails.rows.map((f) => ({
      sequence: f.sequence_number,
      board: f.board_name,
      scheduled_date: f.scheduled_date,
      reason: f.failure_reason,
      retrying: f.status === "SCHEDULED",
    })),
    blocker,
  };
}
