"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Hash,
  BarChart2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  DateRangePicker,
  presetToRange,
  type DateRange,
} from "@/components/shared/date-range-picker";
import {
  ConversionSettings,
  CONVERSION_WINDOWS,
  CONVERSION_SETTINGS_STORAGE_KEY,
  type ConversionWindow,
} from "@/components/shared/conversion-settings";
import type { CampaignParsed } from "@/lib/pinterest/naming-conventions";

interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  parsed: CampaignParsed;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
  cpm: number;
}

interface ApiResponse {
  ok?: boolean;
  ad_account_name?: string;
  currency?: string;
  campaigns?: CampaignRow[];
  error?: string;
}

// ---- Formatters ----
const fmtCurrency = (n: number | null, currency: string): string => {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
};
const fmtRoas = (n: number | null): string =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`;
const fmtNum = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n: number | null): string =>
  n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}%`;

function roasColor(roas: number, spend: number): string {
  if (spend === 0) return "text-muted-foreground";
  if (roas >= 3) return "text-emerald-600";
  if (roas >= 1.5) return "text-foreground";
  return "text-amber-600";
}

// ---- Dimensions (drives slicers + comparison view) ----
type DimensionKey =
  | "country"
  | "catalog"
  | "performancePlus"
  | "funnel"
  | "strategy"
  | "objective";

const DIMENSIONS: { key: DimensionKey; label: string; values: string[] | "auto" }[] = [
  { key: "country", label: "Country", values: "auto" },
  { key: "catalog", label: "Catalog", values: ["CAT", "NON_CAT"] },
  { key: "performancePlus", label: "Performance+", values: ["P+", "NP+"] },
  { key: "funnel", label: "Funnel", values: ["PROSP", "RET"] },
  { key: "strategy", label: "Strategy", values: ["HERO", "TEST", "CATG"] },
  { key: "objective", label: "Objective", values: ["CONV", "ROAS"] },
];

const LABELS: Record<string, string> = {
  CAT: "Catalog",
  NON_CAT: "Non-catalog",
  "P+": "Performance+",
  "NP+": "Non-Perf+",
  PROSP: "Prospecting",
  RET: "Retargeting",
  HERO: "Hero",
  TEST: "Test",
  CATG: "Category",
  CONV: "Conversion",
  ROAS: "ROAS",
};

const COHORT_COLORS = [
  "#2563EB", "#16A34A", "#E25822", "#7C3AED",
  "#0EA5E9", "#DB2777", "#CA8A04", "#0F766E",
  "#9333EA", "#DC2626",
];

function getDim(row: CampaignRow, key: DimensionKey): string | null {
  const v = row.parsed[key];
  return v == null ? null : String(v);
}

export default function CampaignLevelPage() {
  const { org } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange(7));
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filter state: per dimension, set of selected values. Empty = no filter.
  const [filters, setFilters] = useState<Record<DimensionKey, Set<string>>>({
    country: new Set(),
    catalog: new Set(),
    performancePlus: new Set(),
    funnel: new Set(),
    strategy: new Set(),
    objective: new Set(),
  });

  // Comparison dimension for the bar chart.
  const [comparisonDim, setComparisonDim] = useState<DimensionKey>("performancePlus");
  const [comparisonMetric, setComparisonMetric] = useState<"spend" | "roas" | "cpa" | "revenue">(
    "roas"
  );

  // Table sort.
  const [tableSort, setTableSort] = useState<
    "spend" | "revenue" | "conversions" | "roas" | "cpa" | "name"
  >("spend");

  const [hygieneOpen, setHygieneOpen] = useState(false);

  // Default view = Numbers (KPIs + table). Toggle to Chart reveals the
  // comparison chart + cohort summary.
  const [viewMode, setViewMode] = useState<"numbers" | "chart">("numbers");

  // Restore persisted conversion window.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CONVERSION_SETTINGS_STORAGE_KEY);
    if (saved && CONVERSION_WINDOWS.some((w) => w.key === saved)) {
      setConversionWindow(saved as ConversionWindow);
    }
  }, []);
  function updateConversionWindow(w: ConversionWindow) {
    setConversionWindow(w);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONVERSION_SETTINGS_STORAGE_KEY, w);
    }
  }

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cw = CONVERSION_WINDOWS.find((w) => w.key === conversionWindow)!;
        const res = await fetch("/api/pinterest/media-buying/campaigns", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: dateRange.start,
            end_date: dateRange.end,
            click_window: cw.click,
            view_window: cw.view,
          }),
        });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setData(json);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [org, dateRange, conversionWindow, refreshKey]);

  const currency = data?.currency || "USD";
  const allCampaigns = useMemo(() => data?.campaigns || [], [data?.campaigns]);

  // Available values per dimension (only those present in the data).
  const availableValues = useMemo(() => {
    const map: Record<DimensionKey, Set<string>> = {
      country: new Set(),
      catalog: new Set(),
      performancePlus: new Set(),
      funnel: new Set(),
      strategy: new Set(),
      objective: new Set(),
    };
    for (const c of allCampaigns) {
      for (const d of DIMENSIONS) {
        const v = getDim(c, d.key);
        if (v) map[d.key].add(v);
      }
    }
    return map;
  }, [allCampaigns]);

  // Apply slicer filters → filtered campaign set.
  const filtered = useMemo(() => {
    return allCampaigns.filter((c) => {
      for (const d of DIMENSIONS) {
        const sel = filters[d.key];
        if (sel.size === 0) continue;
        const v = getDim(c, d.key);
        if (!v || !sel.has(v)) return false;
      }
      return true;
    });
  }, [allCampaigns, filters]);

  // Aggregate metrics across a set of rows.
  function aggregate(rows: CampaignRow[]) {
    let spend = 0, revenue = 0, conversions = 0, impressions = 0, clicks = 0;
    for (const r of rows) {
      spend += r.spend;
      revenue += r.revenue;
      conversions += r.conversions;
      impressions += r.impressions;
      clicks += r.clicks;
    }
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = conversions > 0 ? spend / conversions : null;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    return { spend, revenue, conversions, impressions, clicks, roas, cpa, ctr, cpm };
  }

  const totals = useMemo(() => aggregate(filtered), [filtered]);
  const totalsAll = useMemo(() => aggregate(allCampaigns), [allCampaigns]);

  // Comparison view: group filtered rows by comparison dim. The comparison
  // dimension's filter is intentionally ignored (you want to see all values
  // of the dim you're comparing).
  const comparison = useMemo(() => {
    const groupKey = comparisonDim;
    const baseRows = allCampaigns.filter((c) => {
      for (const d of DIMENSIONS) {
        if (d.key === groupKey) continue;
        const sel = filters[d.key];
        if (sel.size === 0) continue;
        const v = getDim(c, d.key);
        if (!v || !sel.has(v)) return false;
      }
      return true;
    });
    const byValue = new Map<string, CampaignRow[]>();
    for (const c of baseRows) {
      const v = getDim(c, groupKey) || "(missing)";
      const arr = byValue.get(v) || [];
      arr.push(c);
      byValue.set(v, arr);
    }
    const entries = Array.from(byValue.entries()).map(([value, rows]) => {
      const agg = aggregate(rows);
      return {
        value,
        label: LABELS[value] || value,
        campaigns: rows.length,
        ...agg,
      };
    });
    // Sort by selected metric desc, but CPA asc (lower better).
    entries.sort((a, b) => {
      if (comparisonMetric === "cpa") {
        const av = a.cpa ?? Number.POSITIVE_INFINITY;
        const bv = b.cpa ?? Number.POSITIVE_INFINITY;
        return av - bv;
      }
      return (b[comparisonMetric] || 0) - (a[comparisonMetric] || 0);
    });
    return entries;
  }, [allCampaigns, filters, comparisonDim, comparisonMetric]);

  // Best combinations: top 5 combinations of (country × funnel × strategy ×
  // objective) by ROAS, but only counting combos whose total spend is in the
  // top quartile of all combos — filters out noisy small-spend winners.
  const bestCombinations = useMemo(() => {
    type Combo = { key: string; tokens: string[]; campaigns: number; spend: number; revenue: number; conversions: number; roas: number; cpa: number | null };
    const byCombo = new Map<string, CampaignRow[]>();
    for (const c of filtered) {
      const tokens = [
        c.parsed.country || "?",
        c.parsed.performancePlus || "?",
        c.parsed.funnel || "?",
        c.parsed.strategy || "?",
        c.parsed.objective || "?",
      ];
      const key = tokens.join(" | ");
      const arr = byCombo.get(key) || [];
      arr.push(c);
      byCombo.set(key, arr);
    }
    const combos: Combo[] = Array.from(byCombo.entries()).map(([key, rows]) => {
      const agg = aggregate(rows);
      return {
        key,
        tokens: key.split(" | "),
        campaigns: rows.length,
        spend: agg.spend,
        revenue: agg.revenue,
        conversions: agg.conversions,
        roas: agg.roas,
        cpa: agg.cpa,
      };
    });
    if (combos.length === 0) return [];
    // Spend quartile threshold.
    const spends = combos.map((c) => c.spend).sort((a, b) => a - b);
    const q75 = spends[Math.floor((spends.length - 1) * 0.75)];
    const eligible = combos.filter((c) => c.spend >= q75 && c.spend > 0);
    eligible.sort((a, b) => b.roas - a.roas);
    return eligible.slice(0, 5);
  }, [filtered]);

  // Naming-hygiene: which campaigns have unknown tokens.
  const offenders = useMemo(
    () => allCampaigns.filter((c) => c.parsed.unknown.length > 0),
    [allCampaigns]
  );

  // ---- Sorted table rows ----
  const sortedRows = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (tableSort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "cpa": {
          const av = a.cpa == null || a.cpa <= 0 ? Number.POSITIVE_INFINITY : a.cpa;
          const bv = b.cpa == null || b.cpa <= 0 ? Number.POSITIVE_INFINITY : b.cpa;
          return av - bv;
        }
        default:
          return (b[tableSort] || 0) - (a[tableSort] || 0);
      }
    });
    return arr;
  }, [filtered, tableSort]);

  // ---- Quartile thresholds for table colors ----
  const thresholds = useMemo(() => {
    const r = sortedRows.filter((c) => c.spend > 0).map((c) => c.roas).sort((a, b) => a - b);
    const c = sortedRows
      .filter((c) => c.cpa != null && c.spend > 0)
      .map((c) => c.cpa as number)
      .sort((a, b) => a - b);
    const q = (a: number[], p: number) =>
      a.length === 0 ? null : a[Math.floor((a.length - 1) * p)];
    return {
      roasGood: q(r, 0.75),
      roasBad: q(r, 0.25),
      cpaGood: q(c, 0.25),
      cpaBad: q(c, 0.75),
    };
  }, [sortedRows]);

  function colorRoas(roas: number, spend: number): string {
    if (spend === 0) return "text-muted-foreground";
    if (thresholds.roasGood != null && roas >= thresholds.roasGood && roas >= 2)
      return "text-emerald-600 font-medium";
    if (thresholds.roasBad != null && roas <= thresholds.roasBad && roas < 1.5)
      return "text-red-600 font-medium";
    return "text-foreground";
  }
  function colorCpa(cpa: number | null, spend: number): string {
    if (cpa == null || spend === 0) return "text-muted-foreground";
    if (thresholds.cpaGood != null && cpa <= thresholds.cpaGood)
      return "text-emerald-600 font-medium";
    if (thresholds.cpaBad != null && cpa >= thresholds.cpaBad)
      return "text-red-600 font-medium";
    return "text-foreground";
  }

  function toggleFilter(dim: DimensionKey, value: string) {
    setFilters((prev) => {
      const next = { ...prev, [dim]: new Set(prev[dim]) };
      if (next[dim].has(value)) next[dim].delete(value);
      else next[dim].add(value);
      return next;
    });
  }
  function clearAllFilters() {
    setFilters({
      country: new Set(),
      catalog: new Set(),
      performancePlus: new Set(),
      funnel: new Set(),
      strategy: new Set(),
      objective: new Set(),
    });
  }
  const hasAnyFilter = Object.values(filters).some((s) => s.size > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campaign Level</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.ad_account_name
                ? `Campaign breakdown for ${data.ad_account_name}, sliced by parsed naming conventions.`
                : "Campaign breakdown sliced by parsed naming conventions."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ConversionSettings value={conversionWindow} onChange={updateConversionWindow} />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            title="Refresh from Pinterest"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Naming-hygiene banner */}
      {offenders.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
          <button
            onClick={() => setHygieneOpen((v) => !v)}
            className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-2.5 text-sm">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <span className="font-medium text-amber-800">
                {offenders.length} campaign{offenders.length === 1 ? "" : "s"} with non-standard naming
              </span>
              <span className="text-amber-700/80">
                — they'll still appear in totals but won't classify cleanly.
              </span>
            </div>
            {hygieneOpen ? (
              <ChevronDown className="w-4 h-4 text-amber-700" />
            ) : (
              <ChevronRight className="w-4 h-4 text-amber-700" />
            )}
          </button>
          {hygieneOpen && (
            <ul className="px-4 pb-3 space-y-1 max-h-64 overflow-y-auto">
              {offenders.slice(0, 100).map((c) => (
                <li key={c.id} className="text-xs text-amber-900/90 flex items-baseline gap-2">
                  <span className="font-mono">{c.name}</span>
                  <span className="text-amber-700/70">
                    → unknown: {c.parsed.unknown.join(", ")}
                  </span>
                </li>
              ))}
              {offenders.length > 100 && (
                <li className="text-xs text-amber-700/70 italic">
                  …and {offenders.length - 100} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Slicers */}
      <section className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Filters</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click chips to filter campaigns. Within a dimension chips combine with OR; across dimensions
              with AND.
            </p>
          </div>
          {hasAnyFilter && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Clear all filters
            </button>
          )}
        </div>
        <div className="space-y-2.5">
          {DIMENSIONS.map((d) => {
            const valuesInData = Array.from(availableValues[d.key]);
            // For fixed-enum dims, show all enum values even if empty (greyed)
            // so users see the full spectrum. For "auto" (country), show only
            // values found in data.
            const values =
              d.values === "auto"
                ? valuesInData.sort()
                : d.values.filter((v) => valuesInData.includes(v) || valuesInData.length > 0);
            if (values.length === 0) return null;
            return (
              <div key={d.key} className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground w-24 flex-shrink-0">
                  {d.label}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {values.map((v) => {
                    const selected = filters[d.key].has(v);
                    const present = valuesInData.includes(v);
                    return (
                      <button
                        key={v}
                        onClick={() => present && toggleFilter(d.key, v)}
                        disabled={!present}
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-md border transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : present
                              ? "bg-card text-foreground border-border hover:bg-muted"
                              : "bg-muted/30 text-muted-foreground/50 border-transparent cursor-not-allowed"
                        )}
                      >
                        {LABELS[v] || v}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* KPI strip for current slice */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard
          label="Spend"
          value={fmtCurrency(totals.spend, currency)}
          sub={hasAnyFilter ? `${((totals.spend / Math.max(1, totalsAll.spend)) * 100).toFixed(0)}% of total` : `${filtered.length} campaign${filtered.length === 1 ? "" : "s"}`}
        />
        <KpiCard
          label="Revenue"
          value={fmtCurrency(totals.revenue, currency)}
          sub={hasAnyFilter ? `${((totals.revenue / Math.max(1, totalsAll.revenue)) * 100).toFixed(0)}% of total` : ""}
        />
        <KpiCard
          label="Conversions"
          value={fmtNum(totals.conversions)}
          sub=""
        />
        <KpiCard
          label="ROAS"
          value={fmtRoas(totals.roas)}
          sub=""
          valueClass={roasColor(totals.roas, totals.spend)}
        />
        <KpiCard
          label="CPA"
          value={fmtCurrency(totals.cpa, currency)}
          sub=""
        />
      </section>

      {/* View toggle: Numbers (default) ↔ Chart */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {viewMode === "numbers"
            ? "Showing the campaigns table and best combinations for the current slice."
            : "Comparing cohorts within a single dimension. Switch back to Numbers for the raw table."}
        </p>
        <div className="inline-flex items-center rounded-lg border border-border bg-card overflow-hidden">
          <button
            onClick={() => setViewMode("numbers")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "numbers"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Hash className="w-3.5 h-3.5" />
            Numbers
          </button>
          <button
            onClick={() => setViewMode("chart")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "chart"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Chart
          </button>
        </div>
      </div>

      {/* Comparison view — chart mode only */}
      {viewMode === "chart" && (
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-base font-semibold">Comparison</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Compare cohorts within a single dimension. Filter for the comparison dimension is
              ignored so all values are visible.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Dimension</span>
            <select
              value={comparisonDim}
              onChange={(e) => setComparisonDim(e.target.value as DimensionKey)}
              className="px-2 py-1 rounded-lg border border-border bg-card text-foreground"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground ml-2">Metric</span>
            <select
              value={comparisonMetric}
              onChange={(e) =>
                setComparisonMetric(e.target.value as typeof comparisonMetric)
              }
              className="px-2 py-1 rounded-lg border border-border bg-card text-foreground"
            >
              <option value="spend">Spend</option>
              <option value="revenue">Revenue</option>
              <option value="roas">ROAS</option>
              <option value="cpa">CPA (lower better)</option>
            </select>
          </div>
        </div>
        <div className="w-full h-64">
          {comparison.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading…" : "No campaigns in this slice."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} stroke="#d1d5db" />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  stroke="#d1d5db"
                  tickFormatter={(v) => {
                    const n = Number(v);
                    if (comparisonMetric === "roas") return `${n.toFixed(1)}x`;
                    return new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency,
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(n);
                  }}
                />
                <Tooltip
                  formatter={(value) => {
                    const n = Number(value) || 0;
                    if (comparisonMetric === "roas") return [fmtRoas(n), "ROAS"];
                    if (comparisonMetric === "cpa") return [fmtCurrency(n, currency), "CPA"];
                    return [
                      fmtCurrency(n, currency),
                      comparisonMetric === "spend" ? "Spend" : "Revenue",
                    ];
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey={comparisonMetric} radius={[4, 4, 0, 0]}>
                  {comparison.map((_, i) => (
                    <Cell key={i} fill={COHORT_COLORS[i % COHORT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        {/* Cohort summary table */}
        {comparison.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <th className="text-left font-medium px-3 py-2">Cohort</th>
                  <th className="text-right font-medium px-3 py-2">Campaigns</th>
                  <th className="text-right font-medium px-3 py-2">Spend</th>
                  <th className="text-right font-medium px-3 py-2">Revenue</th>
                  <th className="text-right font-medium px-3 py-2">Conv.</th>
                  <th className="text-right font-medium px-3 py-2">ROAS</th>
                  <th className="text-right font-medium px-3 py-2">CPA</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <tr key={row.value} className="border-t border-border">
                    <td className="px-3 py-2 flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ background: COHORT_COLORS[i % COHORT_COLORS.length] }}
                      />
                      <span className="font-medium">{row.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.campaigns}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCurrency(row.spend, currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCurrency(row.revenue, currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(row.conversions)}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        roasColor(row.roas, row.spend)
                      )}
                    >
                      {fmtRoas(row.roas)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtCurrency(row.cpa, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Best combinations — numbers mode only */}
      {viewMode === "numbers" && bestCombinations.length > 0 && (
        <section className="bg-card border border-border rounded-2xl p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Best combinations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Top 5 combinations of Country · P+/NP+ · Funnel · Strategy · Objective by ROAS,
              filtered to combos in the top 25% of spend (so small-spend outliers don't dominate).
            </p>
          </div>
          <div className="space-y-2">
            {bestCombinations.map((c) => (
              <div
                key={c.key}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border bg-muted/20"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {c.tokens.map((t, i) => (
                    <span
                      key={i}
                      className={cn(
                        "px-1.5 py-0.5 text-[11px] font-mono rounded",
                        t === "?" ? "bg-muted text-muted-foreground" : "bg-card text-foreground border border-border"
                      )}
                    >
                      {t}
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">
                    {c.campaigns} campaign{c.campaigns === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs tabular-nums">
                  <span className="text-muted-foreground">{fmtCurrency(c.spend, currency)} spend</span>
                  <span className={cn("font-medium", roasColor(c.roas, c.spend))}>
                    {fmtRoas(c.roas)}
                  </span>
                  <span className="text-muted-foreground">
                    {fmtCurrency(c.cpa, currency)} CPA
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Campaign table — numbers mode only */}
      {viewMode === "numbers" && (
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold">Campaigns ({filtered.length})</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              All campaigns in the current slice, with parsed dimensions and performance.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sort:</span>
            <select
              value={tableSort}
              onChange={(e) => setTableSort(e.target.value as typeof tableSort)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted"
            >
              <option value="spend">Spend (high → low)</option>
              <option value="revenue">Revenue (high → low)</option>
              <option value="conversions">Conversions (high → low)</option>
              <option value="roas">ROAS (high → low)</option>
              <option value="cpa">CPA (low → high)</option>
              <option value="name">Name (A → Z)</option>
            </select>
          </div>
        </div>
        {loading && sortedRows.length === 0 ? (
          <div className="h-32 bg-muted/30 animate-pulse rounded-xl" />
        ) : sortedRows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No campaigns match this slice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <th className="text-left font-medium px-3 py-2.5">Campaign</th>
                  <th className="text-right font-medium px-3 py-2.5">Spend</th>
                  <th className="text-right font-medium px-3 py-2.5">Revenue</th>
                  <th className="text-right font-medium px-3 py-2.5">Conv.</th>
                  <th className="text-right font-medium px-3 py-2.5">ROAS</th>
                  <th className="text-right font-medium px-3 py-2.5">CPA</th>
                  <th className="text-right font-medium px-3 py-2.5">CTR</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-muted/30 border-t-2 border-border font-medium">
                  <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtCurrency(totals.spend, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtCurrency(totals.revenue, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtNum(totals.conversions)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right tabular-nums",
                      roasColor(totals.roas, totals.spend)
                    )}
                  >
                    {fmtRoas(totals.roas)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtCurrency(totals.cpa, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtPct(totals.ctr)}
                  </td>
                </tr>
                {sortedRows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-border hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-3 py-2.5 max-w-[420px]">
                      <div className="text-foreground font-medium truncate">{c.name}</div>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {parsedChips(c.parsed).map((p, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {fmtCurrency(c.spend, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {fmtCurrency(c.revenue, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {fmtNum(c.conversions)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        colorRoas(c.roas, c.spend)
                      )}
                    >
                      {fmtRoas(c.roas)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        colorCpa(c.cpa, c.spend)
                      )}
                    >
                      {fmtCurrency(c.cpa, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {fmtPct(c.ctr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </div>
  );
}

function parsedChips(p: CampaignParsed): string[] {
  const out: string[] = [];
  if (p.country) out.push(p.country);
  if (p.catalog === "CAT") out.push("CAT");
  if (p.performancePlus) out.push(p.performancePlus);
  if (p.funnel) out.push(p.funnel);
  if (p.strategy) out.push(p.strategy);
  if (p.strategyCategory) out.push(p.strategyCategory);
  if (p.objective) out.push(p.objective);
  return out;
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold mt-1 tabular-nums", valueClass)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
