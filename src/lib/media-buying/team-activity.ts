/**
 * Team Activity — weekly manager view of what the media buyers actually did
 * in the ad account and organic profile.
 *
 * All heavy aggregation lives in Postgres RPCs (migrations 032/034):
 *
 *   team_paid_activity_for_org(org_id, weeks_back)  → { week, launched, paused }
 *   team_organic_activity(weeks_back)               → { week, org, boards, pins }
 *
 * We call them via a direct pg connection (DATABASE_URL) rather than
 * PostgREST because PostgREST enforces a short statement_timeout (~10s) that
 * a heavy LAG() sweep over ~140k campaign snapshots blows on the biggest
 * advertisers. pg lets us set our own timeout per request.
 *
 * Paid signals (per campaign, per week):
 *   - launched: Pinterest `created_time` falls in the week
 *   - paused: status transitioned ACTIVE (or DRAFT) → PAUSED that week
 *
 * Organic signals (per week):
 *   - boards_created: boards.created_at in the week
 *   - pins_added: pins.created_at in the week
 */
import { Pool, types } from "pg";
import { mediaBuyerOptions } from "./config";

// Force Postgres DATE (OID 1082) to come back as a raw "YYYY-MM-DD" string
// instead of a JS Date at LOCAL midnight — which shifts by one day when the
// process TZ isn't UTC. Otherwise "Monday 2026-08-10" written from a
// CEST-run bootstrap comes back as "2026-08-09" on the wire.
types.setTypeParser(1082, (val) => val);

export interface WeekBucket {
  /** Monday of the ISO week, YYYY-MM-DD. */
  week_start: string;
  /** Total across all buyers/orgs. */
  total: number;
  /** Breakdown per media_buyer (unassigned bucket keyed as "(unassigned)"). */
  by_buyer: Record<string, number>;
}

/** One store's counts for one week. Used to render the per-store activity
 *  table so the manager can see exactly which stores were touched. */
export interface StoreWeekRow {
  org_id: string;
  store_name: string;
  media_buyer: string;
  week_start: string;
  launched: number;
  paused: number;
  /** Distinct ads that went ACTIVE→PAUSED in the window, filtered to ads
   *  whose parent campaign is CURRENTLY still active — otherwise ads
   *  paused as a byproduct of pausing the whole campaign would double-count
   *  and drown the real creative-optimization signal. */
  ads_paused: number;
  /** Distinct campaigns whose daily_spend_cap changed value inside the
   *  window (scaling up OR down). */
  budget_changed: number;
  /** Distinct days inside the window that had ANY paid action for this
   *  store — best proxy for "how often did the buyer touch this account".
   *  Pinterest doesn't expose login history via API. */
  active_days: number;
  boards_created: number;
  pins_added: number;
}

export interface TeamActivityResponse {
  weeks: string[]; // oldest → newest
  paid: {
    launched: WeekBucket[];
    paused: WeekBucket[];
  };
  organic: {
    boards_created: WeekBucket[];
    pins_added: WeekBucket[];
  };
  buyers: string[];
  /** All configured+active stores, with a per-week row for the last
   *  WEEKS_BACK weeks — one row per (org × week). Zeroed if no activity. */
  per_store: StoreWeekRow[];
  /** Store name + buyer, keyed by org_id, for UI lookups. */
  stores: Array<{ org_id: string; store_name: string; media_buyer: string }>;
}

const WEEKS_BACK = 8;
// Small concurrency + generous timeout. The paid RPC now covers 5 metrics
// including an ads LAG-scan (much larger table than campaigns), so per-org
// runtime doubled and even MayCosmetics can occasionally touch 90s.
const CONCURRENCY = 2;
const STATEMENT_TIMEOUT_MS = 120_000;

// Module-scoped pool so consecutive requests reuse the same connections.
// statement_timeout is set at pool level so every query gets 60s regardless
// of what the pooler's default is (the transaction-mode pooler doesn't
// preserve per-query SET statements).
let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  pool = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 8,
    statement_timeout: 120_000,
    query_timeout: 120_000,
  });
  return pool;
}

/** Coerce Postgres DATE (JS Date | string) into YYYY-MM-DD. */
function isoDate(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "string") return raw.slice(0, 10);
  return "";
}

async function loadBuyerMap(): Promise<{
  byOrg: Map<string, { buyer: string; store_name: string }>;
  buyers: Set<string>;
}> {
  const { rows } = await getPool().query<{
    org_id: string;
    media_buyer: string | null;
    store_name: string;
  }>(
    `SELECT s.org_id, s.media_buyer, o.name AS store_name
       FROM store_settings s
       JOIN organizations o ON o.id = s.org_id
      WHERE s.is_active IS DISTINCT FROM false`
  );
  const byOrg = new Map<string, { buyer: string; store_name: string }>();
  const buyers = new Set<string>();
  for (const r of rows) {
    const b = r.media_buyer ?? "(unassigned)";
    byOrg.set(r.org_id, { buyer: b, store_name: r.store_name });
    if (b !== "(unassigned)") buyers.add(b);
  }
  return { byOrg, buyers };
}

function rollupToBuckets(
  weeks: string[],
  rows: { week_start: string; org_id: string; count: number }[],
  byOrg: Map<string, { buyer: string; store_name: string }>
): WeekBucket[] {
  const byWeek = new Map(
    weeks.map((w) => [w, { total: 0, by_buyer: {} as Record<string, number> }])
  );
  for (const r of rows) {
    const b = byWeek.get(r.week_start);
    if (!b || !r.count) continue;
    const buyer = byOrg.get(r.org_id)?.buyer ?? "(unassigned)";
    b.total += r.count;
    b.by_buyer[buyer] = (b.by_buyer[buyer] ?? 0) + r.count;
  }
  return weeks.map((w) => ({ week_start: w, ...byWeek.get(w)! }));
}

/** Build one row per (org × week) with all four metrics on it — the shape
 *  the per-store table renders. */
function buildPerStoreRows(
  weeks: string[],
  byOrg: Map<string, { buyer: string; store_name: string }>,
  paidRows: Array<{
    week_start: string; org_id: string;
    launched: number; paused: number;
    ads_paused: number; budget_changed: number; active_days: number;
  }>,
  organicRows: Array<{ week_start: string; org_id: string; boards_created: number; pins_added: number }>
): StoreWeekRow[] {
  const key = (org: string, w: string) => `${org}::${w}`;
  const map = new Map<string, StoreWeekRow>();
  const orgIds = Array.from(byOrg.keys());
  for (const org of orgIds) {
    const info = byOrg.get(org)!;
    for (const w of weeks) {
      map.set(key(org, w), {
        org_id: org,
        store_name: info.store_name,
        media_buyer: info.buyer,
        week_start: w,
        launched: 0,
        paused: 0,
        ads_paused: 0,
        budget_changed: 0,
        active_days: 0,
        boards_created: 0,
        pins_added: 0,
      });
    }
  }
  for (const r of paidRows) {
    const row = map.get(key(r.org_id, r.week_start));
    if (row) {
      row.launched += r.launched;
      row.paused += r.paused;
      row.ads_paused += r.ads_paused;
      row.budget_changed += r.budget_changed;
      // active_days is a distinct-day count, not a sum; but paidRows only has
      // one entry per (org, week) so += is equivalent to = here.
      row.active_days = Math.max(row.active_days, r.active_days);
    }
  }
  for (const r of organicRows) {
    const row = map.get(key(r.org_id, r.week_start));
    if (row) {
      row.boards_created += r.boards_created;
      row.pins_added += r.pins_added;
    }
  }
  return Array.from(map.values());
}

export async function computeTeamActivity(): Promise<TeamActivityResponse> {
  const p = getPool();
  const { byOrg, buyers } = await loadBuyerMap();
  const orgIds = Array.from(byOrg.keys());

  // Paid: per-org via worker pool. Each call caps to that org's campaign
  // subset so the LAG() sweep stays under statement_timeout.
  const paidRows: Array<{
    week_start: string;
    org_id: string;
    launched: number;
    paused: number;
    ads_paused: number;
    budget_changed: number;
    active_days: number;
  }> = [];
  let cursor = 0;
  async function worker() {
    const client = await p.connect();
    try {
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      while (true) {
        const i = cursor++;
        if (i >= orgIds.length) return;
        const oid = orgIds[i];
        const { rows } = await client.query<{
          week_start: Date;
          launched: string;
          paused: string;
          ads_paused: string;
          budget_changed: string;
          active_days: string;
        }>(`SELECT * FROM team_paid_activity_for_org($1, $2)`, [oid, WEEKS_BACK]);
        for (const r of rows) {
          paidRows.push({
            week_start: isoDate(r.week_start),
            org_id: oid,
            launched: Number(r.launched),
            paused: Number(r.paused),
            ads_paused: Number(r.ads_paused),
            budget_changed: Number(r.budget_changed),
            active_days: Number(r.active_days),
          });
        }
      }
    } finally {
      client.release();
    }
  }

  const organicPromise = (async () => {
    const client = await p.connect();
    try {
      await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      const { rows } = await client.query<{
        week_start: Date;
        org_id: string;
        boards_created: string;
        pins_added: string;
      }>(`SELECT * FROM team_organic_activity($1)`, [WEEKS_BACK]);
      return rows.map((r) => ({
        week_start: isoDate(r.week_start),
        org_id: r.org_id,
        boards_created: Number(r.boards_created),
        pins_added: Number(r.pins_added),
      }));
    } finally {
      client.release();
    }
  })();

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, orgIds.length) },
    () => worker()
  );
  const [, organicRows] = await Promise.all([Promise.all(workers), organicPromise]);

  // Determine week sequence (oldest → newest) from what came back.
  const weekSet = new Set<string>();
  for (const r of paidRows) if (r.week_start) weekSet.add(r.week_start);
  for (const r of organicRows) if (r.week_start) weekSet.add(r.week_start);
  const weekSeq = Array.from(weekSet).sort();

  return {
    weeks: weekSeq,
    paid: {
      launched: rollupToBuckets(
        weekSeq,
        paidRows.map((r) => ({ week_start: r.week_start, org_id: r.org_id, count: r.launched })),
        byOrg
      ),
      paused: rollupToBuckets(
        weekSeq,
        paidRows.map((r) => ({ week_start: r.week_start, org_id: r.org_id, count: r.paused })),
        byOrg
      ),
    },
    organic: {
      boards_created: rollupToBuckets(
        weekSeq,
        organicRows.map((r) => ({
          week_start: r.week_start,
          org_id: r.org_id,
          count: r.boards_created,
        })),
        byOrg
      ),
      pins_added: rollupToBuckets(
        weekSeq,
        organicRows.map((r) => ({
          week_start: r.week_start,
          org_id: r.org_id,
          count: r.pins_added,
        })),
        byOrg
      ),
    },
    // The roster too, not only who is currently assigned: a buyer who has just
    // joined has to appear in the filter, otherwise "no activity" and "not on
    // the team" look identical here.
    buyers: mediaBuyerOptions(buyers),
    per_store: buildPerStoreRows(weekSeq, byOrg, paidRows, organicRows),
    stores: Array.from(byOrg.entries())
      .map(([org_id, info]) => ({
        org_id,
        store_name: info.store_name,
        media_buyer: info.buyer,
      }))
      .sort((a, b) => a.store_name.localeCompare(b.store_name)),
  };
}

/**
 * Fast path used by the API: read the pre-computed snapshot from
 * team_activity_cache. A cron job (see /api/cron/refresh-team-activity)
 * calls computeTeamActivity() and writes it there every 6 hours. Falls
 * back to a live compute the first time the cache is empty.
 */
export async function readCachedTeamActivity(): Promise<{
  data: TeamActivityResponse;
  refreshed_at: string | null;
}> {
  const { rows } = await getPool().query<{
    data: TeamActivityResponse;
    refreshed_at: Date;
  }>(`SELECT data, refreshed_at FROM team_activity_cache WHERE id = 'default'`);
  if (rows.length) {
    return {
      data: rows[0].data,
      refreshed_at: rows[0].refreshed_at.toISOString(),
    };
  }
  // Cold start — compute inline once, cache it, return it.
  const data = await computeTeamActivity();
  await writeCachedTeamActivity(data);
  return { data, refreshed_at: new Date().toISOString() };
}

/** Called by the refresh cron. Idempotent — a single-row upsert on
 *  team_activity_cache. */
export async function writeCachedTeamActivity(
  data: TeamActivityResponse
): Promise<void> {
  await getPool().query(
    `INSERT INTO team_activity_cache (id, data, refreshed_at)
     VALUES ('default', $1::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, refreshed_at = EXCLUDED.refreshed_at`,
    [JSON.stringify(data)]
  );
}
