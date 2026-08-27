/**
 * P5.1.1 — pulling Pinterest analytics into the organic schema.
 *
 * Until now nothing wrote `organic.pin_performance` or
 * `organic.monthly_kpis` except the seed scripts. Every winner, every
 * sparkline, every client report and the whole phase-5 → phase-4 learning
 * loop ran on fiction, and there was no way to tell from any screen.
 *
 * Two pulls, deliberately separate:
 *
 *   pullPinPerformance()  per pin, per day, in batches of 100. This is what
 *                         P5.2.1 ranks winners on and what the design brief
 *                         reads back as `proven`.
 *
 *   pullAccountKpis()     the account totals per month. These are the report
 *                         figures.
 *
 * The filters are fixed and are the method's, not a preference: ORGANIC
 * content only, and realtime excluded by ending the window yesterday.
 * Pinterest's realtime numbers move for about a day, and a report that
 * changes after it has been sent is worse than one that lands a day later.
 * `ANALYTICS_FILTERS` is exported so the screen can show them above the
 * figures — a number that looks wrong is almost always a filter, and if the
 * filters live only in this file nobody can check that.
 */
import { organicPool } from "./db";
import {
  pinterestClientsForOrgs,
  type PinterestAuthError,
} from "@/lib/pinterest/for-org";
import type { PinterestClient } from "@/lib/pinterest/client";

/** Shown on screen next to the numbers. Changing one here changes the label. */
export const ANALYTICS_FILTERS = [
  { label: "Content type", value: "Organic only" },
  { label: "Attribution", value: "Claimed domain" },
  { label: "Scope", value: "Your Pins" },
  { label: "Realtime", value: "Excluded — window ends yesterday" },
] as const;

/** Core metrics. Every business account returns these. */
const PIN_METRICS = ["IMPRESSION", "SAVE", "OUTBOUND_CLICK"];
const ACCOUNT_METRICS = [
  "IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK",
  "ENGAGEMENT", "ENGAGEMENT_RATE", "SAVE_RATE",
];

/**
 * Conversion metrics, requested in a second call on purpose.
 *
 * They need the Pinterest tag installed and conversion access on the
 * account, and Pinterest answers 400 for the whole request when one metric
 * name is not available — which would take the core pull down with it. Asked
 * separately, a store without conversion access simply leaves those columns
 * null, which is what the provenance contract requires: a figure that could
 * not be measured is absent with a reason, never zero.
 */
const CONVERSION_METRICS = [
  "TOTAL_PAGE_VISIT", "TOTAL_ADD_TO_CART", "TOTAL_CHECKOUT", "TOTAL_CONVERSIONS",
];

const BATCH = 100;

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function monthStartISO(monthsBack = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsBack);
  return d.toISOString().slice(0, 10);
}

/** Read a metric under any of the names Pinterest has used for it. */
function metric(src: Record<string, number> | undefined, ...names: string[]): number {
  if (!src) return 0;
  for (const n of names) {
    const v = src[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

export interface PullReport {
  orgs: Array<{
    org_id: string;
    org_name: string;
    pins_measured: number;
    days_written: number;
    months_written: number;
    conversions_available: boolean;
    note?: string;
  }>;
  reconnect_required: Array<{
    org_id: string; org_name: string;
    reason: PinterestAuthError["reason"]; message: string;
  }>;
  errors: Array<{ org_id: string; message: string }>;
}

/**
 * Pull both sets for every store that has published organic pins.
 *
 * Self-healing over a window rather than incremental: Pinterest revises
 * recent days, so re-reading the last two weeks and upserting is the only
 * way the numbers converge on what Pinterest will eventually agree with.
 */
export async function pullOrganicAnalytics(
  opts: { orgId?: string; days?: number; months?: number } = {}
): Promise<PullReport> {
  const pool = organicPool();
  const days = opts.days ?? 14;
  const months = opts.months ?? 2;

  const orgs = await pool.query<{ org_id: string }>(
    `SELECT DISTINCT w.org_id::text AS org_id
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE p.status = 'PUBLISHED'::organic.pin_status
        AND p.pinterest_pin_id IS NOT NULL
        AND ($1::uuid IS NULL OR w.org_id = $1::uuid)`,
    [opts.orgId ?? null]
  );

  const report: PullReport = { orgs: [], reconnect_required: [], errors: [] };
  if (orgs.rowCount === 0) return report;

  const { clients, failed } = await pinterestClientsForOrgs(orgs.rows.map((r) => r.org_id));
  report.reconnect_required.push(...failed);

  for (const [orgId, entry] of clients) {
    try {
      const pins = await pullPinPerformance(orgId, entry.client, days);
      const kpis = await pullAccountKpis(orgId, entry.client, months);
      report.orgs.push({
        org_id: orgId,
        org_name: entry.orgName,
        pins_measured: pins.pins,
        days_written: pins.rows,
        months_written: kpis.months,
        conversions_available: kpis.conversions,
        note: kpis.conversions ? undefined : "no conversion access — those KPIs stay blank",
      });
    } catch (e) {
      report.errors.push({ org_id: orgId, message: (e as Error).message });
    }
  }
  return report;
}

/* ------------------------------------------------------------------ */

export async function pullPinPerformance(
  orgId: string,
  client: PinterestClient,
  days: number
): Promise<{ pins: number; rows: number }> {
  const pool = organicPool();
  const end = yesterdayISO();
  const start = new Date(Date.parse(end) - (days - 1) * 86_400_000).toISOString().slice(0, 10);

  const published = await pool.query<{ id: string; pinterest_pin_id: string }>(
    `SELECT p.id::text, p.pinterest_pin_id
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
        AND p.pinterest_pin_id IS NOT NULL
        -- A pin published before the window has nothing new in it.
        AND (p.published_at IS NULL OR p.published_at >= $2::date - interval '1 day')`,
    [orgId, start]
  );
  if (published.rowCount === 0) return { pins: 0, rows: 0 };

  const byPinterestId = new Map(published.rows.map((r) => [r.pinterest_pin_id, r.id]));
  let written = 0;

  for (let i = 0; i < published.rows.length; i += BATCH) {
    const slice = published.rows.slice(i, i + BATCH);
    const data = await client.getMultiPinAnalytics(
      slice.map((r) => r.pinterest_pin_id), start, end, PIN_METRICS
    );

    for (const [pinterestId, payload] of Object.entries(data ?? {})) {
      const ourId = byPinterestId.get(pinterestId);
      if (!ourId) continue;

      // Prefer the daily breakdown: pin_performance is keyed on
      // (pin_id, measured_on) and lifetime totals written against one date
      // would read as a single enormous day and wreck every trend on top.
      const daily = payload?.daily_metrics ?? [];
      const rows = daily.length > 0
        ? daily
            // Pinterest marks a day READY once it has settled. Anything else
            // is still moving and must not be frozen into the record.
            .filter((d) => !d.data_status || d.data_status === "READY")
            .map((d) => ({
              on: d.date,
              impressions: metric(d.metrics, "IMPRESSION"),
              saves: metric(d.metrics, "SAVE"),
              clicks: metric(d.metrics, "OUTBOUND_CLICK"),
            }))
        : [];

      for (const r of rows) {
        if (!r.on) continue;
        await pool.query(
          `INSERT INTO organic.pin_performance (pin_id, measured_on, impressions, saves, outbound_clicks)
           VALUES ($1, $2::date, $3, $4, $5)
           ON CONFLICT (pin_id, measured_on) DO UPDATE SET
             impressions     = EXCLUDED.impressions,
             saves           = EXCLUDED.saves,
             outbound_clicks = EXCLUDED.outbound_clicks`,
          [ourId, r.on, r.impressions, r.saves, r.clicks]
        );
        written += 1;
      }
    }
  }

  return { pins: published.rowCount ?? 0, rows: written };
}

/* ------------------------------------------------------------------ */

export async function pullAccountKpis(
  orgId: string,
  client: PinterestClient,
  months: number
): Promise<{ months: number; conversions: boolean }> {
  const pool = organicPool();
  const end = yesterdayISO();
  let conversionsAvailable = false;
  let written = 0;

  for (let back = 0; back < months; back++) {
    const monthStart = monthStartISO(back);
    const nextMonth = new Date(Date.parse(monthStart));
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monthEndFull = new Date(nextMonth.getTime() - 86_400_000).toISOString().slice(0, 10);
    const monthEnd = monthEndFull > end ? end : monthEndFull;
    if (monthEnd < monthStart) continue;

    const core = await client.getUserAccountAnalytics(monthStart, monthEnd, ACCOUNT_METRICS);
    const daily = core?.all?.daily_metrics ?? [];
    const ready = daily.filter((d) => !d.data_status || d.data_status === "READY");

    const sum = (name: string) => ready.reduce((t, d) => t + metric(d.metrics, name), 0);
    const avg = (name: string) => {
      const vals = ready.map((d) => metric(d.metrics, name)).filter((v) => v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    // Asked separately so a 400 here cannot take the core numbers down.
    let conv: Record<string, number> | null = null;
    try {
      const r = await client.getUserAccountAnalytics(monthStart, monthEnd, CONVERSION_METRICS);
      const cd = (r?.all?.daily_metrics ?? []).filter((d) => !d.data_status || d.data_status === "READY");
      if (cd.length > 0) {
        conv = {};
        for (const name of CONVERSION_METRICS) {
          conv[name] = cd.reduce((t, d) => t + metric(d.metrics, name), 0);
        }
        conversionsAvailable = true;
      }
    } catch {
      // No conversion access on this account. Columns stay null — see the
      // note on CONVERSION_METRICS for why that is the correct outcome.
    }

    // The month in progress is marked partial so nothing downstream
    // compares half a month against a whole one.
    const isPartial = back === 0 && monthEnd < monthEndFull;

    await pool.query(
      `INSERT INTO organic.monthly_kpis (
         org_id, month, impressions, pin_saves, pin_clicks, outbound_clicks,
         engagements, engagement_rate, save_rate,
         page_visits, add_to_cart, checkouts, conversions,
         pins_published, is_partial, measured_at
       ) VALUES (
         $1, $2::date, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, now()
       )
       ON CONFLICT (org_id, month) DO UPDATE SET
         impressions     = EXCLUDED.impressions,
         pin_saves       = EXCLUDED.pin_saves,
         pin_clicks      = EXCLUDED.pin_clicks,
         outbound_clicks = EXCLUDED.outbound_clicks,
         engagements     = EXCLUDED.engagements,
         engagement_rate = EXCLUDED.engagement_rate,
         save_rate       = EXCLUDED.save_rate,
         -- COALESCE, not overwrite: a month whose conversion access lapsed
         -- must keep the figures it had rather than blanking a sent report.
         page_visits     = COALESCE(EXCLUDED.page_visits, organic.monthly_kpis.page_visits),
         add_to_cart     = COALESCE(EXCLUDED.add_to_cart, organic.monthly_kpis.add_to_cart),
         checkouts       = COALESCE(EXCLUDED.checkouts,   organic.monthly_kpis.checkouts),
         conversions     = COALESCE(EXCLUDED.conversions, organic.monthly_kpis.conversions),
         pins_published  = EXCLUDED.pins_published,
         is_partial      = EXCLUDED.is_partial,
         measured_at     = now()`,
      [
        orgId, monthStart,
        sum("IMPRESSION"), sum("SAVE"), sum("PIN_CLICK"), sum("OUTBOUND_CLICK"),
        sum("ENGAGEMENT"), avg("ENGAGEMENT_RATE"), avg("SAVE_RATE"),
        conv ? conv.TOTAL_PAGE_VISIT : null,
        conv ? conv.TOTAL_ADD_TO_CART : null,
        conv ? conv.TOTAL_CHECKOUT : null,
        conv ? conv.TOTAL_CONVERSIONS : null,
        await pinsPublishedIn(orgId, monthStart, monthEnd),
        isPartial,
      ]
    );
    written += 1;
  }

  return { months: written, conversions: conversionsAvailable };
}

async function pinsPublishedIn(orgId: string, from: string, to: string): Promise<number> {
  const pool = organicPool();
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM organic.pins p
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1
        AND p.status = 'PUBLISHED'::organic.pin_status
        AND p.published_at::date BETWEEN $2::date AND $3::date`,
    [orgId, from, to]
  );
  return Number(r.rows[0].n);
}
