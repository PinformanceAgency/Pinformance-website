"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Hash,
  BarChart2,
  Info,
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

function roasColor(roas: number, spend: number): string {
  if (spend === 0) return "text-muted-foreground";
  if (roas >= 3) return "text-emerald-600 font-medium";
  if (roas >= 1.5) return "text-foreground";
  return "text-amber-600 font-medium";
}

// ---- Dimensions: one breakdown section per dimension ----
type DimensionKey =
  | "country"
  | "catalog"
  | "performancePlus"
  | "funnel"
  | "strategy"
  | "objective";

interface Dimension {
  key: DimensionKey;
  title: string;
  description: string;
  /** Optional fixed order of values (otherwise sorted by spend desc). */
  order?: string[];
  /** Display label for a value. */
  label: (v: string) => string;
  /** Optional secondary label (the abbreviation, shown next to the full label). */
  hint?: (v: string) => string | null;
}

const DIMENSIONS: Dimension[] = [
  {
    key: "country",
    title: "Per Country",
    description:
      "Total performance per market (parsed from the first token of each campaign name).",
    label: (v) => v,
  },
  {
    key: "catalog",
    title: "Catalog vs Non-catalog",
    description:
      "CAT = catalog campaigns (product feed). Non-catalog campaigns omit the CAT token.",
    order: ["CAT", "NON_CAT"],
    label: (v) => (v === "CAT" ? "Catalog" : "Non-catalog"),
    hint: (v) => (v === "CAT" ? "CAT" : "—"),
  },
  {
    key: "performancePlus",
    title: "Performance+ vs Non-Performance+",
    description:
      "P+ campaigns use Pinterest's Performance+ automation; NP+ are manually structured.",
    order: ["P+", "NP+"],
    label: (v) => (v === "P+" ? "Performance+" : "Non-Performance+"),
    hint: (v) => v,
  },
  {
    key: "funnel",
    title: "Prospecting vs Retargeting",
    description:
      "PROSP campaigns target cold audiences; RET campaigns target warm audiences.",
    order: ["PROSP", "RET"],
    label: (v) => (v === "PROSP" ? "Prospecting" : "Retargeting"),
    hint: (v) => v,
  },
  {
    key: "strategy",
    title: "Test / Hero / Category",
    description:
      "TEST = creative or structure testing. HERO = scaled winners / evergreen. CATG = category-focused.",
    order: ["HERO", "TEST", "CATG"],
    label: (v) =>
      v === "HERO" ? "Hero" : v === "TEST" ? "Test" : v === "CATG" ? "Category" : v,
    hint: (v) => v,
  },
  {
    key: "objective",
    title: "Conversion vs ROAS",
    description:
      "CONV = conversion-objective campaigns (count of checkouts). ROAS = value-based (revenue per spend).",
    order: ["CONV", "ROAS"],
    label: (v) => (v === "CONV" ? "Conversion" : "ROAS"),
    hint: (v) => v,
  },
];

const COHORT_COLORS = [
  "#2563EB", "#16A34A", "#E25822", "#7C3AED",
  "#0EA5E9", "#DB2777", "#CA8A04", "#0F766E",
  "#9333EA", "#DC2626",
];

function getDim(row: CampaignRow, key: DimensionKey): string | null {
  const v = row.parsed[key];
  return v == null ? null : String(v);
}

// Aggregate metrics across rows.
function aggregate(rows: CampaignRow[]) {
  let spend = 0,
    revenue = 0,
    conversions = 0,
    impressions = 0,
    clicks = 0;
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
  return { spend, revenue, conversions, impressions, clicks, roas, cpa, ctr };
}

interface DimensionRow {
  value: string;
  label: string;
  hint: string | null;
  campaigns: number;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number | null;
}

function breakdownForDimension(
  campaigns: CampaignRow[],
  dim: Dimension
): DimensionRow[] {
  const byValue = new Map<string, CampaignRow[]>();
  for (const c of campaigns) {
    const v = getDim(c, dim.key);
    if (!v) continue; // missing → drop from this dimension's breakdown
    const arr = byValue.get(v) || [];
    arr.push(c);
    byValue.set(v, arr);
  }
  const rows: DimensionRow[] = Array.from(byValue.entries()).map(
    ([value, group]) => {
      const agg = aggregate(group);
      return {
        value,
        label: dim.label(value),
        hint: dim.hint ? dim.hint(value) : null,
        campaigns: group.length,
        spend: agg.spend,
        revenue: agg.revenue,
        conversions: agg.conversions,
        roas: agg.roas,
        cpa: agg.cpa,
      };
    }
  );
  if (dim.order) {
    const idx = new Map(dim.order.map((v, i) => [v, i]));
    rows.sort((a, b) => {
      const ai = idx.get(a.value) ?? 999;
      const bi = idx.get(b.value) ?? 999;
      return ai - bi || b.spend - a.spend;
    });
  } else {
    rows.sort((a, b) => b.spend - a.spend);
  }
  return rows;
}

export default function CampaignLevelPage() {
  const { org } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange(7));
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"numbers" | "chart">("numbers");
  const [chartMetric, setChartMetric] = useState<"spend" | "revenue" | "roas" | "cpa">(
    "roas"
  );
  const [hygieneOpen, setHygieneOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

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

  const totals = useMemo(() => aggregate(allCampaigns), [allCampaigns]);

  const offenders = useMemo(
    () => allCampaigns.filter((c) => c.parsed.unknown.length > 0),
    [allCampaigns]
  );

  // Pre-compute breakdowns for all six dimensions.
  const breakdowns = useMemo(() => {
    return DIMENSIONS.map((d) => ({
      dim: d,
      rows: breakdownForDimension(allCampaigns, d),
    }));
  }, [allCampaigns]);

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
                ? `Aggregated performance per naming dimension for ${data.ad_account_name}.`
                : "Aggregated performance per naming dimension."}
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

      {/* Account-wide totals */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard
          label="Spend"
          value={fmtCurrency(totals.spend, currency)}
          sub={`${allCampaigns.length} campaign${allCampaigns.length === 1 ? "" : "s"}`}
        />
        <KpiCard label="Revenue" value={fmtCurrency(totals.revenue, currency)} sub="" />
        <KpiCard label="Conversions" value={fmtNum(totals.conversions)} sub="" />
        <KpiCard
          label="ROAS"
          value={fmtRoas(totals.roas)}
          sub=""
          valueClass={roasColor(totals.roas, totals.spend)}
        />
        <KpiCard label="CPA" value={fmtCurrency(totals.cpa, currency)} sub="" />
      </section>

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
                — they contribute to totals but won't classify cleanly per dimension.
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

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Each section below shows the total performance for every value of one naming dimension —
          aggregated across all campaigns, not per campaign.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {viewMode === "chart" && (
            <div className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Metric</span>
              <select
                value={chartMetric}
                onChange={(e) =>
                  setChartMetric(e.target.value as typeof chartMetric)
                }
                className="px-2 py-1 rounded-lg border border-border bg-card text-foreground"
              >
                <option value="spend">Spend</option>
                <option value="revenue">Revenue</option>
                <option value="roas">ROAS</option>
                <option value="cpa">CPA (lower better)</option>
              </select>
            </div>
          )}
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
      </div>

      {/* Dimension breakdowns — one section per naming dimension */}
      {loading && allCampaigns.length === 0 ? (
        <div className="h-64 bg-muted/30 animate-pulse rounded-xl" />
      ) : allCampaigns.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          No campaigns with data in this period.
        </div>
      ) : (
        breakdowns.map(({ dim, rows }) => (
          <DimensionSection
            key={dim.key}
            dim={dim}
            rows={rows}
            currency={currency}
            viewMode={viewMode}
            chartMetric={chartMetric}
          />
        ))
      )}

      {/* Legend */}
      <section className="bg-card border border-border rounded-2xl">
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="w-full px-5 py-3 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Naming convention reference</span>
            <span className="text-muted-foreground">
              — what each abbreviation stands for
            </span>
          </div>
          {legendOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {legendOpen && (
          <div className="px-5 pb-5 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <LegendEntry abbr="Country" desc="Market code — US, NL, BE, AU, AT, CA, DE, …" />
            <LegendEntry abbr="CAT" desc="Catalog campaign (product feed). Absence implies non-catalog." />
            <LegendEntry abbr="P+ / NP+" desc="Performance+ automation vs manually structured (Non-Perf+)." />
            <LegendEntry abbr="PROSP / RET" desc="Prospecting (cold audiences) vs Retargeting (warm audiences)." />
            <LegendEntry abbr="TEST" desc="Creative or campaign-structure testing." />
            <LegendEntry abbr="HERO" desc="Scaled winners / evergreen best performers." />
            <LegendEntry abbr="CATG" desc="Category-focused campaign (the strategy slot may carry a literal category like WATCHES)." />
            <LegendEntry abbr="CONV / ROAS" desc="Conversion-count objective vs ROAS / value-based objective." />
          </div>
        )}
      </section>
    </div>
  );
}

function DimensionSection({
  dim,
  rows,
  currency,
  viewMode,
  chartMetric,
}: {
  dim: Dimension;
  rows: DimensionRow[];
  currency: string;
  viewMode: "numbers" | "chart";
  chartMetric: "spend" | "revenue" | "roas" | "cpa";
}) {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{dim.title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{dim.description}</p>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No campaigns matched this dimension.
        </div>
      ) : viewMode === "chart" ? (
        <div className="w-full h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} stroke="#d1d5db" />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                stroke="#d1d5db"
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (chartMetric === "roas") return `${n.toFixed(1)}x`;
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
                  if (chartMetric === "roas") return [fmtRoas(n), "ROAS"];
                  if (chartMetric === "cpa") return [fmtCurrency(n, currency), "CPA"];
                  return [
                    fmtCurrency(n, currency),
                    chartMetric === "spend" ? "Spend" : "Revenue",
                  ];
                }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
              />
              <Bar dataKey={chartMetric} radius={[4, 4, 0, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={COHORT_COLORS[i % COHORT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                <th className="text-left font-medium px-3 py-2">Value</th>
                <th className="text-right font-medium px-3 py-2">Campaigns</th>
                <th className="text-right font-medium px-3 py-2">Spend</th>
                <th className="text-right font-medium px-3 py-2">% of spend</th>
                <th className="text-right font-medium px-3 py-2">Revenue</th>
                <th className="text-right font-medium px-3 py-2">Conv.</th>
                <th className="text-right font-medium px-3 py-2">ROAS</th>
                <th className="text-right font-medium px-3 py-2">CPA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const share = totalSpend > 0 ? (row.spend / totalSpend) * 100 : 0;
                return (
                  <tr key={row.value} className="border-t border-border">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                          style={{ background: COHORT_COLORS[i % COHORT_COLORS.length] }}
                        />
                        <span className="font-medium text-foreground">{row.label}</span>
                        {row.hint && row.hint !== row.label && row.hint !== "—" && (
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {row.hint}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.campaigns}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtCurrency(row.spend, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {share.toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtCurrency(row.revenue, currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtNum(row.conversions)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", roasColor(row.roas, row.spend))}>
                      {fmtRoas(row.roas)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtCurrency(row.cpa, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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

function LegendEntry({ abbr, desc }: { abbr: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground flex-shrink-0">
        {abbr}
      </span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}
