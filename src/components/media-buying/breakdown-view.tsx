"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Hash,
  BarChart2,
  Info,
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
import type {
  BreakdownApiResponse,
  ChartMetric,
  Dimension,
  EntityRow,
  LegendItem,
} from "@/lib/media-buying/types";
import {
  breakdownForDimension,
  buildTimeSeries,
  type DimensionRow,
} from "@/lib/media-buying/aggregate";

const COHORT_COLORS = [
  "#2563EB", "#16A34A", "#E25822", "#7C3AED",
  "#0EA5E9", "#DB2777", "#CA8A04", "#0F766E",
  "#9333EA", "#DC2626",
];

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
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function roasColor(roas: number, spend: number): string {
  if (spend === 0) return "text-muted-foreground";
  if (roas >= 3) return "text-emerald-600 font-medium";
  if (roas >= 1.5) return "text-foreground";
  return "text-amber-600 font-medium";
}

interface BreakdownViewProps {
  title: string;
  description: string;
  /** Lucide icon component for the header badge. */
  icon: ComponentType<{ className?: string }>;
  /** API route returning { items: EntityRow[], currency, ad_account_name }. */
  endpoint: string;
  dimensions: Dimension[];
  legend: LegendItem[];
  /** Singular noun for the entities listed (e.g. "campaign", "ad group", "ad"). */
  entityLabel: string;
  /**
   * Optional render-prop for level-specific content rendered ABOVE the
   * dimension breakdowns (just under the page header / hygiene banner).
   */
  renderTop?: (props: {
    items: EntityRow[];
    currency: string;
    loading: boolean;
  }) => ReactNode;
  /**
   * Optional render-prop for level-specific content rendered BELOW the
   * dimension breakdowns (and above the legend).
   */
  renderFooter?: (props: {
    items: EntityRow[];
    currency: string;
    loading: boolean;
  }) => ReactNode;
}

export function BreakdownView({
  title,
  description,
  icon: Icon,
  endpoint,
  dimensions,
  legend,
  entityLabel,
  renderTop,
  renderFooter,
}: BreakdownViewProps) {
  const { org } = useOrg();
  const [dateRange, setDateRange] = useState<DateRange>(() => presetToRange(7));
  const [conversionWindow, setConversionWindow] = useState<ConversionWindow>("30/1");
  const [data, setData] = useState<BreakdownApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState<"numbers" | "chart">("numbers");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("roas");
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
        const res = await fetch(endpoint, {
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
        const json = (await res.json()) as BreakdownApiResponse;
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
  }, [org, dateRange, conversionWindow, refreshKey, endpoint]);

  const currency = data?.currency || "USD";
  const items = useMemo(() => data?.items || [], [data?.items]);

  const offenders = useMemo(
    () => items.filter((c) => c.parsed.unknown.length > 0),
    [items]
  );

  const breakdowns = useMemo(() => {
    return dimensions.map((d) => ({
      dim: d,
      rows: breakdownForDimension(items, d),
    }));
  }, [items, dimensions]);

  const pluralEntity =
    entityLabel.endsWith("s") || entityLabel.endsWith("x")
      ? entityLabel
      : `${entityLabel}s`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {description}
              {data?.ad_account_name && (
                <span className="text-foreground/70"> — {data.ad_account_name}</span>
              )}
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
                {offenders.length}{" "}
                {offenders.length === 1 ? entityLabel : pluralEntity} with non-standard
                naming
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
                <li
                  key={c.id}
                  className="text-xs text-amber-900/90 flex items-baseline gap-2"
                >
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

      {/* Level-specific top slot (e.g. per-ad table on the Ad Level page,
          shown above the dimension breakdowns so it's the first thing the
          user lands on). */}
      {renderTop && renderTop({ items, currency, loading })}

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Each section below shows the total performance for every value of one naming
          dimension — aggregated across all {pluralEntity}, not per {entityLabel}.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {viewMode === "chart" && (
            <div className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Metric</span>
              <select
                value={chartMetric}
                onChange={(e) => setChartMetric(e.target.value as ChartMetric)}
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

      {/* Dimension breakdowns */}
      {loading && items.length === 0 ? (
        <div className="h-64 bg-muted/30 animate-pulse rounded-xl" />
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          No {pluralEntity} with data in this period.
        </div>
      ) : (
        breakdowns.map(({ dim, rows }) => (
          <DimensionSection
            key={dim.key}
            dim={dim}
            rows={rows}
            entities={items}
            entityLabel={entityLabel}
            pluralEntity={pluralEntity}
            currency={currency}
            viewMode={viewMode}
            chartMetric={chartMetric}
          />
        ))
      )}

      {/* Level-specific footer (e.g. per-ad table on the Ad Level page). */}
      {renderFooter && renderFooter({ items, currency, loading })}

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
            {legend.map((l) => (
              <LegendEntryRow key={l.abbr} abbr={l.abbr} desc={l.desc} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DimensionSection({
  dim,
  rows,
  entities,
  entityLabel,
  pluralEntity,
  currency,
  viewMode,
  chartMetric,
}: {
  dim: Dimension;
  rows: DimensionRow[];
  entities: EntityRow[];
  entityLabel: string;
  pluralEntity: string;
  currency: string;
  viewMode: "numbers" | "chart";
  chartMetric: ChartMetric;
}) {
  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);

  const series = useMemo(() => {
    if (viewMode !== "chart") return { values: [] as string[], data: [] as Array<Record<string, number | string | null>> };
    const { values, data } = buildTimeSeries(entities, dim.key, chartMetric);
    let orderedValues = values;
    if (dim.order) {
      const idx = new Map(dim.order.map((v, i) => [v, i]));
      orderedValues = [...values].sort(
        (a, b) => (idx.get(a) ?? 999) - (idx.get(b) ?? 999)
      );
    } else {
      const spendByValue = new Map<string, number>();
      for (const r of rows) spendByValue.set(r.value, r.spend);
      orderedValues = [...values].sort(
        (a, b) => (spendByValue.get(b) ?? 0) - (spendByValue.get(a) ?? 0)
      );
    }
    return { values: orderedValues, data };
  }, [viewMode, entities, dim, chartMetric, rows]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="mb-3">
        <h2 className="text-base font-semibold">{dim.title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{dim.description}</p>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">
          No {pluralEntity} matched this dimension.
        </div>
      ) : viewMode === "chart" ? (
        series.data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No daily data for this dimension in the selected range.
          </div>
        ) : (
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => fmtDate(String(v))}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  stroke="#d1d5db"
                />
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
                  labelFormatter={(label) => fmtDate(String(label))}
                  formatter={(value, name) => {
                    const n = typeof value === "number" ? value : Number(value) || 0;
                    const display = dim.label(String(name));
                    if (chartMetric === "roas") return [fmtRoas(n), display];
                    return [fmtCurrency(n, currency), display];
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => dim.label(String(value))}
                />
                {series.values.map((v, i) => (
                  <Line
                    key={v}
                    type="monotone"
                    dataKey={v}
                    stroke={COHORT_COLORS[i % COHORT_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                <th className="text-left font-medium px-3 py-2">Value</th>
                <th className="text-right font-medium px-3 py-2">
                  {entityLabel === "ad group" ? "Ad groups" : pluralEntity[0].toUpperCase() + pluralEntity.slice(1)}
                </th>
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
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.count}</td>
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
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right tabular-nums",
                        roasColor(row.roas, row.spend)
                      )}
                    >
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

function LegendEntryRow({ abbr, desc }: { abbr: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground flex-shrink-0">
        {abbr}
      </span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}
