/**
 * Organic per week — what the agency looks at every Monday (28-09-2026).
 *
 * Two halves with a different origin, and the screen keeps them apart:
 *
 *   From the API, nightly (analytics-pull.ts → pullWeeklyKpis): impressions,
 *   saves, clicks — the store's OWN image and video pins, claimed content,
 *   never product pins.
 *
 *   By hand, weekly, from Conversion Insights in Ads Manager: organic revenue,
 *   checkouts, page visits, add to cart. Pinterest exposes no organic
 *   conversion metric through the API, so this is the only route. The
 *   filters are fixed and stated on screen (CONVERSION_INSIGHTS_STEPS): content
 *   type Organic, source Your Pins, format Image + Video — never Product —
 *   and the conversion window of the BRAND, the same one paid is judged on
 *   (`store_settings.attribution_setting`, 30/1 when unset). The window is
 *   stamped on the row when it is saved; nobody types it.
 *
 * Organic revenue is the organic-conversions bucket only. Paid-assisted is
 * already claimed by the paid report, and adding it here makes the two
 * reports add up to more than the shop sold.
 */
import { organicPool } from "./db";
import {
  addWeeks,
  brandWindowFrom,
  lastFullWeekStart,
  type BrandWindow,
  type WeekRow,
} from "./weekly-shared";

export * from "./weekly-shared";

/** The seeded demo store: its figures are invented. */
const DEMO_ORG = "d3e70000-0000-4000-8000-00000000de00";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toWeek(r: Record<string, unknown>): WeekRow {
  return {
    week_start: String(r.week_start),
    impressions: num(r.impressions),
    pin_saves: num(r.pin_saves),
    pin_clicks: num(r.pin_clicks),
    outbound_clicks: num(r.outbound_clicks),
    engagements: num(r.engagements),
    is_partial: Boolean(r.is_partial),
    measured_at: r.measured_at ? String(r.measured_at) : null,
    revenue_organic: num(r.revenue_organic),
    checkouts: num(r.checkouts),
    page_visits: num(r.page_visits),
    add_to_cart: num(r.add_to_cart),
    conversion_window_click: num(r.conversion_window_click),
    conversion_window_view: num(r.conversion_window_view),
    figures_entered_at: r.figures_entered_at ? String(r.figures_entered_at) : null,
    figures_note: r.figures_note ? String(r.figures_note) : null,
  };
}

const WEEK_COLUMNS = `week_start::text AS week_start, impressions, pin_saves, pin_clicks,
  outbound_clicks, engagements, is_partial, measured_at, revenue_organic, checkouts,
  page_visits, add_to_cart, conversion_window_click, conversion_window_view,
  figures_entered_at, figures_note`;

async function brandInfo(orgIds: string[]): Promise<Map<string, { window: BrandWindow; currency: string | null }>> {
  const pool = organicPool();
  const [settings, currency] = await Promise.all([
    pool.query<{ org_id: string; attribution_setting: string | null }>(
      `SELECT org_id::text, attribution_setting FROM public.store_settings WHERE org_id = ANY($1::uuid[])`,
      [orgIds],
    ),
    // Conversion Insights reports in the ad account's currency. The newest
    // account-level snapshot is where that lives (same source as Zones).
    pool.query<{ org_id: string; currency: string | null }>(
      `SELECT DISTINCT ON (org_id) org_id::text, currency
         FROM public.pinterest_metrics_snapshots
        WHERE entity_type = 'account' AND snapshot_date >= current_date - 30
          AND org_id = ANY($1::uuid[])
        ORDER BY org_id, snapshot_date DESC`,
      [orgIds],
    ),
  ]);
  const set = new Map(settings.rows.map((r) => [r.org_id, r.attribution_setting]));
  const cur = new Map(currency.rows.map((r) => [r.org_id, r.currency]));
  return new Map(orgIds.map((id) => [id, { window: brandWindowFrom(set.get(id)), currency: cur.get(id) ?? null }]));
}

export interface StoreWeekly {
  window: BrandWindow;
  currency: string | null;
  /** Newest first. Every week from `weeks` back is present, measured or not. */
  weeks: WeekRow[];
  /** The week somebody should be entering now. */
  current_week: string;
}

export async function loadStoreWeekly(orgId: string, weeks = 8): Promise<StoreWeekly> {
  const current = lastFullWeekStart();
  const oldest = addWeeks(current, -(weeks - 1));
  const [rows, info] = await Promise.all([
    organicPool().query(
      `SELECT ${WEEK_COLUMNS} FROM organic.weekly_kpis
        WHERE org_id = $1 AND week_start BETWEEN $2::date AND $3::date`,
      [orgId, oldest, current],
    ),
    brandInfo([orgId]),
  ]);
  const byWeek = new Map(rows.rows.map((r) => [String(r.week_start), toWeek(r)]));
  const out: WeekRow[] = [];
  for (let i = 0; i < weeks; i++) {
    const w = addWeeks(current, -i);
    out.push(byWeek.get(w) ?? toWeek({ week_start: w }));
  }
  const b = info.get(orgId)!;
  return { window: b.window, currency: b.currency, weeks: out, current_week: current };
}

export interface WeeklyFigures {
  week_start: string;
  revenue_organic?: number | null;
  checkouts?: number | null;
  page_visits?: number | null;
  add_to_cart?: number | null;
  note?: string | null;
}

/**
 * Record one week's Conversion Insights figures.
 *
 * The conversion window is NOT an input: it is the brand's, read at save time
 * and stamped on the row, so a week can never be entered against the wrong
 * one. Only what is passed is written — the nightly pull writes the same row.
 */
export async function saveWeeklyFigures(orgId: string, f: WeeklyFigures): Promise<{ ok: true }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.week_start)) throw new Error(`"${f.week_start}" is not a date`);
  const d = new Date(f.week_start + "T00:00:00Z");
  if (isNaN(d.getTime()) || d.getUTCDay() !== 1) throw new Error("A week starts on a Monday");
  if (f.week_start > lastFullWeekStart()) {
    throw new Error("That week is not over yet — Conversion Insights would give a part of it");
  }
  for (const [label, v] of [
    ["organic revenue", f.revenue_organic], ["checkouts", f.checkouts],
    ["page visits", f.page_visits], ["add to cart", f.add_to_cart],
  ] as const) {
    if (v != null && (!Number.isFinite(v) || v < 0)) throw new Error(`${label} cannot be ${v}`);
  }
  const { window } = (await brandInfo([orgId])).get(orgId)!;

  await organicPool().query(
    `INSERT INTO organic.weekly_kpis
       (org_id, week_start, revenue_organic, checkouts, page_visits, add_to_cart,
        conversion_window_click, conversion_window_view, figures_note, figures_entered_at)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (org_id, week_start) DO UPDATE SET
       revenue_organic         = COALESCE(EXCLUDED.revenue_organic, organic.weekly_kpis.revenue_organic),
       checkouts               = COALESCE(EXCLUDED.checkouts,       organic.weekly_kpis.checkouts),
       page_visits             = COALESCE(EXCLUDED.page_visits,     organic.weekly_kpis.page_visits),
       add_to_cart             = COALESCE(EXCLUDED.add_to_cart,     organic.weekly_kpis.add_to_cart),
       conversion_window_click = EXCLUDED.conversion_window_click,
       conversion_window_view  = EXCLUDED.conversion_window_view,
       figures_note            = COALESCE(EXCLUDED.figures_note, organic.weekly_kpis.figures_note),
       figures_entered_at      = now()`,
    [orgId, f.week_start, f.revenue_organic ?? null, f.checkouts ?? null,
     f.page_visits ?? null, f.add_to_cart ?? null, window.click, window.view,
     f.note?.trim() || null],
  );
  return { ok: true };
}

export interface AgencyWeekRow {
  org_id: string;
  name: string;
  window: BrandWindow;
  currency: string | null;
  week: WeekRow;
  previous: WeekRow;
}

/** Every store in the organic book for one week, next to the week before. */
export async function loadAgencyWeekly(weekStart?: string | null): Promise<{
  week_start: string;
  latest: boolean;
  stores: AgencyWeekRow[];
}> {
  const latest = lastFullWeekStart();
  const week = weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) && weekStart < latest
    ? weekStart
    : latest;
  const prev = addWeeks(week, -1);
  const pool = organicPool();
  const orgs = await pool.query<{ org_id: string; name: string }>(
    `SELECT cs.org_id::text, o.name
       FROM organic.client_settings cs
       JOIN public.organizations o ON o.id = cs.org_id
      WHERE cs.org_id <> $1::uuid
      ORDER BY lower(o.name)`,
    [DEMO_ORG],
  );
  const ids = orgs.rows.map((r) => r.org_id);
  const [rows, info] = await Promise.all([
    pool.query(
      `SELECT org_id::text AS org_id, ${WEEK_COLUMNS} FROM organic.weekly_kpis
        WHERE org_id = ANY($1::uuid[]) AND week_start IN ($2::date, $3::date)`,
      [ids, week, prev],
    ),
    brandInfo(ids),
  ]);
  const key = (o: string, w: string) => `${o}|${w}`;
  const byKey = new Map(rows.rows.map((r) => [key(String(r.org_id), String(r.week_start)), toWeek(r)]));
  return {
    week_start: week,
    latest: week === latest,
    stores: orgs.rows.map((o) => ({
      org_id: o.org_id,
      name: o.name,
      window: info.get(o.org_id)!.window,
      currency: info.get(o.org_id)!.currency,
      week: byKey.get(key(o.org_id, week)) ?? toWeek({ week_start: week }),
      previous: byKey.get(key(o.org_id, prev)) ?? toWeek({ week_start: prev }),
    })),
  };
}
