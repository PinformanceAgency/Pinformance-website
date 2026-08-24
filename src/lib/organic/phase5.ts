/**
 * Phase 5 — analytics tab and the feedback loop.
 *
 * Three things live here:
 *   1. Fetch the 13 organic KPIs from Pinterest via the shared client
 *      (content_type=ORGANIC), compared to the P1.2.13 baseline.
 *   2. Feedback loop: attribute pin performance back to the decisions
 *      that made it — the "why this URL matters" reason, the keyword,
 *      the board breadth. Aggregated over pin_performance.
 *   3. Ads candidates: organic winners that outperform a threshold and
 *      should be re-run as paid.
 */
import { organicPool } from "./db";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

// ---------- Pinterest fetch --------------------------------------------------

async function pinterestFor(orgId: string): Promise<PinterestClient | null> {
  const pool = organicPool();
  const r = await pool.query<{ token_enc: string | null }>(
    `SELECT pinterest_access_token_encrypted AS token_enc FROM public.organizations WHERE id = $1`,
    [orgId]
  );
  const enc = r.rows[0]?.token_enc;
  if (!enc) return null;
  return new PinterestClient(decrypt(enc), false);
}

/** Sum daily metrics into a flat totals object. Handles Pinterest's
 *  {all:{daily_metrics:[{metrics:{IMPRESSION:...}}]}} shape. */
function sumDailies(daily: Array<{ metrics: Record<string, number> }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of daily) {
    for (const [k, v] of Object.entries(day.metrics ?? {})) {
      out[k] = (out[k] ?? 0) + Number(v || 0);
    }
  }
  return out;
}

export interface AnalyticsFetch {
  ok: boolean;
  reason?: string;
  start_date: string;
  end_date: string;
  totals: Record<string, number> | null;
  top_pins: Array<{ pin_id: string; metrics: Record<string, number> }> | null;
}

/** Pull organic KPIs + top pins for a date range. Filtered to ORGANIC
 *  content type (Pinterest also exposes CLAIMED / PROMOTED, we only want
 *  organic-attributable here per the SOP). Includes CONVERSION metrics
 *  (Pinterest Conversion Insights) when available, and splits totals
 *  into Your Pins vs Other Pins so user-saved-from-site traffic doesn't
 *  get attributed to our work. */
export async function fetchOrganicAnalytics(orgId: string, start: string, end: string): Promise<AnalyticsFetch> {
  const client = await pinterestFor(orgId);
  if (!client) {
    return { ok: false, reason: "no pinterest token on organisation", start_date: start, end_date: end, totals: null, top_pins: null };
  }
  try {
    const raw = await client.getUserAccountAnalytics(start, end);
    const totals = sumDailies(raw.all?.daily_metrics ?? []);
    const top = await client.getTopPins(start, end, "OUTBOUND_CLICK",
      ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"], "ORGANIC");
    // Try to fetch conversion + Your-vs-Other splits. Silently degrade
    // if the endpoint/metric isn't available on this account tier.
    const [conv, other] = await Promise.all([
      fetchConversionMetrics(client, start, end),
      fetchOtherPinsAnalytics(client, start, end),
    ]);
    return {
      ok: true, start_date: start, end_date: end,
      totals: { ...totals, ...conv, ...other },
      top_pins: top.pins ?? [],
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message, start_date: start, end_date: end, totals: null, top_pins: null };
  }
}

async function fetchConversionMetrics(client: PinterestClient, start: string, end: string): Promise<Record<string, number>> {
  // Pinterest Conversion Insights exposes: PAGE_VISIT, ADD_TO_CART,
  // CHECKOUT, CUSTOM (conversions), REVENUE. Not every account has
  // the tag firing — soft-fail returns zeros with a _stale marker.
  try {
    const raw = await (client as unknown as {
      getUserAccountAnalytics: (s: string, e: string, m?: string[]) => Promise<{ all?: { daily_metrics?: Array<{ metrics: Record<string, number> }> } }>;
    }).getUserAccountAnalytics(start, end, ["PAGE_VISIT","ADD_TO_CART","CHECKOUT","CONVERSIONS","REVENUE"]);
    return sumDailies(raw.all?.daily_metrics ?? []);
  } catch { return {}; }
}

async function fetchOtherPinsAnalytics(client: PinterestClient, start: string, end: string): Promise<Record<string, number>> {
  // Attempt an "Other Pins" pull — pins users saved FROM the claimed
  // domain but that are not owned by the client account. Pinterest
  // exposes this via a separate top_pins call; if the endpoint variant
  // isn't available on this account tier, we soft-fail with zeros.
  try {
    const top = await client.getTopPins(start, end, "IMPRESSION",
      ["IMPRESSION","SAVE"], "OTHERS");
    const totals = { OTHER_IMPRESSION: 0, OTHER_SAVE: 0 };
    for (const p of top.pins ?? []) {
      totals.OTHER_IMPRESSION += Number(p.metrics?.IMPRESSION || 0);
      totals.OTHER_SAVE       += Number(p.metrics?.SAVE || 0);
    }
    return totals;
  } catch { return {}; }
}

// ---------- baseline --------------------------------------------------------

export interface BaselineRow {
  org_id: string;
  measured_from: string | null;
  measured_to: string | null;
  impressions: number | null;
  engagements: number | null;
  outbound_clicks: number | null;
  pin_saves: number | null;
  profile_visits: number | null;
  monthly_views: number | null;
  followers_start: number | null;
  followers_end: number | null;
  top_click_pin_clicks: number | null;
  top_save_pin_saves: number | null;
  engagement_rate: number | null;
  audience_top_country_pct: number | null;
  audience_top_age_bracket: string | null;
  // Conversion metrics (Pinterest Conversion Insights) — deviation 8
  page_visits: number | null;
  add_to_cart: number | null;
  checkouts: number | null;
  conversions: number | null;
  revenue: number | null;
  // Your Pins vs Other Pins split — deviation 10
  other_impressions: number | null;
  other_saves: number | null;
}

export async function loadBaseline(orgId: string): Promise<BaselineRow | null> {
  return loadBaselinePeriod(orgId, "last_30d");
}

/** 3-period baseline (deviation 9): last_30d + month_-1 + month_-2, side by
 *  side so the analytics tab shows trend direction, not a single snapshot. */
export async function loadBaselinePeriods(orgId: string): Promise<Record<string, BaselineRow | null>> {
  return {
    "last_30d": await loadBaselinePeriod(orgId, "last_30d"),
    "month_-1": await loadBaselinePeriod(orgId, "month_-1"),
    "month_-2": await loadBaselinePeriod(orgId, "month_-2"),
  };
}

async function loadBaselinePeriod(orgId: string, period: "last_30d"|"month_-1"|"month_-2"): Promise<BaselineRow | null> {
  const pool = organicPool();
  const r = await pool.query<BaselineRow>(
    `SELECT org_id::text, measured_from::text, measured_to::text,
            impressions, engagements, outbound_clicks, pin_saves, profile_visits,
            monthly_views, followers_start, followers_end,
            top_click_pin_clicks, top_save_pin_saves,
            engagement_rate, audience_top_country_pct, audience_top_age_bracket,
            page_visits, add_to_cart, checkouts, conversions, revenue,
            other_impressions, other_saves
       FROM organic.baseline_kpis WHERE org_id = $1 AND period = $2`,
    [orgId, period]
  );
  if (r.rowCount === 0 && period === "last_30d") return await seedBaselineFromP1_2_13(orgId);
  return r.rows[0] ?? null;
}

/** Fallback: parse the "Baseline KPIs (3mo):" note format used by the
 *  P1.2.13 form (phase 1 completion), so orgs that filled the form get a
 *  baseline even before they touch phase 5. */
async function seedBaselineFromP1_2_13(orgId: string): Promise<BaselineRow | null> {
  const pool = organicPool();
  const t = await pool.query<{ notes: string | null }>(
    `SELECT notes FROM organic.client_tasks WHERE org_id = $1 AND task_id = 'P1.2.13'`,
    [orgId]
  );
  const notes = t.rows[0]?.notes;
  if (!notes || !/Baseline KPIs/i.test(notes)) return null;
  const kv = new Map<string, string>();
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
    if (m) kv.set(m[1].toLowerCase(), m[2]);
  }
  const num = (k: string) => {
    const v = kv.get(k); if (!v) return null;
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return isFinite(n) ? n : null;
  };
  await pool.query(
    `INSERT INTO organic.baseline_kpis (
       org_id, impressions, engagements, engagement_rate,
       outbound_clicks, pin_saves, profile_visits, monthly_views,
       followers_start, followers_end, top_click_pin_clicks, top_save_pin_saves,
       audience_top_country_pct, audience_top_age_bracket
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (org_id) DO NOTHING`,
    [orgId, num("impressions"), num("engagements"), num("engagement_rate"),
     num("outbound_clicks"), num("pin_saves"), num("profile_visits"), num("monthly_views"),
     num("followers_start"), num("followers_end"), num("top_click_pin_clicks"), num("top_save_pin_saves"),
     num("audience_top_country_pct"), kv.get("audience_top_age_bracket") ?? null]
  );
  return loadBaseline(orgId);
}

export interface DeltaRow { name: string; baseline: number | null; current: number | null; delta: number | null; delta_pct: number | null }

/** Build the delta table by subtracting current totals from baseline. Only
 *  KPIs present in both sides are shown. */
export function computeDeltas(baseline: BaselineRow | null, current: Record<string, number> | null): DeltaRow[] {
  if (!current) return [];
  const b = baseline;
  const map: Array<[string, number | null, string]> = [
    ["Impressions",     b?.impressions ?? null,     "IMPRESSION"],
    ["Engagements",     b?.engagements ?? null,     "ENGAGEMENT"],
    ["Outbound clicks", b?.outbound_clicks ?? null, "OUTBOUND_CLICK"],
    ["Pin saves",       b?.pin_saves ?? null,       "SAVE"],
    ["Pin clicks",      null,                       "PIN_CLICK"],
    ["Engagement rate", b?.engagement_rate ?? null, "ENGAGEMENT_RATE"],
    ["Save rate",       null,                       "SAVE_RATE"],
  ];
  const rows: DeltaRow[] = [];
  for (const [name, baselineVal, currentKey] of map) {
    const cur = current[currentKey] ?? null;
    let delta: number | null = null;
    let deltaPct: number | null = null;
    if (baselineVal != null && cur != null) {
      delta = cur - baselineVal;
      deltaPct = baselineVal !== 0 ? Math.round((delta / baselineVal) * 100) : null;
    }
    rows.push({ name, baseline: baselineVal, current: cur, delta, delta_pct: deltaPct });
  }
  return rows;
}

// ---------- feedback loop ---------------------------------------------------

export interface FeedbackAggregate {
  key: string;
  label: string;
  pin_count: number;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  ctr_per_1000: number; // clicks per 1k impressions
  save_rate_per_1000: number;
}

async function aggregate(
  orgId: string,
  from: string,
  to: string,
  groupSQL: string,
  labelSQL: string,
  joinExtras = ""
): Promise<FeedbackAggregate[]> {
  const pool = organicPool();
  const q = `
    SELECT ${groupSQL} AS key, ${labelSQL} AS label,
           COUNT(DISTINCT p.id)::int AS pin_count,
           COALESCE(SUM(pp.impressions),0)::int AS impressions,
           COALESCE(SUM(pp.saves),0)::int AS saves,
           COALESCE(SUM(pp.outbound_clicks),0)::int AS outbound_clicks
      FROM organic.pin_performance pp
      JOIN organic.pins p        ON p.id = pp.pin_id
      JOIN organic.waterfalls w  ON w.id = p.waterfall_id
      JOIN organic.urls u        ON u.id = w.url_id
      LEFT JOIN organic.boards b ON b.id = p.board_id
      ${joinExtras}
     WHERE w.org_id = $1
       AND pp.measured_on BETWEEN $2::date AND $3::date
     GROUP BY ${groupSQL}, ${labelSQL}
     ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST`;
  const r = await pool.query<{ key: string; label: string; pin_count: number; impressions: number; saves: number; outbound_clicks: number }>(q, [orgId, from, to]);
  return r.rows.map((row) => ({
    key: row.key ?? "(none)",
    label: row.label ?? row.key ?? "(none)",
    pin_count: row.pin_count,
    impressions: row.impressions,
    saves: row.saves,
    outbound_clicks: row.outbound_clicks,
    ctr_per_1000: row.impressions > 0 ? Math.round((row.outbound_clicks / row.impressions) * 1000 * 100) / 100 : 0,
    save_rate_per_1000: row.impressions > 0 ? Math.round((row.saves / row.impressions) * 1000 * 100) / 100 : 0,
  }));
}

/** Which "why this URL matters" reason actually drives clicks + saves. */
export function byReason(orgId: string, from: string, to: string) {
  return aggregate(orgId, from, to, "u.reason::text", "u.reason::text");
}

/** Which keywords drive performance — joined via url_keywords. */
export async function byKeyword(orgId: string, from: string, to: string) {
  const pool = organicPool();
  const q = `
    SELECT k.term AS key, k.term AS label,
           COUNT(DISTINCT p.id)::int AS pin_count,
           COALESCE(SUM(pp.impressions),0)::int AS impressions,
           COALESCE(SUM(pp.saves),0)::int AS saves,
           COALESCE(SUM(pp.outbound_clicks),0)::int AS outbound_clicks
      FROM organic.pin_performance pp
      JOIN organic.pins p       ON p.id = pp.pin_id
      JOIN organic.waterfalls w ON w.id = p.waterfall_id
      JOIN organic.url_keywords uk ON uk.url_id = w.url_id
      JOIN organic.keywords k   ON k.id = uk.keyword_id
     WHERE w.org_id = $1
       AND pp.measured_on BETWEEN $2::date AND $3::date
     GROUP BY k.term
     ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST
     LIMIT 25`;
  const r = await pool.query<{ key: string; label: string; pin_count: number; impressions: number; saves: number; outbound_clicks: number }>(q, [orgId, from, to]);
  return r.rows.map((row) => ({
    ...row,
    ctr_per_1000: row.impressions > 0 ? Math.round((row.outbound_clicks / row.impressions) * 1000 * 100) / 100 : 0,
    save_rate_per_1000: row.impressions > 0 ? Math.round((row.saves / row.impressions) * 1000 * 100) / 100 : 0,
  }));
}

/** Board type = BROAD vs NICHE. Simple 2-row aggregate that answers
 *  "do broad boards beat niche in outbound?" */
export function byBoardBreadth(orgId: string, from: string, to: string) {
  return aggregate(orgId, from, to, "b.breadth::text", "b.breadth::text");
}

// ---------- ads candidates --------------------------------------------------

export interface AdsCandidate {
  pin_id: string;
  sequence_number: number;
  design_number: number;
  copy_variant: string;
  board_name: string | null;
  url_name: string | null;
  impressions: number;
  saves: number;
  outbound_clicks: number;
  score: number;   // saves + outbound_clicks (weighted equally)
  in_ads_candidates: boolean;
}

/** Organic winners — pins whose (saves + outbound_clicks) beat threshold.
 *  Also flags whether they've already been marked as ads_candidates. */
export async function surfaceAdsCandidates(orgId: string, from: string, to: string, threshold = 5): Promise<AdsCandidate[]> {
  const pool = organicPool();
  const q = `
    WITH agg AS (
      SELECT p.id AS pin_id, p.sequence_number, p.copy_variant, d.design_number,
             b.name AS board_name, u.name AS url_name,
             COALESCE(SUM(pp.impressions),0)::int AS impressions,
             COALESCE(SUM(pp.saves),0)::int AS saves,
             COALESCE(SUM(pp.outbound_clicks),0)::int AS outbound_clicks
        FROM organic.pins p
        JOIN organic.waterfalls w ON w.id = p.waterfall_id
        JOIN organic.designs d    ON d.id = p.design_id
        LEFT JOIN organic.boards b ON b.id = p.board_id
        LEFT JOIN organic.urls u   ON u.id = w.url_id
        LEFT JOIN organic.pin_performance pp
          ON pp.pin_id = p.id AND pp.measured_on BETWEEN $2::date AND $3::date
       WHERE w.org_id = $1
       GROUP BY p.id, p.sequence_number, p.copy_variant, d.design_number, b.name, u.name
    )
    SELECT a.pin_id::text, a.sequence_number, a.design_number, a.copy_variant, a.board_name, a.url_name,
           a.impressions, a.saves, a.outbound_clicks,
           (a.saves + a.outbound_clicks) AS score,
           (ac.pin_id IS NOT NULL) AS in_ads_candidates
      FROM agg a
      LEFT JOIN organic.ads_candidates ac ON ac.pin_id = a.pin_id
     WHERE (a.saves + a.outbound_clicks) >= $4
     ORDER BY score DESC
     LIMIT 50`;
  const r = await pool.query<AdsCandidate>(q, [orgId, from, to, threshold]);
  return r.rows;
}

/** Persist a winner into ads_candidates so the paid team sees it. Idempotent. */
export async function promoteToAds(pinId: string, signal = "ORGANIC_WINNER", funnelUse = "MIDDLE") {
  const pool = organicPool();
  await pool.query(
    `INSERT INTO organic.ads_candidates (pin_id, signal, funnel_use, recreated_in_ads, noted_at)
     VALUES ($1, $2, $3, false, now())
     ON CONFLICT (pin_id) DO UPDATE SET signal = EXCLUDED.signal, funnel_use = EXCLUDED.funnel_use`,
    [pinId, signal, funnelUse]
  );
}
