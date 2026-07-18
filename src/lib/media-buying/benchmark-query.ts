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
  | "atc_cpa"
  | "atc_roas"
  | "spend"
  | "revenue"
  | "conversions"
  | "add_to_carts";

export const BENCHMARK_KPIS: {
  key: BenchmarkKpi;
  label: string;
  format: "currency" | "ratio" | "percent" | "count";
  description: string;
}[] = [
  { key: "roas",         label: "ROAS",         format: "ratio",    description: "Revenue ÷ spend (return on ad spend)." },
  { key: "cpm",          label: "CPM",          format: "currency", description: "Cost per 1,000 impressions." },
  { key: "cpc",          label: "CPC",          format: "currency", description: "Cost per click." },
  { key: "ctr",          label: "CTR",          format: "percent",  description: "Clicks ÷ impressions." },
  { key: "cpa",          label: "CPA",          format: "currency", description: "Cost per conversion (checkout)." },
  { key: "atc_cpa",      label: "ATC CPA",      format: "currency", description: "Cost per add-to-cart." },
  { key: "atc_roas",     label: "ATC ROAS",     format: "ratio",    description: "Add-to-cart value ÷ spend." },
  { key: "spend",        label: "Spend",        format: "currency", description: "Total ad spend in the window." },
  { key: "revenue",      label: "Revenue",      format: "currency", description: "Total checkout value in the window." },
  { key: "conversions",  label: "Conversions",  format: "count",    description: "Total checkouts in the window." },
  { key: "add_to_carts", label: "Add-to-carts", format: "count",    description: "Total add-to-cart events in the window." },
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
  add_to_carts: number;
  add_to_cart_value: number;
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
    add_to_carts: number;
    add_to_cart_value: number;
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
  totals: {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    add_to_carts: number;
    add_to_cart_value: number;
  }
): number | null {
  const {
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    add_to_carts,
    add_to_cart_value,
  } = totals;
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
    case "atc_cpa":
      return add_to_carts > 0 ? spend / add_to_carts : null;
    case "atc_roas":
      return spend > 0 && add_to_cart_value > 0 ? add_to_cart_value / spend : null;
    case "spend":
      return spend;
    case "revenue":
      return revenue;
    case "conversions":
      return conversions;
    case "add_to_carts":
      return add_to_carts;
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
    totals: { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, add_to_carts: 0, add_to_cart_value: 0 },
    distribution: { min: null, p25: null, median: null, p75: null, max: null },
    daily: [],
    stores: [],
  };

  if (eligibleStores.length === 0) return emptyResult;

  const orgIds = eligibleStores.map((s) => s.org_id);
  const { data: metrics, error: mErr } = await supabase
    .from("pinterest_metrics_snapshots")
    .select(
      "org_id, spend, revenue, conversions, impressions, clicks, add_to_carts, add_to_cart_value, snapshot_date"
    )
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  if (mErr) throw new Error(mErr.message);

  type Bucket = {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    add_to_carts: number;
    add_to_cart_value: number;
  };
  const emptyBucket = (): Bucket => ({
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    add_to_carts: 0,
    add_to_cart_value: 0,
  });

  // Group per store to build totals + contribution rows.
  const perStore = new Map<string, Bucket>();
  // Group per day (across all stores in the filter) for the trend chart.
  const perDay = new Map<string, Bucket>();
  const totals: Bucket = emptyBucket();

  for (const r of metrics ?? []) {
    const rowSpend = num(r.spend);
    const rowRev = num(r.revenue);
    const rowConv = num(r.conversions);
    const rowImp = num(r.impressions);
    const rowClk = num(r.clicks);
    const rowAtc = num(r.add_to_carts);
    const rowAtcVal = num(r.add_to_cart_value);

    const cur = perStore.get(r.org_id as string) ?? emptyBucket();
    cur.spend += rowSpend;
    cur.revenue += rowRev;
    cur.conversions += rowConv;
    cur.impressions += rowImp;
    cur.clicks += rowClk;
    cur.add_to_carts += rowAtc;
    cur.add_to_cart_value += rowAtcVal;
    perStore.set(r.org_id as string, cur);

    const day = r.snapshot_date as string;
    const dCur = perDay.get(day) ?? emptyBucket();
    dCur.spend += rowSpend;
    dCur.revenue += rowRev;
    dCur.conversions += rowConv;
    dCur.impressions += rowImp;
    dCur.clicks += rowClk;
    dCur.add_to_carts += rowAtc;
    dCur.add_to_cart_value += rowAtcVal;
    perDay.set(day, dCur);

    totals.spend += rowSpend;
    totals.revenue += rowRev;
    totals.conversions += rowConv;
    totals.impressions += rowImp;
    totals.clicks += rowClk;
    totals.add_to_carts += rowAtc;
    totals.add_to_cart_value += rowAtcVal;
  }

  const stores: StoreContribution[] = eligibleStores.map((s) => {
    const t = perStore.get(s.org_id) ?? emptyBucket();
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
      add_to_carts: t.add_to_carts,
      add_to_cart_value: t.add_to_cart_value,
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
    add_to_carts: number;
    add_to_cart_value: number;
    roas: number | null;
    cpm: number | null;
    cpc: number | null;
    ctr: number | null;
    cpa: number | null;
    atc_cpa: number | null;
    atc_roas: number | null;
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
    .select(
      "org_id, spend, revenue, conversions, impressions, clicks, add_to_carts, add_to_cart_value"
    )
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  type Bucket = {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    add_to_carts: number;
    add_to_cart_value: number;
  };
  const empty = (): Bucket => ({
    spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, add_to_carts: 0, add_to_cart_value: 0,
  });
  const perStore = new Map<string, Bucket>();
  for (const r of metrics ?? []) {
    const cur = perStore.get(r.org_id as string) ?? empty();
    cur.spend += num(r.spend);
    cur.revenue += num(r.revenue);
    cur.conversions += num(r.conversions);
    cur.impressions += num(r.impressions);
    cur.clicks += num(r.clicks);
    cur.add_to_carts += num(r.add_to_carts);
    cur.add_to_cart_value += num(r.add_to_cart_value);
    perStore.set(r.org_id as string, cur);
  }
  const rows = eligible.map((s: StoreSettings) => {
    const t = perStore.get(s.org_id) ?? empty();
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
      add_to_carts: t.add_to_carts,
      add_to_cart_value: t.add_to_cart_value,
      roas: t.spend > 0 ? t.revenue / t.spend : null,
      cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
      cpc: t.clicks > 0 ? t.spend / t.clicks : null,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
      cpa: t.conversions > 0 ? t.spend / t.conversions : null,
      atc_cpa: t.add_to_carts > 0 ? t.spend / t.add_to_carts : null,
      atc_roas: t.spend > 0 && t.add_to_cart_value > 0 ? t.add_to_cart_value / t.spend : null,
    };
  });
  return { window: { start, end, days }, rows };
}
