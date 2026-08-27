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
import {
  figure, stateForPinterestMetric, stateForConversionMetric,
  type ProvenanceState, type SetupState,
} from "./provenance";

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

export interface DeltaRow {
  name: string;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  delta_pct: number | null;
  /** Provenance — what state this figure is in and, when the comparison is
   *  suppressed, why. Never render a DeltaRow without reading these. */
  state: ProvenanceState;
  delta_suppressed_because: ProvenanceState | null;
  /** Hard metrics sit at the top of the client report at headline size;
   *  soft metrics collapse into "Distribution & reach". */
  tier: "hard" | "soft";
}

/** Determine, once per report render, what can be trusted for this org.
 *  Every figure in a family then agrees on its provenance rather than each
 *  call site guessing. */
export async function loadSetupState(orgId: string, from: string, to: string): Promise<SetupState> {
  const pool = organicPool();
  const [baseRow, tagRow, ga4Row] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.baseline_kpis
        WHERE org_id = $1 AND period = 'last_30d' AND impressions IS NOT NULL`, [orgId]),
    // P1.3.3 verifies the Pinterest tag fires PageVisit / AddToCart / Checkout.
    // Until that task is DONE we must not present conversion figures at all.
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.client_tasks
        WHERE org_id = $1 AND task_id = 'P1.3.3' AND status = 'DONE'::organic.task_status`, [orgId]),
    pool.query<{ ga4: boolean }>(
      `SELECT COALESCE(ga4_access, false) AS ga4 FROM organic.client_access WHERE org_id = $1`, [orgId]),
  ]);

  // Pinterest keeps aggregating for roughly 48h; a range ending inside that
  // window is still moving and must not be compared to a settled month.
  const endMs = new Date(to + "T00:00:00Z").getTime();
  const daysSinceEnd = (Date.now() - endMs) / 86_400_000;
  const spanDays = (endMs - new Date(from + "T00:00:00Z").getTime()) / 86_400_000;

  return {
    has_baseline: baseRow.rows[0].n > 0,
    conversion_tag_firing: tagRow.rows[0].n > 0,
    ga4_connected: ga4Row.rows[0]?.ga4 ?? false,
    period_is_partial: spanDays < 28,
    period_still_processing: daysSinceEnd < 2,
  };
}

/** Build the comparison table. Every row carries provenance; a row whose
 *  value could not be measured renders as an em dash rather than zero, and
 *  a comparison against an absent baseline is not computed at all. */
export function computeDeltas(
  baseline: BaselineRow | null,
  current: Record<string, number> | null,
  setup?: SetupState
): DeltaRow[] {
  if (!current) return [];
  const b = baseline;
  const s: SetupState = setup ?? {
    has_baseline: b != null, conversion_tag_firing: true, ga4_connected: true,
    period_is_partial: false, period_still_processing: false,
  };

  const pinterestState  = stateForPinterestMetric(s);
  const conversionState = stateForConversionMetric(s);

  // [label, baseline value, Pinterest metric key, tier, family]
  const map: Array<[string, number | null, string, "hard" | "soft", "pinterest" | "conversion"]> = [
    // Hard — results. These carry the retainer.
    ["Outbound clicks", b?.outbound_clicks ?? null, "OUTBOUND_CLICK", "hard", "pinterest"],
    ["Pin saves",       b?.pin_saves ?? null,       "SAVE",           "hard", "pinterest"],
    ["Page visits",     b?.page_visits ?? null,     "PAGE_VISIT",     "hard", "conversion"],
    ["Add to cart",     b?.add_to_cart ?? null,     "ADD_TO_CART",    "hard", "conversion"],
    ["Checkouts",       b?.checkouts ?? null,       "CHECKOUT",       "hard", "conversion"],
    ["Conversions",     b?.conversions ?? null,     "CONVERSIONS",    "hard", "conversion"],
    ["Revenue",         b?.revenue ?? null,         "REVENUE",        "hard", "conversion"],
    // Soft — distribution and reach. Real, but not results.
    ["Impressions",     b?.impressions ?? null,     "IMPRESSION",     "soft", "pinterest"],
    ["Engagements",     b?.engagements ?? null,     "ENGAGEMENT",     "soft", "pinterest"],
    ["Pin clicks",      null,                       "PIN_CLICK",      "soft", "pinterest"],
    ["Engagement rate", b?.engagement_rate ?? null, "ENGAGEMENT_RATE","soft", "pinterest"],
    ["Save rate",       null,                       "SAVE_RATE",      "soft", "pinterest"],
  ];

  const rows: DeltaRow[] = [];
  for (const [name, baselineVal, key, tier, family] of map) {
    const familyState = family === "conversion" ? conversionState : pinterestState;

    // A metric family that cannot be measured is never zero. Without a
    // firing tag Pinterest reports 0 for every conversion metric, and
    // showing that to a client states something false.
    const measurable = family !== "conversion" || s.conversion_tag_firing;
    const raw = measurable ? (current[key] ?? null) : null;

    const f = figure(raw, s.has_baseline ? baselineVal : null, familyState);
    rows.push({
      name,
      baseline: s.has_baseline ? baselineVal : null,
      current: f.value,
      delta: f.delta,
      delta_pct: f.delta_pct,
      state: f.state,
      delta_suppressed_because: f.delta_suppressed_because,
      tier,
    });
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

// ---------- P5.2.3 — mark templates proven ---------------------------------
//
// The loop the whole method rests on: a template that produced a winner
// gets marked, and next month's design brief starts from a handful of
// layouts that work instead of from scratch. design_templates has carried
// an is_proven flag since it was created and nothing ever set it, so the
// convergence the SOP describes could not happen.

export interface TemplateStanding {
  template_id: string;
  name: string;
  intent: string;
  aspect_ratio: string | null;
  has_text_overlay: boolean | null;
  times_used: number;
  is_proven: boolean;
  /** Summed over every published pin that used this template. */
  clicks: number;
  saves: number;
  designs: number;
}

/**
 * Every template this client has used, with what it has actually returned.
 *
 * Ordered by clicks then saves — the method judges winners on outbound
 * clicks and on saves, never on impressions, because impressions say
 * nothing about intent.
 */
export async function loadTemplateStandings(orgId: string): Promise<TemplateStanding[]> {
  const r = await organicPool().query<TemplateStanding>(
    `SELECT t.id::text          AS template_id,
            t.name, t.intent::text AS intent, t.aspect_ratio,
            t.has_text_overlay, t.times_used, t.is_proven,
            COALESCE(SUM(pp.outbound_clicks), 0)::int AS clicks,
            COALESCE(SUM(pp.saves), 0)::int           AS saves,
            COUNT(DISTINCT d.id)::int                 AS designs
       FROM organic.design_templates t
       LEFT JOIN organic.designs d ON d.template_id = t.id
       LEFT JOIN organic.pins p    ON p.design_id = d.id AND p.status = 'PUBLISHED'::organic.pin_status
       LEFT JOIN organic.pin_performance pp ON pp.pin_id = p.id
      WHERE t.org_id = $1
      GROUP BY t.id
      ORDER BY clicks DESC, saves DESC, t.name`,
    [orgId]
  );
  return r.rows;
}

/** P5.2.3 — a template is proven, or it is not. */
export async function setTemplateProven(orgId: string, templateId: string, proven: boolean) {
  const r = await organicPool().query(
    `UPDATE organic.design_templates SET is_proven = $3
      WHERE org_id = $1 AND id = $2`,
    [orgId, templateId, proven]
  );
  if (r.rowCount === 0) throw new Error("Template not found for this org");
  return { ok: true, template_id: templateId, is_proven: proven };
}

// ---------- P5.3.3 — the forward-looking note ------------------------------

const FORECAST_SYSTEM = `You write the forward-looking section of a monthly
Pinterest report for a media buying agency.

Return ONE paragraph of 70 to 130 words, no preamble, no bullet points and
no heading. It is read by the client, so write to them, not about them.

What makes this section worth reading is that Pinterest leads: what rises
there rises on Google weeks later. So the paragraph should say what is
moving now and what that implies for the next sixty to ninety days —
concretely, tied to this brand's own products and angles.

Never invent a trend. Work only from what you are given. If the trend
input is thin, say what you would watch rather than inventing movement,
and say plainly that the reading is thin — a client can act on "we do not
have a signal yet", and cannot act on a confident guess.`;

/**
 * P5.3.3 — drafts the trends paragraph from the trend checks and the brand.
 *
 * An AI_DRAFT, so it is written here and approved by a person. What it is
 * given is deliberately narrow: the notes from P5.3.1 and P5.3.2, the taste
 * graph and what has won on this account. Handing it the whole research
 * record would let it write something plausible about a brand it is not
 * looking at, which is exactly the failure this section cannot afford —
 * it is the part of the report the client acts on.
 */
export async function draftTrendForecast(orgId: string) {
  const { generateWithValidator, persistDraft } = await import("./ai");
  const { loadAccountBrief } = await import("./brief");
  const pool = organicPool();

  const [brief, notes] = await Promise.all([
    loadAccountBrief(orgId),
    pool.query<{ task_id: string; notes: string }>(
      `SELECT ct.task_id, ct.notes
         FROM organic.client_tasks ct
        WHERE ct.org_id = $1 AND ct.task_id IN ('P5.3.1','P5.3.2')
          AND ct.notes IS NOT NULL AND ct.notes <> ''`, [orgId]),
  ]);
  if (!brief) throw new Error("Org not found");

  const trendInput = notes.rows.map((n) => `${n.task_id}: ${n.notes}`).join("\n");
  const taste = brief.taste.value;

  const user = [
    `Brand: ${brief.name}${brief.niche ? ` — ${brief.niche}` : ""}`,
    brief.intake.value?.products_services ? `Products: ${brief.intake.value.products_services}` : null,
    taste?.content_angles.length ? `Content angles: ${taste.content_angles.join(" / ")}` : null,
    taste?.key_moments.length ? `Key moments: ${taste.key_moments.join(" / ")}` : null,
    "",
    trendInput
      ? `What the trend checks found this month:\n${trendInput}`
      : "No trend checks recorded this month (P5.3.1 and P5.3.2 have no notes).",
    "",
    brief.proven.known
      ? `What has worked on this account:\n${brief.proven.value!.slice(0, 5)
          .map((p) => `  - ${p.intent} pin on "${p.board_name}": ${p.clicks} clicks / ${p.saves} saves`).join("\n")}`
      : "Nothing proven on this account yet.",
  ].filter((l) => l !== null).join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(
    FORECAST_SYSTEM, user, validateForecast, 700
  );
  const draftId = await persistDraft(orgId, "TREND_FORECAST", null, text);
  return { forecast: text, draft_id: draftId, attempts, failed_attempts, had_trend_input: (notes.rowCount ?? 0) > 0 };
}

/** Length and shape only. Whether the reading is right is the human's job. */
export function validateForecast(text: string): { ok: boolean; errors: string[] } {
  const errs: string[] = [];
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 60) errs.push(`${words} words, too thin for the section (aim 70-130)`);
  if (words > 170) errs.push(`${words} words, well over the 130-word target`);
  if (/^[-*•]|\n\s*[-*•]/.test(t)) errs.push("bullet points — this is one paragraph");
  if (/^#{1,6}\s/m.test(t)) errs.push("a heading — this is one paragraph");
  return { ok: errs.length === 0, errors: errs };
}

/* ------------------------------------------------------------------ */
/* P5.2.2 — attribution, with the patterns stated                      */
/* ------------------------------------------------------------------ */
//
// Every pin already knows where it came from: a design, a copy set, a
// board, a waterfall, and a URL with a reason. So the attribution can be
// computed rather than worked out, and P5.2.2 becomes reading instead of
// analysis — which is what makes it survive a busy month.
//
// The one thing that stays human is the interpretation: *why* the manager
// thinks a pattern holds. That is the only free text field in phases 4 and
// 5, and it is deliberately not something a model drafts, because it is the
// input to next month's decisions rather than a description of last month.

/** Below this, a difference between two groups is noise. */
const MIN_PINS_PER_SIDE = 4;
/** Below this, a ratio is not worth stating as a finding. */
const MIN_RATIO = 1.4;

export interface AttributionDimension {
  key: string;
  label: string;
  rows: FeedbackAggregate[];
}

export interface Attribution {
  from: string;
  to: string;
  dimensions: AttributionDimension[];
  /** Patterns worth reading, in plain sentences. Empty is a valid answer. */
  findings: string[];
  /** Why a dimension produced nothing, so a gap is not read as a zero. */
  thin: string[];
}

/**
 * State a comparison only when both sides carry enough pins and the gap is
 * large enough to survive a normal month's noise. Everything else is
 * reported as thin rather than dressed up as a finding — a panel that
 * always has something to say stops being read.
 */
function compare(
  rows: FeedbackAggregate[],
  metric: "ctr_per_1000" | "save_rate_per_1000",
  phrase: (winner: string, loser: string, ratio: string) => string
): string | null {
  const usable = rows.filter((r) => r.pin_count >= MIN_PINS_PER_SIDE && r.impressions > 0);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => b[metric] - a[metric]);
  const top = sorted[0], bottom = sorted[sorted.length - 1];
  if (bottom[metric] <= 0) return null;
  const ratio = top[metric] / bottom[metric];
  if (ratio < MIN_RATIO) return null;
  return phrase(top.label, bottom.label, `${ratio.toFixed(1)}×`);
}

export async function loadAttribution(
  orgId: string,
  from: string,
  to: string
): Promise<Attribution> {
  const [reason, keyword, breadth, intent, route, board] = await Promise.all([
    byReason(orgId, from, to),
    byKeyword(orgId, from, to),
    byBoardBreadth(orgId, from, to),
    aggregate(orgId, from, to, "d.intent::text", "d.intent::text",
      "JOIN organic.designs d ON d.id = p.design_id"),
    aggregate(orgId, from, to, "d.route::text", "d.route::text",
      "JOIN organic.designs d ON d.id = p.design_id"),
    aggregate(orgId, from, to, "b.id::text", "b.name"),
  ]);

  const dimensions: AttributionDimension[] = [
    { key: "intent", label: "Save pin vs click pin", rows: intent },
    { key: "board", label: "Board", rows: board.slice(0, 15) },
    { key: "keyword", label: "Keyword", rows: keyword },
    { key: "reason", label: "Why this URL was chosen", rows: reason },
    { key: "breadth", label: "Broad vs niche board", rows: breadth },
    { key: "route", label: "AI route vs direct", rows: route },
  ];

  const findings: string[] = [];
  const thin: string[] = [];

  const push = (s: string | null, dimension: string) => {
    if (s) findings.push(s);
    else thin.push(dimension);
  };

  push(compare(intent, "ctr_per_1000",
    (w, l, r) => `${w === "CLICK" ? "Click" : "Save"} pins earn ${r} the outbound clicks per impression that ${l === "CLICK" ? "click" : "save"} pins do here.`),
    "save vs click");
  push(compare(intent, "save_rate_per_1000",
    (w, l, r) => `On saves it is the other way round where it matters: ${w.toLowerCase()} pins are saved ${r} as often as ${l.toLowerCase()} pins.`),
    "save rate by intent");
  push(compare(board, "ctr_per_1000",
    (w, l, r) => `"${w}" converts ${r} better per impression than "${l}". Worth more of next month's rotation.`),
    "boards");
  push(compare(breadth, "ctr_per_1000",
    (w, l, r) => `${w.toLowerCase()} boards convert ${r} better than ${l.toLowerCase()} ones on this account.`),
    "broad vs niche");
  push(compare(reason, "ctr_per_1000",
    (w, l, r) => `URLs chosen because they were ${w.toLowerCase().replace(/_/g, " ")} convert ${r} better than ${l.toLowerCase().replace(/_/g, " ")} ones.`),
    "URL reason");
  push(compare(route, "ctr_per_1000",
    (w, l, r) => `${w === "AI_GENERATED" ? "AI-generated" : "Directly designed"} images convert ${r} better than ${l === "AI_GENERATED" ? "AI-generated" : "directly designed"} ones.`),
    "AI vs direct");

  const totalPins = intent.reduce((t, r) => t + r.pin_count, 0);
  if (totalPins === 0) {
    return {
      from, to, dimensions, findings: [],
      thin: ["No measured pins in this window — nothing to attribute yet."],
    };
  }

  return {
    from,
    to,
    dimensions,
    findings,
    thin: thin.length
      ? [`Not enough separation to call: ${thin.join(", ")}. ` +
         `A comparison needs ${MIN_PINS_PER_SIDE}+ pins on both sides and a ${MIN_RATIO}× gap.`]
      : [],
  };
}
