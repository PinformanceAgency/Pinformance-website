/**
 * Store Ranking — the delivery meeting, on the dashboard.
 *
 * Same numbers and the same two statuses as the weekly delivery deck
 * (Tristan, 28-09-2026), so the screen and the meeting cannot disagree:
 *
 *   WEEK   the last full Monday–Sunday week, against the week before it.
 *          ROAS on track  = week ROAS ≥ invoice ROAS.
 *          Volume on track = week revenue (spend for a spend-fee store) ≥ the
 *          weekly floor — €5,000 revenue / €1,726 spend, in the store's own
 *          currency at the latest ECB rate.
 *   MONTH  month to date, ending the day BEFORE yesterday. Yesterday's
 *          Pinterest numbers are still coming in (late conversions), so a
 *          month that includes it reads lower than it will end up. On a
 *          Monday that makes the month run to Saturday while the week runs to
 *          Sunday — deliberately.
 *          Volume on track = MTD ≥ weekly floor × days / 7.
 *          ROAS on track   = ROAS MTD ≥ invoice ROAS.
 *
 * A store is ON TRACK when its month is: both month pills green. That is how
 * the deck splits its pages; the week pills say how last week went.
 *
 * CUSTOM RANGE (storeRankingRangePeriods): any period in place of the week,
 * against the period of the same length right before it. Judged exactly like
 * the week — ROAS ≥ invoice, volume ≥ weekly floor × days / 7 — so a 7-day
 * range that is a Mon–Sun week gives the same pills as the week view. Month
 * to date stays beside it, unchanged: it is always wanted (Tristan,
 * 28-09-2026), and it still decides On track / Off track.
 *
 * What the deck has and this does not: the target the buyer agreed for the
 * week (it lives in the Weekly Store Log on Monday, not here), so the week's
 * volume is shown against the floor. The deck never lets a lower agreed
 * target turn a below-floor week green either, so the status is the same.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  invoiceRoasTarget,
  scaleFloorFor,
  type InvoicingModel,
} from "./config";
import { loadFxRates, ratePerEur } from "./fx";
import type { StoreSettings } from "./store-settings-types";

export interface PeriodFigures {
  spend: number;
  revenue: number;
  roas: number | null;
}

export interface StoreRankingRow {
  org_id: string;
  store_name: string;
  media_buyer: string | null;
  department: string | null;
  currency: string | null;
  /** Spend-fee store: volume is judged on spend, not revenue. */
  spend_account: boolean;
  /** The ROAS every pill is measured against — the invoice ROAS. */
  roas_target: number | null;
  prev_week: PeriodFigures;
  week: PeriodFigures & {
    /** Revenue, or spend for a spend account. */
    volume: number;
    volume_target: number;
    roas_on_track: boolean;
    volume_on_track: boolean;
    on_track: boolean;
  };
  month: PeriodFigures & {
    volume: number;
    volume_target: number;
    roas_on_track: boolean;
    volume_on_track: boolean;
    on_track: boolean;
  };
}

export interface StoreRankingPeriods {
  /** "week": a Mon–Sun week plus month to date. "range": a chosen period in
   *  the week_* fields, with the same month to date beside it. */
  mode: "week" | "range";
  /** Monday and Sunday of the week being reported. */
  week_start: string;
  week_end: string;
  /** Length of the week_* period in days — 7, or the custom range's. */
  week_days: number;
  prev_week_start: string;
  prev_week_end: string;
  month_start: string;
  month_end: string;
  month_days: number;
  /** True when this is the most recent full week (the default view). */
  latest: boolean;
}

const DAY = 24 * 3600 * 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) =>
  iso(new Date(new Date(isoDate + "T00:00:00Z").getTime() + n * DAY));

/**
 * The periods for a report. `weekStart` picks an older week (any date in it);
 * omitted, it is the last full Mon–Sun week before today.
 *
 * The month runs to the day before yesterday for the latest week. For an
 * older week it runs to that week's Sunday, as the deck of that week did —
 * "month to date" as of today would sit next to a week from a month ago.
 */
export function storeRankingPeriods(
  weekStart?: string | null,
  now: Date = new Date(),
): StoreRankingPeriods {
  const today = iso(now);
  const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; // Mon = 0
  const latestStart = addDays(today, -dow - 7);

  let start = latestStart;
  if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    const d = new Date(weekStart + "T00:00:00Z");
    if (!isNaN(d.getTime())) {
      const wd = (d.getUTCDay() + 6) % 7;
      const picked = addDays(weekStart, -wd);
      if (picked < latestStart) start = picked;
    }
  }
  const latest = start === latestStart;
  const end = addDays(start, 6);
  const monthEnd = latest ? addDays(today, -2) : end;
  const monthStart = monthEnd.slice(0, 8) + "01";
  return {
    mode: "week",
    week_start: start,
    week_end: end,
    week_days: 7,
    prev_week_start: addDays(start, -7),
    prev_week_end: addDays(start, -1),
    month_start: monthStart,
    month_end: monthEnd,
    month_days: Number(monthEnd.slice(8, 10)),
    latest,
  };
}

/** Longest custom range: a year, so a typo in the year cannot read ten. */
export const MAX_RANGE_DAYS = 366;

/**
 * A chosen [from, to] period (inclusive) and the equally long one before it.
 * `to` is capped at yesterday: today has no data yet. Throws on a period that
 * is not one, so the route can say why.
 */
export function storeRankingRangePeriods(
  from: string,
  to: string,
  now: Date = new Date(),
): StoreRankingPeriods {
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d + "T00:00:00Z"));
  if (!valid(from) || !valid(to)) throw new Error("Dates must be YYYY-MM-DD");
  const yesterday = addDays(iso(now), -1);
  const end = to > yesterday ? yesterday : to;
  if (from > end) throw new Error("The start date must be on or before the end date (and before today)");
  const days = Math.round((Date.parse(end) - Date.parse(from)) / DAY) + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`A range can be at most ${MAX_RANGE_DAYS} days`);
  // Month to date is the same as in the week view: the current month up to
  // the day before yesterday, whatever range is chosen.
  const { month_start, month_end, month_days } = storeRankingPeriods(null, now);
  return {
    mode: "range",
    week_start: from,
    week_end: end,
    week_days: days,
    prev_week_start: addDays(from, -days),
    prev_week_end: addDays(from, -1),
    month_start,
    month_end,
    month_days,
    latest: false,
  };
}

interface MetricRow {
  org_id: string;
  spend: number | string;
  revenue: number | string;
  currency: string | null;
  snapshot_date: string;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

function figures(spend: number, revenue: number): PeriodFigures {
  return { spend, revenue, roas: spend > 0 ? revenue / spend : null };
}

export async function computeStoreRanking(
  supabase: SupabaseClient,
  periods: StoreRankingPeriods,
): Promise<StoreRankingRow[]> {
  // Configured + active stores only — this view is for live management,
  // not onboarding/inactive orgs.
  const { data: settings, error: setErr } = await supabase
    .from("store_settings")
    .select("*");
  if (setErr) throw new Error(setErr.message);
  const settingsByOrg = new Map<string, StoreSettings>(
    (settings ?? []).map((s) => [s.org_id, s as StoreSettings])
  );

  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id");
  if (orgsErr) throw new Error(orgsErr.message);

  const orgIds = (orgs ?? [])
    .filter((o) => o.pinterest_user_id)
    .map((o) => o.id as string);
  if (orgIds.length === 0) return [];

  const fxRates = await loadFxRates(supabase);

  // One read covering all three periods.
  const from = [periods.prev_week_start, periods.month_start].sort()[0];
  const to = [periods.week_end, periods.month_end].sort()[1];
  const PAGE = 1000;
  const rows: MetricRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("pinterest_metrics_snapshots")
      .select("org_id, spend, revenue, currency, snapshot_date")
      .eq("entity_type", "account")
      .gte("snapshot_date", from)
      .lte("snapshot_date", to)
      .in("org_id", orgIds)
      .order("snapshot_date", { ascending: false })
      // Tiebreaker on the primary key — snapshot_date alone is not a total
      // order, and PostgREST may then return a row on two pages or on none.
      // These rows are SUMMED, so that lands as a wrong number rather than as
      // an error. Same defect measured and fixed in zones.ts on 02-09-2026.
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as MetricRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // Sum every account-level row per org and period — an org with two ad
  // accounts is one store, the same as the weekly buckets on Zones.
  type Acc = { spend: number; revenue: number };
  const zero = (): Acc => ({ spend: 0, revenue: 0 });
  const perOrg = new Map<
    string,
    { prev: Acc; week: Acc; month: Acc; currency: string | null }
  >();
  const inRange = (d: string, a: string, b: string) => d >= a && d <= b;
  for (const r of rows) {
    const acc =
      perOrg.get(r.org_id) ??
      { prev: zero(), week: zero(), month: zero(), currency: null };
    const add = (t: Acc) => {
      t.spend += n(r.spend);
      t.revenue += n(r.revenue);
    };
    const d = r.snapshot_date;
    if (inRange(d, periods.prev_week_start, periods.prev_week_end)) add(acc.prev);
    if (inRange(d, periods.week_start, periods.week_end)) add(acc.week);
    if (inRange(d, periods.month_start, periods.month_end)) add(acc.month);
    if (r.currency && !acc.currency) acc.currency = r.currency;
    perOrg.set(r.org_id, acc);
  }

  const result: StoreRankingRow[] = [];
  for (const o of orgs ?? []) {
    const s = settingsByOrg.get(o.id as string);
    const configured = !!(s && s.department != null && s.breakeven_roas != null);
    const isActive = s?.is_active ?? true;
    if (!configured || !isActive || !o.pinterest_user_id) continue;

    const tot = perOrg.get(o.id as string) ??
      { prev: zero(), week: zero(), month: zero(), currency: null };
    const currency =
      tot.currency ?? (s as { currency?: string } | undefined)?.currency ?? null;
    const invoicingModel: InvoicingModel =
      (s?.invoicing_model as InvoicingModel | undefined) ?? "revenue_fee";
    const target = invoiceRoasTarget(s?.invoice_roas, s?.breakeven_roas, s?.zone_thresholds);
    const gateOpts = {
      invoicingModel,
      minMonthlySpend: s?.min_monthly_spend ?? null,
      overrides: s?.zone_thresholds,
      scaleBasis: "range" as const,
      fxPerEur: ratePerEur(fxRates, currency),
    };
    const weekGate = scaleFloorFor({ ...gateOpts, rangeDays: periods.week_days });
    const monthGate = scaleFloorFor({ ...gateOpts, rangeDays: periods.month_days });
    const spendAccount = weekGate.metric === "spend";

    const judge = (a: Acc, floor: number) => {
      const f = figures(a.spend, a.revenue);
      const volume = spendAccount ? a.spend : a.revenue;
      const roasOk = f.roas != null && target != null && f.roas >= target;
      const volumeOk = volume > 0 && volume >= floor;
      return {
        ...f,
        volume,
        volume_target: floor,
        roas_on_track: roasOk,
        volume_on_track: volumeOk,
        on_track: roasOk && volumeOk,
      };
    };

    result.push({
      org_id: o.id as string,
      store_name: (o.name as string) || "(unnamed)",
      media_buyer: s?.media_buyer ?? null,
      department: s?.department ?? null,
      currency,
      spend_account: spendAccount,
      roas_target: target,
      prev_week: figures(tot.prev.spend, tot.prev.revenue),
      week: judge(tot.week, weekGate.floor),
      month: judge(tot.month, monthGate.floor),
    });
  }

  return result;
}
