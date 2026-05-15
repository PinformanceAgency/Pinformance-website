"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

type KpiKey = "spend" | "revenue" | "roas" | "cpa" | "conversions";

interface Totals {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
}

interface DailyRow {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
}

interface LandingPageRow {
  url: string;
  ad_count: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number | null;
}

interface ApiResponse {
  ok?: boolean;
  ad_account_name?: string;
  currency?: string;
  current_totals?: Totals;
  previous_totals?: Totals;
  daily?: DailyRow[];
  landing_pages?: LandingPageRow[];
  error?: string;
}

const KPI_OPTIONS: { key: KpiKey; label: string; axis: "currency" | "ratio" | "count" }[] = [
  { key: "spend", label: "Spend", axis: "currency" },
  { key: "revenue", label: "Revenue", axis: "currency" },
  { key: "roas", label: "ROAS", axis: "ratio" },
  { key: "cpa", label: "CPA", axis: "currency" },
  { key: "conversions", label: "Conversions", axis: "count" },
];

const KPI_COLORS: Record<KpiKey, string> = {
  spend: "#2563EB", // blue
  revenue: "#16A34A", // green
  roas: "#E25822", // orange
  cpa: "#7C3AED", // purple
  conversions: "#0EA5E9", // sky
};

const fmtCurrency = (n: number | null, currency: string): string => {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
};
const fmtRoas = (n: number | null): string => (n == null || !isFinite(n) ? "—" : `${n.toFixed(2)}x`);
const fmtNum = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function deltaPct(curr: number, prev: number): number | null {
  if (!isFinite(curr) || !isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** Lower-is-better for CPA; higher-is-better for ROAS/revenue/conversions/spend (spend neutral). */
function deltaIsGood(kpi: KpiKey, pct: number): boolean | null {
  if (kpi === "spend") return null;
  const lowerBetter = kpi === "cpa";
  return lowerBetter ? pct < 0 : pct > 0;
}

function roasColor(roas: number): string {
  if (roas >= 3) return "text-emerald-600";
  if (roas >= 1.5) return "text-foreground";
  return "text-amber-600";
}

export default function MediaBuyingPage() {
  const { org } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange(7));
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [chartMetrics, setChartMetrics] = useState<KpiKey[]>(["spend", "roas"]);

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
        const res = await fetch("/api/pinterest/media-buying", {
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
  const current = data?.current_totals;
  const previous = data?.previous_totals;
  const daily = data?.daily || [];
  const landingPages = data?.landing_pages || [];

  // Color thresholds for landing-page table — driven by data so we only
  // highlight true standouts (top quartile / bottom quartile).
  const landingThresholds = useMemo(() => {
    const roasValues = landingPages.filter((l) => l.spend > 0).map((l) => l.roas).sort((a, b) => a - b);
    const cpaValues = landingPages
      .filter((l) => l.cpa != null && l.spend > 0)
      .map((l) => l.cpa as number)
      .sort((a, b) => a - b);
    const q = (arr: number[], p: number): number | null => {
      if (arr.length === 0) return null;
      const idx = Math.floor((arr.length - 1) * p);
      return arr[idx];
    };
    return {
      roasGood: q(roasValues, 0.75),
      roasBad: q(roasValues, 0.25),
      cpaGood: q(cpaValues, 0.25), // low CPA = good
      cpaBad: q(cpaValues, 0.75),
    };
  }, [landingPages]);

  function colorRoas(roas: number, spend: number): string {
    if (spend === 0) return "text-muted-foreground";
    if (landingThresholds.roasGood != null && roas >= landingThresholds.roasGood && roas >= 2)
      return "text-emerald-600 font-medium";
    if (landingThresholds.roasBad != null && roas <= landingThresholds.roasBad && roas < 1.5)
      return "text-red-600 font-medium";
    return "text-foreground";
  }
  function colorCpa(cpa: number | null, spend: number): string {
    if (cpa == null || spend === 0) return "text-muted-foreground";
    if (landingThresholds.cpaGood != null && cpa <= landingThresholds.cpaGood)
      return "text-emerald-600 font-medium";
    if (landingThresholds.cpaBad != null && cpa >= landingThresholds.cpaBad)
      return "text-red-600 font-medium";
    return "text-foreground";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Paid Ads — Media Buying</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {data?.ad_account_name
                ? `Account-level performance, trends and landing-page breakdown for ${data.ad_account_name}.`
                : "Account-level performance, trends and landing-page breakdown."}
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

      {/* KPI cards */}
      <KpiOverviewRow
        current={current}
        previous={previous}
        currency={currency}
        loading={loading}
      />

      {/* Performance Trend chart */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold">Performance Trend</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daily metrics over time. Toggle KPIs to add / remove series.
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {KPI_OPTIONS.map((o) => {
              const active = chartMetrics.includes(o.key);
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    setChartMetrics((prev) =>
                      prev.includes(o.key)
                        ? prev.filter((k) => k !== o.key)
                        : [...prev, o.key]
                    );
                  }}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 border",
                    active
                      ? "bg-card text-foreground border-border"
                      : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: active ? KPI_COLORS[o.key] : "#9ca3af" }}
                  />
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="w-full h-72">
          {daily.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No daily data for this period."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  stroke="#d1d5db"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  stroke="#d1d5db"
                  tickFormatter={(v) =>
                    new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(v)
                  }
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  stroke="#d1d5db"
                  tickFormatter={(v) => `${v.toFixed(1)}x`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value) || 0;
                    const key = String(name) as KpiKey;
                    if (key === "roas") return [fmtRoas(n), "ROAS"];
                    if (key === "conversions") return [fmtNum(n), "Conversions"];
                    return [
                      fmtCurrency(n, currency),
                      KPI_OPTIONS.find((o) => o.key === key)?.label || String(name),
                    ];
                  }}
                  labelFormatter={(label) => fmtDate(String(label))}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {chartMetrics.map((m) => {
                  const opt = KPI_OPTIONS.find((o) => o.key === m)!;
                  const yAxisId = opt.axis === "ratio" ? "right" : "left";
                  return (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={m}
                      yAxisId={yAxisId}
                      name={opt.label}
                      stroke={KPI_COLORS[m]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Landing Page Performance */}
      <section className="bg-card border border-border rounded-2xl p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Landing Page Performance</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            All landing pages your ads point to in this period, aggregated.
          </p>
        </div>
        {loading && landingPages.length === 0 ? (
          <div className="h-32 bg-muted/30 animate-pulse rounded-xl" />
        ) : landingPages.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No ads with spend in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <th className="text-left font-medium px-3 py-2.5">Landing page</th>
                  <th className="text-right font-medium px-3 py-2.5">Ads</th>
                  <th className="text-right font-medium px-3 py-2.5">Spend</th>
                  <th className="text-right font-medium px-3 py-2.5">Conv.</th>
                  <th className="text-right font-medium px-3 py-2.5">Revenue</th>
                  <th className="text-right font-medium px-3 py-2.5">ROAS</th>
                  <th className="text-right font-medium px-3 py-2.5">CPA</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Totals computed across the visible rows (skipping the
                  // "no link" bucket would be misleading, so we include it).
                  const totals = landingPages.reduce(
                    (acc, lp) => {
                      acc.ads += lp.ad_count;
                      acc.spend += lp.spend;
                      acc.conv += lp.conversions;
                      acc.rev += lp.revenue;
                      return acc;
                    },
                    { ads: 0, spend: 0, conv: 0, rev: 0 }
                  );
                  const totalRoas = totals.spend > 0 ? totals.rev / totals.spend : 0;
                  const totalCpa = totals.conv > 0 ? totals.spend / totals.conv : null;
                  return (
                    <tr className="bg-muted/30 border-t-2 border-border font-medium">
                      <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">
                        Total ({landingPages.length} page{landingPages.length === 1 ? "" : "s"})
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{totals.ads}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtCurrency(totals.spend, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtNum(totals.conv)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtCurrency(totals.rev, currency)}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", roasColor(totalRoas))}>
                        {fmtRoas(totalRoas)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtCurrency(totalCpa, currency)}
                      </td>
                    </tr>
                  );
                })()}
                {landingPages.map((lp) => {
                  const hostMatch = lp.url.match(/^([^/]+)(\/.*)?$/);
                  const host = hostMatch?.[1] || lp.url;
                  const path = hostMatch?.[2] || "";
                  const isLinkable = lp.url !== "(no link)";
                  return (
                    <tr
                      key={lp.url}
                      className="border-t border-border hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        {isLinkable ? (
                          <a
                            href={`https://${lp.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 group max-w-[420px]"
                          >
                            <span className="text-xs font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                              {host}
                            </span>
                            <span className="truncate text-foreground group-hover:text-primary">
                              {path || "/"}
                            </span>
                            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground italic">no link</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {lp.ad_count}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {fmtCurrency(lp.spend, currency)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {fmtNum(lp.conversions)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {fmtCurrency(lp.revenue, currency)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          colorRoas(lp.roas, lp.spend)
                        )}
                      >
                        {fmtRoas(lp.roas)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right tabular-nums",
                          colorCpa(lp.cpa, lp.spend)
                        )}
                      >
                        {fmtCurrency(lp.cpa, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function KpiOverviewRow({
  current,
  previous,
  currency,
  loading,
}: {
  current?: Totals;
  previous?: Totals;
  currency: string;
  loading: boolean;
}) {
  if (loading && !current) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!current) return null;

  const cards: {
    key: KpiKey | "conversions_count";
    label: string;
    value: string;
    previousValue: number;
    currentValue: number;
    invertGood?: boolean;
  }[] = [
    {
      key: "spend",
      label: "Total Spend",
      value: fmtCurrency(current.spend, currency),
      previousValue: previous?.spend ?? 0,
      currentValue: current.spend,
    },
    {
      key: "revenue",
      label: "Total Revenue",
      value: fmtCurrency(current.revenue, currency),
      previousValue: previous?.revenue ?? 0,
      currentValue: current.revenue,
    },
    {
      key: "conversions_count",
      label: "Conversions",
      value: fmtNum(current.conversions),
      previousValue: previous?.conversions ?? 0,
      currentValue: current.conversions,
    },
    {
      key: "roas",
      label: "ROAS",
      value: fmtRoas(current.roas),
      previousValue: previous?.roas ?? 0,
      currentValue: current.roas,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((c) => {
        const pct = deltaPct(c.currentValue, c.previousValue);
        const isCpa = c.key === "cpa";
        const good =
          pct == null ? null : isCpa ? pct < 0 : c.key === "spend" ? null : pct > 0;
        return (
          <div key={c.key} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {c.label}
            </div>
            <div className={cn("text-2xl font-semibold mt-1 tabular-nums", c.key === "roas" ? roasColor(c.currentValue) : "")}>
              {c.value}
            </div>
            <div className="text-[11px] mt-1 inline-flex items-center gap-1">
              {pct == null ? (
                <span className="text-muted-foreground">—</span>
              ) : good === null ? (
                <span className="text-muted-foreground inline-flex items-center gap-0.5">
                  <Minus className="w-3 h-3" /> {Math.abs(pct).toFixed(1)}%
                </span>
              ) : good ? (
                <span className="text-emerald-600 inline-flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> {Math.abs(pct).toFixed(1)}%
                </span>
              ) : (
                <span className="text-red-600 inline-flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" /> {Math.abs(pct).toFixed(1)}%
                </span>
              )}
              <span className="text-muted-foreground">vs prev. period</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
