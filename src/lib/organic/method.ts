/**
 * STAGE 5 · method intelligence.
 *
 * What only an agency running fifty accounts can know, and the individual
 * consultant cannot. This is the compounding asset: measured on our own
 * book, it is worth more in two years than the consultancy that started
 * it.
 *
 * Every query here is scoped to stores that carry organic.client_settings
 * — that is, stores actually running this method. organic.boards holds
 * rows for roughly fifty orgs whose boards were imported by the main
 * dashboard and which never entered the organic workflow at all. Counting
 * those would have this screen report a fifty-one-store finding drawn
 * from a one-store book, which is the precise failure this module exists
 * to avoid.
 *
 * The discipline that makes it worth anything is refusing to report a
 * finding that the sample cannot support. Every aggregate here carries
 * its store count and its observation count, and anything under the
 * threshold is returned as `insufficient` rather than as a small number
 * that will be read as a fact and quoted in a pitch.
 */
import { organicPool } from "./db";

/** Below this many distinct stores, a cross-client pattern is an anecdote. */
export const MIN_STORES = 3;
/** And below this many observations it is noise even across enough stores. */
export const MIN_OBSERVATIONS = 20;

export interface MethodFinding<T> {
  rows: T[];
  stores: number;
  observations: number;
  /** True when the sample is too thin to draw a conclusion from. The UI
   *  shows what has been collected so far and what it still needs. */
  insufficient: boolean;
  needs: { stores: number; observations: number };
}

function wrap<T>(rows: T[], stores: number, observations: number): MethodFinding<T> {
  return {
    rows, stores, observations,
    insufficient: stores < MIN_STORES || observations < MIN_OBSERVATIONS,
    needs: { stores: MIN_STORES, observations: MIN_OBSERVATIONS },
  };
}

/* ------------------------------------------------------------------ *
 * Board archetypes across clients
 * ------------------------------------------------------------------ */

export interface ArchetypeRow {
  archetype: string;
  stores: number;
  boards: number;
  pins: number;
  clicks: number;
  saves: number;
  /** Clicks per pin. The comparable unit — a board with 400 pins will
   *  always out-total one with 40, which says nothing about the board. */
  clicks_per_pin: number | null;
  saves_per_pin: number | null;
}

export async function loadBoardArchetypes(): Promise<MethodFinding<ArchetypeRow>> {
  const pool = organicPool();
  const r = await pool.query<{
    archetype: string; stores: string; boards: string; pins: string;
    clicks: string | null; saves: string | null;
  }>(
    `SELECT b.breadth::text || ' · ' || COALESCE(b.origin::text, 'unknown') AS archetype,
            COUNT(DISTINCT b.org_id)                     AS stores,
            COUNT(DISTINCT b.id)                         AS boards,
            COUNT(DISTINCT p.id)                         AS pins,
            SUM(pp.outbound_clicks)                      AS clicks,
            SUM(pp.saves)                                AS saves
       FROM organic.boards b
       JOIN organic.client_settings cs ON cs.org_id = b.org_id
       LEFT JOIN organic.pins p ON p.board_id = b.id AND p.status = 'PUBLISHED'
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      WHERE b.breadth IS NOT NULL
      GROUP BY 1
      ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST`
  );

  const rows = r.rows.map((x) => {
    const pins = Number(x.pins);
    const clicks = x.clicks == null ? 0 : Number(x.clicks);
    const saves = x.saves == null ? 0 : Number(x.saves);
    return {
      archetype: x.archetype,
      stores: Number(x.stores),
      boards: Number(x.boards),
      pins, clicks, saves,
      clicks_per_pin: pins > 0 ? Math.round((clicks / pins) * 100) / 100 : null,
      saves_per_pin: pins > 0 ? Math.round((saves / pins) * 100) / 100 : null,
    };
  });

  const stores = Math.max(0, ...rows.map((x) => x.stores));
  const obs = rows.reduce((n, x) => n + x.pins, 0);
  return wrap(rows, stores, obs);
}

/* ------------------------------------------------------------------ *
 * URL reasons, aggregated
 * ------------------------------------------------------------------ */

export interface ReasonRow {
  reason: string;
  stores: number;
  urls: number;
  waterfalls: number;
  pins: number;
  clicks: number;
  saves: number;
  clicks_per_pin: number | null;
}

export async function loadUrlReasons(): Promise<MethodFinding<ReasonRow>> {
  const pool = organicPool();
  const r = await pool.query<{
    reason: string; stores: string; urls: string; waterfalls: string;
    pins: string; clicks: string | null; saves: string | null;
  }>(
    `SELECT u.reason::text AS reason,
            COUNT(DISTINCT u.org_id)  AS stores,
            COUNT(DISTINCT u.id)      AS urls,
            COUNT(DISTINCT w.id)      AS waterfalls,
            COUNT(DISTINCT p.id)      AS pins,
            SUM(pp.outbound_clicks)   AS clicks,
            SUM(pp.saves)             AS saves
       FROM organic.urls u
       JOIN organic.client_settings cs ON cs.org_id = u.org_id
       LEFT JOIN organic.waterfalls w ON w.url_id = u.id
       LEFT JOIN organic.pins p ON p.waterfall_id = w.id AND p.status = 'PUBLISHED'
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      GROUP BY u.reason
      ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST`
  );

  const rows = r.rows.map((x) => {
    const pins = Number(x.pins);
    const clicks = x.clicks == null ? 0 : Number(x.clicks);
    return {
      reason: x.reason,
      stores: Number(x.stores), urls: Number(x.urls),
      waterfalls: Number(x.waterfalls), pins,
      clicks, saves: x.saves == null ? 0 : Number(x.saves),
      clicks_per_pin: pins > 0 ? Math.round((clicks / pins) * 100) / 100 : null,
    };
  });

  const stores = Math.max(0, ...rows.map((x) => x.stores));
  return wrap(rows, stores, rows.reduce((n, x) => n + x.pins, 0));
}

/* ------------------------------------------------------------------ *
 * Daily pin target by account class — measured, not assumed
 * ------------------------------------------------------------------ */

export interface PinTargetRow {
  account_class: string;
  stores: number;
  /** What we currently set. */
  mean_target: number | null;
  /** What actually got published per active day. The gap between the two
   *  is the finding: a target nobody hits is a number, not a plan. */
  mean_published_per_day: number | null;
  clicks_per_pin: number | null;
}

export async function loadPinTargets(): Promise<MethodFinding<PinTargetRow>> {
  const pool = organicPool();
  const r = await pool.query<{
    account_class: string; stores: string; mean_target: string | null;
    pins: string; active_days: string | null; clicks: string | null;
  }>(
    `SELECT COALESCE(cs.account_class::text, 'unset') AS account_class,
            COUNT(DISTINCT cs.org_id)                 AS stores,
            AVG(cs.daily_pin_target)                  AS mean_target,
            COUNT(DISTINCT p.id)                      AS pins,
            COUNT(DISTINCT p.scheduled_date)          AS active_days,
            SUM(pp.outbound_clicks)                   AS clicks
       FROM organic.client_settings cs
       LEFT JOIN organic.waterfalls w ON w.org_id = cs.org_id
       LEFT JOIN organic.pins p ON p.waterfall_id = w.id AND p.status = 'PUBLISHED'
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      GROUP BY 1
      ORDER BY 1`
  );

  const rows = r.rows.map((x) => {
    const pins = Number(x.pins);
    const days = x.active_days == null ? 0 : Number(x.active_days);
    const clicks = x.clicks == null ? 0 : Number(x.clicks);
    return {
      account_class: x.account_class,
      stores: Number(x.stores),
      mean_target: x.mean_target == null ? null : Math.round(Number(x.mean_target) * 10) / 10,
      mean_published_per_day: days > 0 ? Math.round((pins / days) * 10) / 10 : null,
      clicks_per_pin: pins > 0 ? Math.round((clicks / pins) * 100) / 100 : null,
    };
  });

  const stores = rows.reduce((n, x) => n + x.stores, 0);
  return wrap(rows, stores, rows.reduce((n, x) => n + (x.mean_published_per_day ?? 0), 0));
}

/* ------------------------------------------------------------------ *
 * Seasonal windows — theory against outcome
 * ------------------------------------------------------------------ */

export interface SeasonalRow {
  term: string;
  stores: number;
  /** What the SOP says: publish 6–10 weeks before the peak. */
  planned_lead_days: number | null;
  /** What we actually did. */
  actual_lead_days: number | null;
  pins: number;
  clicks: number;
}

export async function loadSeasonalWindows(): Promise<MethodFinding<SeasonalRow>> {
  const pool = organicPool();
  const r = await pool.query<{
    term: string; stores: string; planned: string | null;
    actual: string | null; pins: string; clicks: string | null;
  }>(
    `SELECT k.term,
            COUNT(DISTINCT k.org_id) AS stores,
            AVG(k.peak_window_start - k.ramp_up_start)   AS planned,
            AVG(k.peak_window_start - p.scheduled_date)  AS actual,
            COUNT(DISTINCT p.id)                         AS pins,
            SUM(pp.outbound_clicks)                      AS clicks
       FROM organic.keywords k
       JOIN organic.client_settings cs ON cs.org_id = k.org_id
       LEFT JOIN organic.url_keywords uk ON uk.keyword_id = k.id
       LEFT JOIN organic.waterfalls w ON w.url_id = uk.url_id
       LEFT JOIN organic.pins p ON p.waterfall_id = w.id AND p.status = 'PUBLISHED'
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      WHERE k.seasonal_type = 'SEASONAL'::organic.seasonal_type
        AND k.peak_window_start IS NOT NULL
      GROUP BY k.term
      ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST
      LIMIT 40`
  );

  const rows = r.rows.map((x) => ({
    term: x.term,
    stores: Number(x.stores),
    planned_lead_days: x.planned == null ? null : Math.round(Number(x.planned)),
    actual_lead_days: x.actual == null ? null : Math.round(Number(x.actual)),
    pins: Number(x.pins),
    clicks: x.clicks == null ? 0 : Number(x.clicks),
  }));

  const stores = Math.max(0, ...rows.map((x) => x.stores));
  return wrap(rows, stores, rows.reduce((n, x) => n + x.pins, 0));
}

/* ------------------------------------------------------------------ *
 * Keyword volume decay across the shared cache
 * ------------------------------------------------------------------ */

export interface CacheHealth {
  terms: number;
  shared_terms: number;
  stores_contributing: number;
  fresh: number;
  ageing: number;
  stale: number;
  not_found: number;
  /** Median age of a cached lookup, in days. */
  median_age_days: number | null;
  /** Terms held by the most stores — the spine of the shared bank. */
  most_shared: Array<{ term: string; volume: number | null; stores: number; age_days: number | null }>;
}

export async function loadCacheHealth(): Promise<CacheHealth> {
  const pool = organicPool();
  const [summary, shared] = await Promise.all([
    pool.query<{
      terms: string; contributors: string; fresh: string; ageing: string;
      stale: string; not_found: string; median_age: string | null;
    }>(
      `SELECT COUNT(*)                                                              AS terms,
              COUNT(DISTINCT looked_up_by)                                          AS contributors,
              COUNT(*) FILTER (WHERE looked_up_at > now() - interval '90 days')      AS fresh,
              COUNT(*) FILTER (WHERE looked_up_at <= now() - interval '90 days'
                                 AND looked_up_at > now() - interval '180 days')     AS ageing,
              COUNT(*) FILTER (WHERE looked_up_at <= now() - interval '180 days')    AS stale,
              COUNT(*) FILTER (WHERE not_found)                                      AS not_found,
              PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (now() - looked_up_at)) / 86400)         AS median_age
         FROM organic.keyword_volume_cache`),
    pool.query<{ term: string; volume: number | null; stores: string; age_days: string | null }>(
      `SELECT c.term, c.volume,
              COUNT(DISTINCT k.org_id) AS stores,
              ROUND(EXTRACT(EPOCH FROM (now() - c.looked_up_at)) / 86400) AS age_days
         FROM organic.keyword_volume_cache c
         JOIN organic.keywords k ON k.term = c.term
         JOIN organic.client_settings cs ON cs.org_id = k.org_id
        GROUP BY c.term, c.volume, c.looked_up_at
       HAVING COUNT(DISTINCT k.org_id) > 1
        ORDER BY COUNT(DISTINCT k.org_id) DESC, c.volume DESC NULLS LAST
        LIMIT 15`),
  ]);

  const s = summary.rows[0];
  const n = (v: string | null | undefined) => (v == null ? 0 : Number(v));

  return {
    terms: n(s?.terms),
    shared_terms: shared.rowCount ?? 0,
    stores_contributing: n(s?.contributors),
    fresh: n(s?.fresh),
    ageing: n(s?.ageing),
    stale: n(s?.stale),
    not_found: n(s?.not_found),
    median_age_days: s?.median_age == null ? null : Math.round(Number(s.median_age)),
    most_shared: shared.rows.map((x) => ({
      term: x.term, volume: x.volume, stores: Number(x.stores),
      age_days: x.age_days == null ? null : Number(x.age_days),
    })),
  };
}
