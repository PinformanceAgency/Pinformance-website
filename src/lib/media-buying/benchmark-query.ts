/**
 * Flexible benchmark aggregation for the /paid-ads/benchmarks page and the
 * AI chat panel. Given a filter (dept / niche / country / buyer) and a KPI,
 * returns a headline value, a distribution, a totals bundle, and a daily
 * series so the UI can render both a stat block and a trend chart.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BENCHMARK_MIN_STORES } from "./config";
import type { StoreSettings } from "./store-settings-types";

export type BenchmarkKpi =
  | "roas"
  | "cpm"
  | "cpc"
  | "ctr"
  | "cpa"
  | "spend"
  | "revenue"
  | "conversions";

export const BENCHMARK_KPIS: {
  key: BenchmarkKpi;
  label: string;
  format: "currency" | "ratio" | "percent" | "count";
  description: string;
}[] = [
  { key: "roas",        label: "ROAS",         format: "ratio",    description: "Revenue ÷ spend (return on ad spend)." },
  { key: "cpm",         label: "CPM",          format: "currency", description: "Cost per 1,000 impressions." },
  { key: "cpc",         label: "CPC",          format: "currency", description: "Cost per click." },
  { key: "ctr",         label: "CTR",          format: "percent",  description: "Clicks ÷ impressions." },
  { key: "cpa",         label: "CPA",          format: "currency", description: "Cost per conversion (checkout)." },
  { key: "spend",       label: "Spend",        format: "currency", description: "Total ad spend in the window." },
  { key: "revenue",     label: "Revenue",      format: "currency", description: "Total checkout value in the window." },
  { key: "conversions", label: "Conversions",  format: "count",    description: "Total checkouts in the window." },
];

export interface BenchmarkFilter {
  department?: string | null;
  niche?: string | null;
  country?: string | null;
  media_buyer?: string | null;
  days?: number;
}

export interface StoreContribution {
  org_id: string;
  store_name: string;
  department: string | null;
  niche: string | null;
  country: string | null;
  media_buyer: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  value: number | null; // for the selected KPI
}

export interface BenchmarkResult {
  filter: {
    department: string | null;
    niche: string | null;
    country: string | null;
    media_buyer: string | null;
    days: number;
  };
  kpi: BenchmarkKpi;
  n_stores: number;
  sufficient: boolean;
  headline: number | null;
  totals: {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
  };
  distribution: {
    min: number | null;
    p25: number | null;
    median: number | null;
    p75: number | null;
    max: number | null;
  };
  daily: { date: string; value: number | null; spend: number; revenue: number }[];
  stores: StoreContribution[];
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return isFinite(n) ? n : 0;
}

function kpiValueFromTotals(
  kpi: BenchmarkKpi,
  totals: { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
): number | null {
  const { spend, revenue, conversions, impressions, clicks } = totals;
  switch (kpi) {
    case "roas":
      return spend > 0 ? revenue / spend : null;
    case "cpm":
      return impressions > 0 ? (spend / impressions) * 1000 : null;
    case "cpc":
      return clicks > 0 ? spend / clicks : null;
    case "ctr":
      return impressions > 0 ? (clicks / impressions) * 100 : null;
    case "cpa":
      return conversions > 0 ? spend / conversions : null;
    case "spend":
      return spend;
    case "revenue":
      return revenue;
    case "conversions":
      return conversions;
  }
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The core query. */
export async function computeBenchmark(
  supabase: SupabaseClient,
  filter: BenchmarkFilter,
  kpi: BenchmarkKpi
): Promise<BenchmarkResult> {
  const days = Math.max(1, Math.min(90, filter.days ?? 30));
  const start = isoDaysAgo(days);
  const end = isoDaysAgo(1);

  // Pull store_settings for the whole world, then filter in memory. There
  // are at most a few dozen stores so this stays cheap.
  const { data: settingsRows, error: setErr } = await supabase
    .from("store_settings")
    .select("*");
  if (setErr) throw new Error(setErr.message);
  const settings = (settingsRows ?? []) as StoreSettings[];

  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id");
  if (orgsErr) throw new Error(orgsErr.message);
  const orgNameById = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, (o.name as string) || "(unnamed)"])
  );

  // Filter to configured + active stores that match filters.
  const eligibleStores = settings.filter((s) => {
    if (s.department == null || s.breakeven_roas == null) return false;
    if (s.is_active === false) return false;
    if (filter.department && s.department !== filter.department) return false;
    if (filter.niche && s.niche !== filter.niche) return false;
    if (filter.country && s.country !== filter.country) return false;
    if (filter.media_buyer && s.media_buyer !== filter.media_buyer) return false;
    return true;
  });

  const emptyResult: BenchmarkResult = {
    filter: {
      department: filter.department ?? null,
      niche: filter.niche ?? null,
      country: filter.country ?? null,
      media_buyer: filter.media_buyer ?? null,
      days,
    },
    kpi,
    n_stores: 0,
    sufficient: false,
    headline: null,
    totals: { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 },
    distribution: { min: null, p25: null, median: null, p75: null, max: null },
    daily: [],
    stores: [],
  };

  if (eligibleStores.length === 0) return emptyResult;

  const orgIds = eligibleStores.map((s) => s.org_id);
  const { data: metrics, error: mErr } = await supabase
    .from("pinterest_metrics_snapshots")
    .select("org_id, spend, revenue, conversions, impressions, clicks, snapshot_date")
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  if (mErr) throw new Error(mErr.message);

  // Group per store to build totals + contribution rows.
  const perStore = new Map<
    string,
    { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
  >();
  // Group per day (across all stores in the filter) for the trend chart.
  const perDay = new Map<
    string,
    { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
  >();
  const totals = { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };

  for (const r of metrics ?? []) {
    const rowSpend = num(r.spend);
    const rowRev = num(r.revenue);
    const rowConv = num(r.conversions);
    const rowImp = num(r.impressions);
    const rowClk = num(r.clicks);

    const cur = perStore.get(r.org_id as string) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    cur.spend += rowSpend;
    cur.revenue += rowRev;
    cur.conversions += rowConv;
    cur.impressions += rowImp;
    cur.clicks += rowClk;
    perStore.set(r.org_id as string, cur);

    const day = r.snapshot_date as string;
    const dCur = perDay.get(day) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    dCur.spend += rowSpend;
    dCur.revenue += rowRev;
    dCur.conversions += rowConv;
    dCur.impressions += rowImp;
    dCur.clicks += rowClk;
    perDay.set(day, dCur);

    totals.spend += rowSpend;
    totals.revenue += rowRev;
    totals.conversions += rowConv;
    totals.impressions += rowImp;
    totals.clicks += rowClk;
  }

  const stores: StoreContribution[] = eligibleStores.map((s) => {
    const t = perStore.get(s.org_id) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    return {
      org_id: s.org_id,
      store_name: orgNameById.get(s.org_id) ?? "(unknown)",
      department: s.department,
      niche: s.niche,
      country: s.country,
      media_buyer: s.media_buyer,
      spend: t.spend,
      revenue: t.revenue,
      conversions: t.conversions,
      impressions: t.impressions,
      clicks: t.clicks,
      value: kpiValueFromTotals(kpi, t),
    };
  });
  stores.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  // Distribution: only include stores that actually have a value for this KPI.
  const values = stores
    .map((s) => s.value)
    .filter((v): v is number => v != null && isFinite(v))
    .sort((a, b) => a - b);

  const daily = Array.from(perDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, t]) => ({
      date,
      value: kpiValueFromTotals(kpi, t),
      spend: t.spend,
      revenue: t.revenue,
    }));

  const n_stores = stores.length;
  const sufficient = n_stores >= BENCHMARK_MIN_STORES;

  return {
    filter: {
      department: filter.department ?? null,
      niche: filter.niche ?? null,
      country: filter.country ?? null,
      media_buyer: filter.media_buyer ?? null,
      days,
    },
    kpi,
    n_stores,
    sufficient,
    headline: sufficient ? kpiValueFromTotals(kpi, totals) : null,
    totals,
    distribution: {
      min: values[0] ?? null,
      p25: percentile(values, 0.25),
      median: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      max: values[values.length - 1] ?? null,
    },
    daily,
    stores,
  };
}

/**
 * A compact per-store table across every configured active store, used as
 * context for the AI chat panel. Small enough to fit in a single Claude
 * prompt yet detailed enough to answer any "what's the average X for Y?"
 * question.
 */
export async function buildAiContextTable(
  supabase: SupabaseClient,
  days = 30
): Promise<{
  window: { start: string; end: string; days: number };
  rows: {
    store: string;
    department: string | null;
    niche: string | null;
    country: string | null;
    media_buyer: string | null;
    ber: number | null;
    invoice_roas: number | null;
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    roas: number | null;
    cpm: number | null;
    cpc: number | null;
    ctr: number | null;
    cpa: number | null;
  }[];
}> {
  const start = isoDaysAgo(days);
  const end = isoDaysAgo(1);
  const { data: settings } = await supabase.from("store_settings").select("*");
  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgNameById = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, (o.name as string) || "(unnamed)"])
  );
  const eligible = (settings ?? []).filter(
    (s: StoreSettings) => s.department != null && s.breakeven_roas != null && s.is_active !== false
  );
  if (eligible.length === 0) return { window: { start, end, days }, rows: [] };
  const orgIds = eligible.map((s: StoreSettings) => s.org_id);
  const { data: metrics } = await supabase
    .from("pinterest_metrics_snapshots")
    .select("org_id, spend, revenue, conversions, impressions, clicks")
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  const perStore = new Map<
    string,
    { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
  >();
  for (const r of metrics ?? []) {
    const cur = perStore.get(r.org_id as string) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    cur.spend += num(r.spend);
    cur.revenue += num(r.revenue);
    cur.conversions += num(r.conversions);
    cur.impressions += num(r.impressions);
    cur.clicks += num(r.clicks);
    perStore.set(r.org_id as string, cur);
  }
  const rows = eligible.map((s: StoreSettings) => {
    const t = perStore.get(s.org_id) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    return {
      store: orgNameById.get(s.org_id) ?? "(unknown)",
      department: s.department,
      niche: s.niche,
      country: s.country,
      media_buyer: s.media_buyer,
      ber: s.breakeven_roas != null ? Number(s.breakeven_roas) : null,
      invoice_roas: s.invoice_roas != null ? Number(s.invoice_roas) : null,
      spend: t.spend,
      revenue: t.revenue,
      conversions: t.conversions,
      impressions: t.impressions,
      clicks: t.clicks,
      roas: t.spend > 0 ? t.revenue / t.spend : null,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
      cpc: t.clicks > 0 ? t.spend / t.clicks : null,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
      cpa: t.conversions > 0 ? t.spend / t.conversions : null,
    };
  });
  return { window: { start, end, days }, rows };
}
