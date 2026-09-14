/**
 * Daily organic watchdog — read-only.
 *
 * The weekly-update crons have had a watchdog since August; organic had
 * none, and every fault found in the week of 08-09-2026 was found by a
 * person looking. That is the wrong division of labour, because none of
 * these faults announce themselves: a pin whose board does not exist on
 * Pinterest is simply never returned by the publish query — no error, no
 * failure count, no retry. It sits there looking merely late.
 *
 * It writes nothing and fixes nothing. It answers one question per store —
 * is anything in the way — and stays quiet when the answer is no. A channel
 * that reports "all good" every morning stops being read, which is how the
 * next real alert gets missed.
 *
 * Deliberately scoped to `organic.client_settings`, never to organic.boards
 * or organic.pins: those hold rows for ~50 orgs whose boards were imported
 * by the main dashboard and that never entered the organic workflow.
 *
 *     curl -H "x-cron-secret: $CRON_SECRET" \
 *       "https://dashboard.pinformance-agency.com/api/cron/organic-health"
 */
import { NextRequest, NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { alertCronFailure } from "@/lib/alerts";
import { pinterestClientsForOrgs } from "@/lib/pinterest/for-org";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * The seeded demo store is excluded.
 *
 * It has deliberate defects — a failed pin, an approval sitting for three
 * weeks, one topic short of coverage — because screens built for a store
 * with history are otherwise only ever reviewed empty. Every one of those
 * defects is a finding here, so without this the channel carries the same
 * two lines about a fictional client every morning, and a channel that
 * cries wolf daily is worse than no channel. Fixed uuid, set by
 * scripts/demo-store.ts.
 */
const DEMO_ORG = "d3e70000-0000-4000-8000-00000000de00";

function verifyCron(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

interface Finding {
  store: string;
  /** One line, in the words somebody would use to fix it. */
  what: string;
  /** Which shape, so the message can group them. */
  kind: "token" | "stuck" | "failed" | "unqueued" | "late";
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const pool = organicPool();
    const findings: Finding[] = [];

    // 1. Pins whose date has passed, that are queued, and that the publishing
    //    cron will never pick up — same three columns publishDuePins filters
    //    on, so this cannot drift apart from it silently.
    const stuck = await pool.query<{
      store: string; n: string; oldest: string;
      no_image: string; no_board: string; no_title: string; boards: string[];
    }>(
      `SELECT o.name AS store, COUNT(*)::text AS n, MIN(p.scheduled_date)::text AS oldest,
              COUNT(*) FILTER (WHERE p.image_path IS NULL)::text         AS no_image,
              COUNT(*) FILTER (WHERE b.pinterest_board_id IS NULL)::text AS no_board,
              COUNT(*) FILTER (WHERE cs.title IS NULL)::text             AS no_title,
              COALESCE(ARRAY(SELECT DISTINCT b2.name
                 FROM organic.pins p2
                 JOIN organic.boards b2 ON b2.id = p2.board_id
                 JOIN organic.waterfalls w2 ON w2.id = p2.waterfall_id
                WHERE w2.org_id = o.id
                  AND p2.status = 'SCHEDULED'::organic.pin_status
                  AND p2.scheduled_date <= CURRENT_DATE
                  AND b2.pinterest_board_id IS NULL), ARRAY[]::text[]) AS boards
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.client_settings cl ON cl.org_id = w.org_id
         JOIN organizations o ON o.id = w.org_id
         JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
        WHERE p.status = 'SCHEDULED'::organic.pin_status
          AND p.scheduled_date <= CURRENT_DATE
          AND w.org_id <> $1::uuid
          AND (p.image_path IS NULL OR b.pinterest_board_id IS NULL OR cs.title IS NULL)
        GROUP BY o.id, o.name
        ORDER BY o.name`,
      [DEMO_ORG]
    );
    for (const r of stuck.rows) {
      const bits = [
        Number(r.no_image) > 0 ? `${r.no_image} without artwork (P4.2.5)` : null,
        Number(r.no_board) > 0
          ? `${r.no_board} onto a board not on Pinterest yet${r.boards.length ? ` (${r.boards.slice(0, 3).join(", ")})` : ""}`
          : null,
        Number(r.no_title) > 0 ? `${r.no_title} without copy (P4.2.8)` : null,
      ].filter(Boolean);
      findings.push({
        store: r.store, kind: "stuck",
        what: `${r.n} pin(s) due since ${r.oldest} that the cron will never pick up — ${bits.join("; ")}`,
      });
    }

    // 2. A plan that is finished and was never handed over. Sixteen pins at
    //    PLANNED publish nothing and report nothing; this is the state The
    //    Longevity store sat in for three days while every task said DONE.
    const unqueued = await pool.query<{ store: string; url: string; n: string; first: string }>(
      `SELECT o.name AS store, u.name AS url, COUNT(*)::text AS n, MIN(p.scheduled_date)::text AS first
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.client_settings cl ON cl.org_id = w.org_id
         JOIN organizations o ON o.id = w.org_id
         JOIN organic.urls u ON u.id = w.url_id
         JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
        WHERE w.status = 'PLANNING'::organic.waterfall_status
          AND p.status = 'PLANNED'::organic.pin_status
          -- Only a plan that COULD go: artwork, copy and a live board. A
          -- half-built cycle is work in progress, not an incident, and
          -- reporting it every morning is how the channel gets muted.
          AND p.image_path IS NOT NULL
          AND cs.title IS NOT NULL
          AND b.pinterest_board_id IS NOT NULL
          AND w.org_id <> $1::uuid
        GROUP BY o.name, u.name
       HAVING COUNT(*) >= 16
        ORDER BY o.name`,
      [DEMO_ORG]
    );
    for (const r of unqueued.rows) {
      findings.push({
        store: r.store, kind: "unqueued",
        what: `"${r.url}" is ready and was never queued — ${r.n} pins from ${r.first} are still PLANNED. Section 3 → Save & queue.`,
      });
    }

    // 2b. A plan whose own start date has passed and which is still being
    //     built. "Ready but not queued" above only catches a plan that could
    //     go; this catches the one that cannot, which is the state that
    //     actually costs days — The Longevity store sat here for three,
    //     with every task pill saying DONE. The reason is named, because
    //     "this cycle is late" without it sends somebody hunting.
    const late = await pool.query<{
      store: string; url: string; first: string;
      no_image: string; no_title: string; no_board: string;
    }>(
      `SELECT o.name AS store, u.name AS url, MIN(p.scheduled_date)::text AS first,
              COUNT(*) FILTER (WHERE p.image_path IS NULL)::text         AS no_image,
              COUNT(*) FILTER (WHERE cs.title IS NULL)::text             AS no_title,
              COUNT(*) FILTER (WHERE b.pinterest_board_id IS NULL)::text AS no_board
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.client_settings cl ON cl.org_id = w.org_id
         JOIN organizations o ON o.id = w.org_id
         JOIN organic.urls u ON u.id = w.url_id
         JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
        WHERE w.status = 'PLANNING'::organic.waterfall_status
          AND p.status = 'PLANNED'::organic.pin_status
          AND w.org_id <> $1::uuid
        GROUP BY o.name, u.name, w.id
       HAVING MIN(p.scheduled_date) < CURRENT_DATE
        ORDER BY o.name`,
      [DEMO_ORG]
    );
    for (const r of late.rows) {
      const bits = [
        Number(r.no_image) > 0 ? `${r.no_image} pins have no artwork (P4.2.5)` : null,
        Number(r.no_title) > 0 ? `${r.no_title} have no copy (P4.2.8)` : null,
        Number(r.no_board) > 0 ? `${r.no_board} sit on a board not yet on Pinterest` : null,
      ].filter(Boolean);
      findings.push({
        store: r.store, kind: "late",
        what: `"${r.url}" was planned to start ${r.first} and is still being built` +
          (bits.length ? ` — ${bits.join("; ")}` : " — nothing missing, it just was never queued"),
      });
    }

    // 3. Pins Pinterest refused. A rate limit re-queues itself and is left
    //    alone; only what stayed FAILED needs a person.
    const failed = await pool.query<{ store: string; n: string; reason: string }>(
      `SELECT o.name AS store, COUNT(*)::text AS n,
              (ARRAY_AGG(p.failure_reason ORDER BY p.scheduled_date DESC))[1] AS reason
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.client_settings cl ON cl.org_id = w.org_id
         JOIN organizations o ON o.id = w.org_id
        WHERE p.status = 'FAILED'::organic.pin_status
          AND p.scheduled_date >= CURRENT_DATE - 14
          AND w.org_id <> $1::uuid
        GROUP BY o.name ORDER BY o.name`,
      [DEMO_ORG]
    );
    for (const r of failed.rows) {
      findings.push({
        store: r.store, kind: "failed",
        what: `${r.n} pin(s) failed in the last fortnight — ${(r.reason ?? "no reason recorded").slice(0, 140)}`,
      });
    }

    // 4. A dead token, but only for a store with something waiting on it. A
    //    store between cycles with an expired token is not an incident.
    const waiting = await pool.query<{ org_id: string; store: string }>(
      `SELECT DISTINCT cl.org_id::text, o.name AS store
         FROM organic.client_settings cl
         JOIN organizations o ON o.id = cl.org_id
         JOIN organic.waterfalls w ON w.org_id = cl.org_id
         JOIN organic.pins p ON p.waterfall_id = w.id
        WHERE p.status = 'SCHEDULED'::organic.pin_status
          AND cl.org_id <> $1::uuid`,
      [DEMO_ORG]
    );
    if ((waiting.rowCount ?? 0) > 0) {
      const { failed: dead } = await pinterestClientsForOrgs(waiting.rows.map((r) => r.org_id));
      const nameOf = new Map(waiting.rows.map((r) => [r.org_id, r.store]));
      for (const f of dead) {
        findings.push({
          store: nameOf.get(f.org_id) ?? f.org_name, kind: "token",
          what: `Pinterest connection is down and pins are queued — ${f.message}`,
        });
      }
    }

    const stores = [...new Set(findings.map((f) => f.store))];
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[organic-health] EINDCONTROLE: ${findings.length} bevinding(en) over ${stores.length} store(s) in ${seconds}s`
    );

    if (findings.length > 0) {
      // One message, grouped by store, so the channel carries a morning
      // briefing rather than twenty separate pings.
      const byStore = new Map<string, Finding[]>();
      for (const f of findings) byStore.set(f.store, [...(byStore.get(f.store) ?? []), f]);
      const body = [...byStore.entries()]
        .map(([store, fs]) => `*${store}*\n${fs.map((f) => `• ${f.what}`).join("\n")}`)
        .join("\n\n");
      await alertCronFailure({
        cron: "organic-health",
        // Not "failed": the run worked. These are stores that need a person.
        level: "attention",
        message:
          `${findings.length} thing(s) standing between ${stores.length} store(s) and publishing:\n\n${body}`,
      });
    }

    return NextResponse.json({
      ok: true,
      stores_with_findings: stores.length,
      findings,
      seconds: Number(seconds),
    });
  } catch (e) {
    await alertCronFailure({
      cron: "organic-health",
      level: "failed",
      message: "De organic-watchdog zelf is gevallen — er is vanochtend niets gecontroleerd.",
      error: e,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
