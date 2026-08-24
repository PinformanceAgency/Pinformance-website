/**
 * STAGE 2 · the client report.
 *
 * The only surface a client ever sees. It reads top to bottom as a monthly
 * narrative, and it answers four questions in this order:
 *
 *   1. Is this working?          → sections A, B
 *   2. What did you actually do? → sections E, F
 *   3. Why believe the numbers?  → sections C, D
 *   4. What happens next?        → sections G, H
 *
 * Everything here obeys the Stage-0 contract: a figure that could not be
 * measured is null and renders as an em dash, and a comparison against an
 * absent baseline is not computed at all.
 */
import { organicPool } from "./db";
import { figure, type Figure, type ProvenanceState } from "./provenance";

/* ------------------------------------------------------------------ *
 * The monthly series
 * ------------------------------------------------------------------ */

export interface MonthlyKpis {
  month: string;                 // YYYY-MM-01
  outbound_clicks: number | null;
  pin_saves: number | null;
  page_visits: number | null;
  add_to_cart: number | null;
  checkouts: number | null;
  conversions: number | null;
  revenue: number | null;
  impressions: number | null;
  engagements: number | null;
  pin_clicks: number | null;
  engagement_rate: number | null;
  save_rate: number | null;
  other_impressions: number | null;
  other_saves: number | null;
  pins_published: number | null;
  boards_live: number | null;
  keywords_validated: number | null;
  urls_active: number | null;
  ga4_sessions: number | null;
  ga4_engagement_rate: number | null;
  ga4_session_seconds: number | null;
  ga4_pages_per_session: number | null;
  ga4_bounce_rate: number | null;
  ga4_site_engagement_rate: number | null;
  ga4_site_session_seconds: number | null;
  ga4_site_pages_per_session: number | null;
  ga4_site_bounce_rate: number | null;
  conversion_tag_firing: boolean;
  ga4_connected: boolean;
  is_partial: boolean;
}

export async function loadMonthlySeries(orgId: string, months = 12): Promise<MonthlyKpis[]> {
  const pool = organicPool();
  const r = await pool.query<MonthlyKpis>(
    `SELECT to_char(month, 'YYYY-MM-DD') AS month,
            outbound_clicks, pin_saves, page_visits, add_to_cart, checkouts,
            conversions, revenue, impressions, engagements, pin_clicks,
            engagement_rate, save_rate, other_impressions, other_saves,
            pins_published, boards_live, keywords_validated, urls_active,
            ga4_sessions, ga4_engagement_rate, ga4_session_seconds,
            ga4_pages_per_session, ga4_bounce_rate,
            ga4_site_engagement_rate, ga4_site_session_seconds,
            ga4_site_pages_per_session, ga4_site_bounce_rate,
            conversion_tag_firing, ga4_connected, is_partial
       FROM organic.monthly_kpis
      WHERE org_id = $1
      ORDER BY month ASC
      LIMIT $2`,
    [orgId, months]
  );
  return r.rows;
}

/* ------------------------------------------------------------------ *
 * SECTION A · the headline
 * ------------------------------------------------------------------ */

export interface Headline {
  /** Composed from the data. Never shown to the client on its own. */
  generated: string | null;
  /** What the manager approved. This is what the client sees. */
  approved: string | null;
  /** True when a draft exists that nobody has signed off. */
  awaiting_approval: boolean;
}

/**
 * Compose the headline sentence from the month's own figures.
 *
 * Deliberately refuses to write a sentence it cannot support: with no
 * measured clicks there is no claim to make, and inventing one ("a strong
 * month of foundational work") is the kind of copy that reads as filler to
 * exactly the client you least want to lose.
 */
export function composeHeadline(
  storeName: string,
  current: MonthlyKpis | undefined,
  previous: MonthlyKpis | undefined,
  topUrlName: string | null,
): string | null {
  if (!current || current.outbound_clicks == null) return null;

  const monthName = new Date(current.month + "T00:00:00Z")
    .toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

  const parts: string[] = [`Pinterest drove ${current.outbound_clicks.toLocaleString("en-US")} outbound clicks`];

  if (current.revenue != null && current.revenue > 0) {
    parts.push(`and €${Math.round(current.revenue).toLocaleString("en-US")} in attributed revenue`);
  } else if (current.pin_saves != null) {
    parts.push(`and ${current.pin_saves.toLocaleString("en-US")} saves`);
  }

  let sentence = `${parts.join(" ")} in ${monthName}`;

  // Only claim movement when there is a prior month to move from.
  if (previous?.outbound_clicks != null && previous.outbound_clicks > 0) {
    const pct = Math.round(((current.outbound_clicks - previous.outbound_clicks) / previous.outbound_clicks) * 100);
    const prevMonth = new Date(previous.month + "T00:00:00Z")
      .toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
    if (Math.abs(pct) >= 3) {
      sentence += `, ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on ${prevMonth}`;
    } else {
      sentence += `, level with ${prevMonth}`;
    }
  }

  if (topUrlName) sentence += `, with the strongest performance from ${topUrlName}`;

  return sentence + ".";
}

export async function loadHeadline(orgId: string, month: string): Promise<Headline> {
  const pool = organicPool();
  const r = await pool.query<{ generated: string | null; approved: string | null }>(
    `SELECT headline_generated AS generated, headline_approved AS approved
       FROM organic.monthly_reports WHERE org_id = $1 AND month = $2::date`,
    [orgId, month]
  );
  const row = r.rows[0];
  return {
    generated: row?.generated ?? null,
    approved: row?.approved ?? null,
    awaiting_approval: !!row?.generated && !row?.approved,
  };
}

export async function saveHeadline(
  orgId: string, month: string, generated: string | null, approved: string | null
): Promise<void> {
  const pool = organicPool();
  await pool.query(
    `INSERT INTO organic.monthly_reports (org_id, month, headline_generated, headline_approved, updated_at)
     VALUES ($1, $2::date, $3, $4, now())
     ON CONFLICT (org_id, month) DO UPDATE SET
       headline_generated = COALESCE(EXCLUDED.headline_generated, organic.monthly_reports.headline_generated),
       headline_approved  = COALESCE(EXCLUDED.headline_approved,  organic.monthly_reports.headline_approved),
       updated_at = now()`,
    [orgId, month, generated, approved]
  );
}

/* ------------------------------------------------------------------ *
 * SECTION A · the hard numbers
 * ------------------------------------------------------------------ */

export interface HeadlineFigure {
  label: string;
  figure: Figure;
  /** Movement against the previous month, when both are measured. */
  mom_pct: number | null;
  /** Movement against the phase-1 baseline, when it exists. */
  vs_baseline_pct: number | null;
  currency?: string;
}

const HARD_KEYS = [
  ["Outbound clicks", "outbound_clicks", undefined],
  ["Page visits",     "page_visits",     undefined],
  ["Add to cart",     "add_to_cart",     undefined],
  ["Checkouts",       "checkouts",       undefined],
  ["Revenue",         "revenue",         "€"],
] as const;

export function buildHeadlineFigures(
  current: MonthlyKpis | undefined,
  previous: MonthlyKpis | undefined,
  baseline: Partial<Record<string, number | null>> | null,
): HeadlineFigure[] {
  if (!current) return [];
  return HARD_KEYS.map(([label, key, currency]) => {
    const raw = current[key as keyof MonthlyKpis] as number | null;
    const isConversion = key !== "outbound_clicks";
    const state: ProvenanceState =
      isConversion && !current.conversion_tag_firing ? "TAG_NOT_FIRING"
      : current.is_partial ? "PARTIAL_MONTH"
      : "LIVE";
    const measurable = !isConversion || current.conversion_tag_firing;
    const value = measurable ? raw : null;

    const baseVal = baseline?.[key] ?? null;
    const f = figure(value, baseVal, state);

    const prev = previous ? (previous[key as keyof MonthlyKpis] as number | null) : null;
    const mom = value != null && prev != null && prev > 0
      ? Math.round(((value - prev) / prev) * 100)
      : null;

    return { label, figure: f, mom_pct: mom, vs_baseline_pct: f.delta_pct, currency };
  });
}

/* ------------------------------------------------------------------ *
 * SECTION E · what was built this month
 * ------------------------------------------------------------------ */

export interface BuiltItem {
  label: string;
  count: number;
  /** Browsable proof. The keyword list in particular is the most tangible
   *  evidence of craft the client will ever see. */
  items: string[];
  note?: string;
}

export async function loadWhatWasBuilt(orgId: string, monthStart: string): Promise<BuiltItem[]> {
  const pool = organicPool();
  // The exclusive upper bound, derived in SQL from the same bound parameter.
  // Never string-interpolated: a quoted date inside the statement is parsed
  // as an identifier, not a literal, and Postgres reports it as a missing
  // column rather than a syntax error.
  const monthEnd = `($2::date + interval '1 month')`;

  const [kws, boards, pins, urls, comps] = await Promise.all([
    pool.query<{ term: string }>(
      `SELECT k.term FROM organic.keywords k
         JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1 AND c.volume IS NOT NULL AND c.not_found = false
          AND k.created_at >= $2::date AND k.created_at < ${monthEnd}
        ORDER BY c.volume DESC`, [orgId, monthStart]),
    pool.query<{ name: string }>(
      `SELECT name FROM organic.boards
        WHERE org_id = $1 AND created_on_pinterest >= $2::date
          AND created_on_pinterest < ${monthEnd}
        ORDER BY name`, [orgId, monthStart]),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1 AND p.scheduled_date >= $2::date
          AND p.scheduled_date < ${monthEnd} AND p.status <> 'CANCELLED'`, [orgId, monthStart]),
    pool.query<{ name: string; reason: string }>(
      `SELECT DISTINCT u.name, u.reason::text AS reason
         FROM organic.urls u
         JOIN organic.waterfalls w ON w.url_id = u.id
        WHERE w.org_id = $1 AND w.start_date >= $2::date AND w.start_date < ${monthEnd}
        ORDER BY u.name`, [orgId, monthStart]),
    pool.query<{ name: string; pins: number }>(
      `SELECT c.name, COUNT(cp.id)::int AS pins
         FROM organic.competitors c
         LEFT JOIN organic.competitor_pins cp ON cp.competitor_id = c.id
        WHERE c.org_id = $1 AND c.analyzed_at >= $2::date AND c.analyzed_at < ${monthEnd}
        GROUP BY c.id, c.name ORDER BY c.name`, [orgId, monthStart]),
  ]);

  const REASON_WORDS: Record<string, string> = {
    SEASONAL: "seasonal window", NEW: "new page", BEST_PERFORMER: "proven performer",
    CLIENT_REQUEST: "your request", STOCK_PUSH: "stock priority", AB_TEST: "A/B test",
  };

  return [
    {
      label: "Keywords researched and volume-validated",
      count: kws.rowCount ?? 0,
      items: kws.rows.map((r) => r.term),
      note: "Each one checked for real Pinterest search volume before it was used.",
    },
    {
      label: "Boards created",
      count: boards.rowCount ?? 0,
      items: boards.rows.map((r) => r.name),
    },
    {
      label: "Pins designed and published",
      count: pins.rows[0]?.n ?? 0,
      items: [],
      note: "Every URL produces sixteen pins: four designs, each in four fresh variations.",
    },
    {
      label: "URLs activated",
      count: urls.rowCount ?? 0,
      items: urls.rows.map((r) => `${r.name} — chosen as ${REASON_WORDS[r.reason] ?? r.reason.toLowerCase()}`),
    },
    {
      label: "Competitors analysed",
      count: comps.rowCount ?? 0,
      items: comps.rows.map((r) => `${r.name} — ${r.pins.toLocaleString("en-US")} pins reviewed`),
    },
  ];
}

/* ------------------------------------------------------------------ *
 * SECTION F · strategy assets
 * ------------------------------------------------------------------ */

export interface StrategyAssets {
  boards: Array<{ name: string; topic: string | null; primary_keyword: string | null; pin_count: number }>;
  keyword_clusters: Array<{ cluster: string; axis: string; terms: Array<{ term: string; volume: number | null }> }>;
  taste_graph: {
    content_angles: string[]; visual_worlds: string[]; key_moments: string[];
    core_products: string[]; aesthetic_worlds: string[];
  } | null;
  seasonal_calendar: Array<{ term: string; peak_start: string | null; publish_from: string | null }>;
  /** Boards that pre-dated us. Counted, never claimed. */
  boards_inherited: number;
}

export async function loadStrategyAssets(orgId: string): Promise<StrategyAssets> {
  const pool = organicPool();
  const [boards, migrated, clusters, taste, seasonal] = await Promise.all([
    // Only architecture we designed. A board with origin MIGRATED already
    // existed on the client's Pinterest account when we took it over —
    // including Pinterest's own auto-created "quick save" board, which
    // carries the account's interface language and reads as sloppy on a
    // report. Claiming those as our work is the kind of padding a client
    // notices. EXISTING_RENAMED stays: we restructured those.
    pool.query(
      `SELECT b.name, t.name AS topic, b.primary_keyword, b.pin_count
         FROM organic.boards b LEFT JOIN organic.topics t ON t.id = b.topic_id
        WHERE b.org_id = $1 AND b.status IN ('SECRET','PROTECTED','PUBLIC')
          AND b.origin <> 'MIGRATED'::organic.board_origin
        ORDER BY t.name NULLS LAST, b.name`, [orgId]),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.boards
        WHERE org_id = $1 AND origin = 'MIGRATED'::organic.board_origin`, [orgId]),
    pool.query<{ cluster: string; axis: string; term: string; volume: number | null }>(
      `SELECT kc.name AS cluster, kc.axis::text AS axis, k.term, c.volume
         FROM organic.keyword_clusters kc
         JOIN organic.keywords k ON k.cluster_id = kc.id
         LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE kc.org_id = $1
        ORDER BY kc.name, c.volume DESC NULLS LAST`, [orgId]),
    pool.query(
      `SELECT content_angles, visual_worlds, key_moments, core_products, aesthetic_worlds
         FROM organic.taste_graph WHERE org_id = $1`, [orgId]),
    pool.query(
      `SELECT term, peak_window_start::text AS peak_start, ramp_up_start::text AS publish_from
         FROM organic.keywords
        WHERE org_id = $1 AND seasonal_type = 'SEASONAL'::organic.seasonal_type
          AND peak_window_start IS NOT NULL
        ORDER BY peak_window_start`, [orgId]),
  ]);

  const byCluster = new Map<string, { cluster: string; axis: string; terms: Array<{ term: string; volume: number | null }> }>();
  for (const r of clusters.rows) {
    const e = byCluster.get(r.cluster) ?? { cluster: r.cluster, axis: r.axis, terms: [] };
    e.terms.push({ term: r.term, volume: r.volume });
    byCluster.set(r.cluster, e);
  }

  const t = taste.rows[0];
  return {
    boards: boards.rows as StrategyAssets["boards"],
    keyword_clusters: Array.from(byCluster.values()),
    taste_graph: t ? {
      content_angles: t.content_angles ?? [], visual_worlds: t.visual_worlds ?? [],
      key_moments: t.key_moments ?? [], core_products: t.core_products ?? [],
      aesthetic_worlds: t.aesthetic_worlds ?? [],
    } : null,
    seasonal_calendar: seasonal.rows as StrategyAssets["seasonal_calendar"],
    boards_inherited: migrated.rows[0]?.n ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * SECTION G · what worked, and why
 * ------------------------------------------------------------------ */

export interface WhatWorked {
  top_pins: Array<{ pin_id: string; design: number; variant: string; board: string | null; url: string | null; clicks: number; saves: number; image_path: string | null }>;
  by_intent: Array<{ label: string; clicks: number; saves: number; pins: number }>;
  by_breadth: Array<{ label: string; clicks: number; saves: number; pins: number }>;
  by_reason: Array<{ label: string; clicks: number; saves: number; pins: number }>;
}

export async function loadWhatWorked(orgId: string, from: string, to: string): Promise<WhatWorked> {
  const pool = organicPool();
  const agg = (groupSql: string, joinSql = "") => pool.query<{ label: string; clicks: number; saves: number; pins: number }>(
    `SELECT ${groupSql} AS label,
            COALESCE(SUM(pp.outbound_clicks),0)::int AS clicks,
            COALESCE(SUM(pp.saves),0)::int AS saves,
            COUNT(DISTINCT p.id)::int AS pins
       FROM organic.pin_performance pp
       JOIN organic.pins p ON p.id = pp.pin_id
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
       JOIN organic.designs d ON d.id = p.design_id
       LEFT JOIN organic.boards b ON b.id = p.board_id
       LEFT JOIN organic.urls u ON u.id = w.url_id
       ${joinSql}
      WHERE w.org_id = $1 AND pp.measured_on BETWEEN $2::date AND $3::date
      GROUP BY ${groupSql}
      ORDER BY SUM(pp.outbound_clicks) DESC NULLS LAST`, [orgId, from, to]);

  const [top, intent, breadth, reason] = await Promise.all([
    pool.query(
      `SELECT p.id::text AS pin_id, d.design_number AS design, p.copy_variant AS variant,
              b.name AS board, u.name AS url, p.image_path,
              COALESCE(SUM(pp.outbound_clicks),0)::int AS clicks,
              COALESCE(SUM(pp.saves),0)::int AS saves
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.designs d ON d.id = p.design_id
         LEFT JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.urls u ON u.id = w.url_id
         LEFT JOIN organic.pin_performance pp
           ON pp.pin_id = p.id AND pp.measured_on BETWEEN $2::date AND $3::date
        WHERE w.org_id = $1
        GROUP BY p.id, d.design_number, p.copy_variant, b.name, u.name, p.image_path
       HAVING COALESCE(SUM(pp.outbound_clicks),0) + COALESCE(SUM(pp.saves),0) > 0
        ORDER BY COALESCE(SUM(pp.outbound_clicks),0) DESC
        LIMIT 6`, [orgId, from, to]),
    agg("d.intent::text"),
    agg("b.breadth::text"),
    agg("u.reason::text"),
  ]);

  const INTENT_WORDS: Record<string, string> = { SAVE: "Save-optimised", CLICK: "Click-optimised" };
  const BREADTH_WORDS: Record<string, string> = { BROAD: "Broad boards", NICHE: "Niche boards" };
  const REASON_WORDS: Record<string, string> = {
    SEASONAL: "Seasonal", NEW: "New pages", BEST_PERFORMER: "Proven performers",
    CLIENT_REQUEST: "Your requests", STOCK_PUSH: "Stock priority", AB_TEST: "A/B tests",
  };
  const relabel = (rows: Array<{ label: string; clicks: number; saves: number; pins: number }>, map: Record<string, string>) =>
    rows.filter((r) => r.label).map((r) => ({ ...r, label: map[r.label] ?? r.label }));

  return {
    top_pins: top.rows as WhatWorked["top_pins"],
    by_intent:  relabel(intent.rows,  INTENT_WORDS),
    by_breadth: relabel(breadth.rows, BREADTH_WORDS),
    by_reason:  relabel(reason.rows,  REASON_WORDS),
  };
}

/* ------------------------------------------------------------------ *
 * SECTION H · next month
 * ------------------------------------------------------------------ */

export interface NextMonth {
  rising_trends: string[];
  queued_urls: Array<{ name: string; reason: string; signal: string | null }>;
  opening_seasonal: Array<{ term: string; publish_from: string | null; peak: string | null }>;
  notes: string | null;
}

export async function loadNextMonth(orgId: string): Promise<NextMonth> {
  const pool = organicPool();
  const [trends, queued, seasonal, notes] = await Promise.all([
    pool.query<{ term: string }>(
      `SELECT term FROM organic.keywords
        WHERE org_id = $1 AND source = 'TRENDS'::organic.keyword_source
        ORDER BY created_at DESC LIMIT 8`, [orgId]),
    pool.query<{ name: string; reason: string }>(
      `SELECT u.name, u.reason::text AS reason
         FROM organic.urls_selectable u
        WHERE u.org_id = $1 AND u.is_selectable = true
        ORDER BY u.created_at DESC LIMIT 8`, [orgId]),
    pool.query<{ term: string; publish_from: string | null; peak: string | null }>(
      `SELECT term, ramp_up_start::text AS publish_from, peak_window_start::text AS peak
         FROM organic.keywords
        WHERE org_id = $1 AND seasonal_type = 'SEASONAL'::organic.seasonal_type
          AND ramp_up_start IS NOT NULL
          AND ramp_up_start BETWEEN current_date AND current_date + interval '60 days'
        ORDER BY ramp_up_start`, [orgId]),
    pool.query<{ notes: string | null }>(
      `SELECT next_month_notes AS notes FROM organic.monthly_reports
        WHERE org_id = $1 ORDER BY month DESC LIMIT 1`, [orgId]),
  ]);

  const REASON_WORDS: Record<string, string> = {
    SEASONAL: "seasonal window", NEW: "new page", BEST_PERFORMER: "proven performer",
    CLIENT_REQUEST: "your request", STOCK_PUSH: "stock priority", AB_TEST: "A/B test",
  };

  return {
    rising_trends: trends.rows.map((r) => r.term),
    queued_urls: queued.rows.map((r) => ({
      name: r.name, reason: REASON_WORDS[r.reason] ?? r.reason.toLowerCase(), signal: null,
    })),
    opening_seasonal: seasonal.rows,
    notes: notes.rows[0]?.notes ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Leading indicators — the honest story in months one to four
 * ------------------------------------------------------------------ */

export interface LeadingIndicators {
  boards_live: number;
  boards_target: number;
  topics_covered: number;
  topics_total: number;
  keywords_validated: number;
  urls_in_rotation: number;
  pins_scheduled_ahead: number;
}

export async function loadLeadingIndicators(orgId: string): Promise<LeadingIndicators> {
  const pool = organicPool();
  const r = await pool.query<LeadingIndicators>(
    `SELECT
       (SELECT COUNT(*)::int FROM organic.boards
         WHERE org_id = $1 AND status IN ('SECRET','PROTECTED','PUBLIC')) AS boards_live,
       (SELECT COUNT(*)::int FROM organic.boards WHERE org_id = $1) AS boards_target,
       (SELECT COUNT(*) FILTER (WHERE is_covered)::int FROM organic.topic_coverage WHERE org_id = $1) AS topics_covered,
       (SELECT COUNT(*)::int FROM organic.topic_coverage WHERE org_id = $1) AS topics_total,
       (SELECT COUNT(*)::int FROM organic.keywords k
          JOIN organic.keyword_volume_cache c ON c.term = k.term
         WHERE k.org_id = $1 AND c.volume IS NOT NULL AND c.not_found = false) AS keywords_validated,
       (SELECT COUNT(*)::int FROM organic.urls WHERE org_id = $1) AS urls_in_rotation,
       (SELECT COUNT(*)::int FROM organic.pins p
          JOIN organic.waterfalls w ON w.id = p.waterfall_id
         WHERE w.org_id = $1 AND p.scheduled_date >= current_date
           AND p.status <> 'CANCELLED') AS pins_scheduled_ahead`,
    [orgId]
  );
  return r.rows[0];
}

/* ------------------------------------------------------------------ *
 * The attribution note — permanent, never a footnote
 * ------------------------------------------------------------------ */

export const ATTRIBUTION_NOTE = {
  heading: "Why Pinterest and Google Analytics disagree",
  body: [
    "More than 80% of Pinterest activity happens inside the Pinterest mobile app. When someone taps through to your site from the app, modern privacy handling drops the referral tag on the way. Google Analytics has no way to know where that visitor came from, so it files them under direct traffic.",
    "This is not a measurement error on either side. They are counting different things.",
  ],
  rule: "Pinterest native is the source of truth for volume. GA4 is the source of truth for what those visitors did once they arrived.",
} as const;
