"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon, PieChart as PieChartIcon, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { DailyPoint, HubSeries } from "@/lib/media-buying/hub-series";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { HubFilters } from "./hub-panels";
import { fmtCurrency, fmtRoas, fmtPct, zoneDot, zoneLabel } from "./hub-format";
import { DEPARTMENT_LABELS } from "@/lib/media-buying/config";
import type { Zone } from "@/lib/media-buying/config";

// ─── Window selector ────────────────────────────────────────────────────────
export const WINDOW_OPTIONS: { value: 7 | 14 | 30; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
];

export function WindowSelector({
  value,
  onChange,
}: {
  value: 7 | 14 | 30;
  onChange: (v: 7 | 14 | 30) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card overflow-hidden">
      {WINDOW_OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary text-white"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Shared client-side filter helper (must mirror hub-panels) ──────────────
function filterStores(stores: StoreZoneRow[], f: HubFilters): StoreZoneRow[] {
  return stores.filter((s) => {
    if (!s.configured || !s.is_active) return false;
    if (f.department && s.department !== f.department) return false;
    if (f.niche && s.niche !== f.niche) return false;
    if (f.country && s.country !== f.country) return false;
    if (f.buyer && s.media_buyer !== f.buyer) return false;
    return true;
  });
}

/** Sum an arbitrary set of daily points across the current filter set.
 *  Series come from the server bucketed per store's dept + buyer, so we
 *  re-sum on the client using whichever dept/buyer buckets survive the
 *  filter. */
function sumSeriesForFilter(
  series: HubSeries,
  filteredStores: StoreZoneRow[]
): DailyPoint[] {
  // Fast-path: no filter → agency series already matches.
  if (
    filteredStores.length === 0 &&
    (Object.keys(series.byDepartment).length === 0 && Object.keys(series.byBuyer).length === 0)
  ) {
    return series.agency;
  }
  const depts = new Set(filteredStores.map((s) => s.department ?? "(no department)"));
  const buyers = new Set(filteredStores.map((s) => s.media_buyer ?? "(unassigned)"));
  // Prefer summing dept series (fewer keys), fall back to buyer series if
  // both would collapse to the whole book.
  const useDept = depts.size > 0 && depts.size <= Object.keys(series.byDepartment).length;
  const source = useDept ? series.byDepartment : series.byBuyer;
  const wanted = useDept ? depts : buyers;
  const byDate = new Map<string, {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    add_to_carts: number;
  }>();
  for (const [key, points] of Object.entries(source)) {
    if (!wanted.has(key)) continue;
    for (const p of points) {
      const cur = byDate.get(p.date) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, add_to_carts: 0 };
      cur.spend += p.spend;
      cur.revenue += p.revenue;
      cur.conversions += p.conversions;
      cur.impressions += p.impressions;
      cur.clicks += p.clicks;
      cur.add_to_carts += p.add_to_carts;
      byDate.set(p.date, cur);
    }
  }
  // Re-derive per-day rates from summed base values so ratios stay correct.
  return series.agency.map((a) => {
    const b = byDate.get(a.date) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, add_to_carts: 0 };
    return {
      date: a.date,
      spend: b.spend,
      revenue: b.revenue,
      conversions: b.conversions,
      impressions: b.impressions,
      clicks: b.clicks,
      add_to_carts: b.add_to_carts,
      roas: b.spend > 0 ? b.revenue / b.spend : null,
      cpm: b.impressions > 0 ? (b.spend / b.impressions) * 1000 : null,
      cpc: b.clicks > 0 ? b.spend / b.clicks : null,
      ctr: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : null,
      cpa: b.conversions > 0 ? b.spend / b.conversions : null,
      atc_cpa: b.add_to_carts > 0 ? b.spend / b.add_to_carts : null,
    };
  });
}

// ─── Trends: spend + revenue over time ──────────────────────────────────────
export function TrendsSection({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const series = useMemo(() => sumSeriesForFilter(hub.series, filteredStores), [hub.series, filteredStores]);
  const weightedBer = useMemo(() => {
    let num = 0, den = 0;
    for (const s of filteredStores) {
      if (s.spend > 0 && s.breakeven_roas != null) {
        num += s.spend * s.breakeven_roas;
        den += s.spend;
      }
    }
    return den > 0 ? num / den : null;
  }, [filteredStores]);

  const chartData = series.map((p) => ({
    date: p.date.slice(5),
    spend: Math.round(p.spend),
    revenue: Math.round(p.revenue),
    roas: p.roas,
    add_to_carts: p.add_to_carts,
    conversions: p.conversions,
  }));

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-6">
      <div className="flex items-center gap-2">
        <LineChartIcon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Trends</h2>
        <span className="text-xs text-muted-foreground">
          Last {hub.meta.window_days} days &middot; {filteredStores.length}{" "}
          {filteredStores.length === 1 ? "store" : "stores"} in scope
        </span>
      </div>

      {/* Spend + revenue */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
          Spend &amp; revenue
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="grad-spend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#E30613" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#E30613" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" tickFormatter={(v) => fmtCurrency(v as number, "USD")} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v, name) => [fmtCurrency(v as number, "USD"), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#grad-rev)" isAnimationActive={false} />
              <Area type="monotone" dataKey="spend" stroke="#E30613" strokeWidth={2} fill="url(#grad-spend)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROAS */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            ROAS
          </div>
          {weightedBer != null && (
            <div className="text-[11px] text-muted-foreground">
              Reference line = weighted BER (<strong>{fmtRoas(weightedBer)}</strong>)
            </div>
          )}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                tickFormatter={(v) => `${(v as number).toFixed(1)}x`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => fmtRoas(v as number)}
              />
              {weightedBer != null && (
                <ReferenceLine y={weightedBer} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "BER", fontSize: 10, fill: "#f59e0b", position: "right" }} />
              )}
              <Line type="monotone" dataKey="roas" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Conversions + ATC */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
          Conversions vs add-to-carts
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="add_to_carts" fill="#f59e0b" isAnimationActive={false} />
              <Bar dataKey="conversions" fill="#10b981" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

// ─── Share breakdowns (donut + horizontal bars) ─────────────────────────────
const ZONE_COLORS: Record<Zone, string> = {
  red: "#ef4444",
  orange: "#f59e0b",
  green: "#10b981",
};

const CHART_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#a855f7",
  "#22d3ee",
];

export function ShareBreakdownSection({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);

  const zoneData = useMemo(() => {
    const t = { red: 0, orange: 0, green: 0 };
    for (const s of filteredStores) {
      if (s.zone) t[s.zone]++;
    }
    return (["green", "orange", "red"] as const)
      .map((z) => ({ name: zoneLabel[z], value: t[z], key: z }))
      .filter((d) => d.value > 0);
  }, [filteredStores]);

  const deptData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredStores) {
      const k = s.department ?? "(no department)";
      map.set(k, (map.get(k) ?? 0) + s.spend);
    }
    return Array.from(map)
      .map(([k, spend]) => ({
        name: DEPARTMENT_LABELS[k as keyof typeof DEPARTMENT_LABELS] ?? capitalize(k),
        spend,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [filteredStores]);

  const buyerData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredStores) {
      const k = s.media_buyer ?? "(unassigned)";
      map.set(k, (map.get(k) ?? 0) + s.spend);
    }
    return Array.from(map)
      .map(([k, spend]) => ({ name: k, spend }))
      .sort((a, b) => b.spend - a.spend);
  }, [filteredStores]);

  const nicheData = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredStores) {
      const k = s.niche ?? "(no niche)";
      map.set(k, (map.get(k) ?? 0) + s.revenue);
    }
    return Array.from(map)
      .map(([k, revenue]) => ({ name: k, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredStores]);

  const totalSpend = filteredStores.reduce((a, s) => a + s.spend, 0);
  const totalRevenue = filteredStores.reduce((a, s) => a + s.revenue, 0);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Proportions</h2>
        <span className="text-xs text-muted-foreground">How the book splits by zone, department, buyer &amp; niche</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Zone donut */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Stores by zone
          </div>
          {zoneData.length === 0 ? (
            <div className="text-xs text-muted-foreground italic h-48 flex items-center">
              No classified stores in this filter.
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={zoneData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="90%"
                    paddingAngle={2}
                    isAnimationActive={false}
                    label={(entry: { name?: string; value?: number }) =>
                      entry.value != null ? `${entry.name} ${entry.value}` : ""
                    }
                    labelLine={false}
                  >
                    {zoneData.map((d) => (
                      <Cell key={d.key} fill={ZONE_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Spend share by department */}
        <ShareBars
          title="Spend share by department"
          data={deptData.map((d, i) => ({
            label: d.name,
            value: d.spend,
            pct: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
            color: CHART_PALETTE[i % CHART_PALETTE.length],
          }))}
          total={totalSpend}
          format="currency"
        />

        {/* Spend share by media buyer */}
        <ShareBars
          title="Spend share by media buyer"
          data={buyerData.map((d, i) => ({
            label: d.name,
            value: d.spend,
            pct: totalSpend > 0 ? (d.spend / totalSpend) * 100 : 0,
            color: CHART_PALETTE[(i + 2) % CHART_PALETTE.length],
          }))}
          total={totalSpend}
          format="currency"
        />

        {/* Revenue share by niche */}
        <ShareBars
          title="Revenue share by niche"
          data={nicheData.map((d, i) => ({
            label: d.name,
            value: d.revenue,
            pct: totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0,
            color: CHART_PALETTE[(i + 4) % CHART_PALETTE.length],
          }))}
          total={totalRevenue}
          format="currency"
        />
      </div>
    </section>
  );
}

function ShareBars({
  title,
  data,
  total,
  format,
}: {
  title: string;
  data: { label: string; value: number; pct: number; color: string }[];
  total: number;
  format: "currency" | "count";
}) {
  const fmt = (v: number) =>
    format === "currency" ? fmtCurrency(v, "USD") : Math.round(v).toLocaleString("en-US");
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
        {title}
      </div>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No data.</div>
      ) : (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.label}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-medium truncate max-w-[60%]">{d.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {fmt(d.value)} <span className="text-foreground/60">({d.pct.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${d.pct}%`, backgroundColor: d.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground">Total: {fmt(total)}</div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── Growth heatmap: per-store spend + ROAS change last window vs prior ────
export function GrowthHeatmap({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const [sortKey, setSortKey] = useState<"roas_delta" | "spend_delta" | "spend">("roas_delta");
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const wowByOrg = useMemo(
    () => new Map(hub.wow.byStore.map((w) => [w.org_id, w])),
    [hub.wow.byStore]
  );
  const rows = useMemo(() => {
    const merged = filteredStores.map((s) => {
      const w = wowByOrg.get(s.org_id);
      return {
        org_id: s.org_id,
        store_name: s.store_name,
        zone: s.zone,
        currency: s.currency ?? "USD",
        spend: s.spend,
        roas: s.roas,
        spend_delta: w?.spend_delta_pct ?? null,
        roas_delta:
          w?.roas_prev && w?.roas_curr
            ? ((w.roas_curr - w.roas_prev) / w.roas_prev) * 100
            : null,
      };
    });
    const sortFn =
      sortKey === "spend"
        ? (a: (typeof merged)[number], b: (typeof merged)[number]) => b.spend - a.spend
        : sortKey === "spend_delta"
        ? (a: (typeof merged)[number], b: (typeof merged)[number]) =>
            (b.spend_delta ?? -Infinity) - (a.spend_delta ?? -Infinity)
        : (a: (typeof merged)[number], b: (typeof merged)[number]) =>
            (b.roas_delta ?? -Infinity) - (a.roas_delta ?? -Infinity);
    return merged.slice().sort(sortFn);
  }, [filteredStores, wowByOrg, sortKey]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Growth vs prior period</h2>
        <span className="text-xs text-muted-foreground">
          Last {hub.meta.window_days}d vs prior {hub.meta.window_days}d, per store
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="text-xs rounded-lg border border-border bg-card px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="roas_delta">ROAS growth</option>
            <option value="spend_delta">Spend growth</option>
            <option value="spend">Spend size</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2">Store</th>
              <th className="text-left font-medium py-2">Zone</th>
              <th className="text-right font-medium py-2">Spend</th>
              <th className="text-right font-medium py-2">ROAS</th>
              <th className="text-left font-medium py-2 pl-3">Spend growth</th>
              <th className="text-left font-medium py-2 pl-3">ROAS growth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.org_id} className="border-b border-border/60 last:border-b-0">
                <td className="py-1.5 font-medium">{r.store_name}</td>
                <td className="py-1.5">
                  {r.zone ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <span className={cn("w-2 h-2 rounded-full", zoneDot[r.zone])} />
                      {zoneLabel[r.zone]}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{fmtCurrency(r.spend, r.currency)}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtRoas(r.roas)}</td>
                <td className="py-1.5 pl-3">
                  <DeltaBar pct={r.spend_delta} />
                </td>
                <td className="py-1.5 pl-3">
                  <DeltaBar pct={r.roas_delta} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground text-sm">
                  No configured stores in this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeltaBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  // Clamp visual bar to [-100, +100]% so extreme values don't blow the layout.
  const clamped = Math.max(-100, Math.min(100, pct));
  const positive = clamped >= 0;
  const width = Math.abs(clamped);
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex items-center flex-1 h-4">
        <div className="flex-1 flex justify-end pr-[1px]">
          {!positive && (
            <div className="h-2 rounded-l-sm bg-red-500" style={{ width: `${width}%` }} />
          )}
        </div>
        <div className="w-px h-3 bg-border" />
        <div className="flex-1 pl-[1px]">
          {positive && (
            <div className="h-2 rounded-r-sm bg-emerald-500" style={{ width: `${width}%` }} />
          )}
        </div>
      </div>
      <span className={cn("text-xs tabular-nums w-14 text-right", positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

