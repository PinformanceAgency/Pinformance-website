"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { DailyPoint, HubSeries } from "@/lib/media-buying/hub-series";
import { classifyZone, DEPARTMENT_LABELS, type Zone } from "@/lib/media-buying/config";
import type { HubFilters } from "./hub-panels";
import { fmtCurrency, fmtRoas, zoneBg, zoneDot, zoneLabel } from "./hub-format";

// ─── Shared filter helper — mirrors filterStores() in hub-panels.tsx ────────
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

// ─── Weekly bucketing ───────────────────────────────────────────────────────
/** Convert a series of daily points into 4 rolling 7-day buckets, newest last.
 *  Bucket 0 covers the oldest week; bucket 3 covers the most recent 7 days. */
interface WeekBucket {
  index: number;
  label: string; // "3w ago", "2w ago", "Last week", "This week"
  start: string;
  end: string;
  spend: number;
  revenue: number;
  conversions: number;
}

const WEEK_LABELS = ["3w ago", "2w ago", "Last week", "This week"];

function bucketToWeeks(daily: DailyPoint[]): WeekBucket[] {
  // Take last 28 days; if fewer, pad by not filling missing weeks.
  const last28 = daily.slice(-28);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 4; i++) {
    const slice = last28.slice(i * 7, i * 7 + 7);
    if (slice.length === 0) continue;
    let spend = 0,
      revenue = 0,
      conversions = 0;
    for (const p of slice) {
      spend += p.spend;
      revenue += p.revenue;
      conversions += p.conversions;
    }
    weeks.push({
      index: i,
      label: WEEK_LABELS[i] ?? `W-${3 - i}`,
      start: slice[0].date,
      end: slice[slice.length - 1].date,
      spend,
      revenue,
      conversions,
    });
  }
  return weeks;
}

function weekRoas(w: WeekBucket): number | null {
  return w.spend > 0 ? w.revenue / w.spend : null;
}

/** Weighted BER for a subset of stores. Same math as computePortfolioHealth. */
function weightedBer(stores: StoreZoneRow[]): number | null {
  let num = 0,
    den = 0;
  for (const s of stores) {
    if (s.spend > 0 && s.breakeven_roas != null) {
      num += s.spend * s.breakeven_roas;
      den += s.spend;
    }
  }
  return den > 0 ? num / den : null;
}

/** Weighted invoice ROAS (falls back to BER × green_ratio per store — same
 *  behaviour as rollups.ts). Needed so weekly zone classification lines up
 *  with the current-period zone shown elsewhere. */
function weightedInvoice(stores: StoreZoneRow[]): number | null {
  let num = 0,
    den = 0;
  for (const s of stores) {
    if (s.spend > 0 && s.breakeven_roas != null) {
      const eff =
        s.invoice_roas != null && s.invoice_roas > 0
          ? s.invoice_roas
          : s.breakeven_roas * 1.3;
      num += s.spend * eff;
      den += s.spend;
    }
  }
  return den > 0 ? num / den : null;
}

function weekZone(
  w: WeekBucket,
  ber: number | null,
  invoice: number | null
): Zone | null {
  return classifyZone({
    liveRoas: weekRoas(w),
    breakevenRoas: ber,
    invoiceRoas: invoice,
    spend: w.spend,
    windowRevenue: w.revenue,
  });
}

// ─── Entity aggregation ─────────────────────────────────────────────────────
interface EntityWeekly {
  key: string;
  label: string;
  stores: StoreZoneRow[];
  weeks: WeekBucket[];
  ber: number | null;
}

/** Given the daily hub series and a filtered store list, produce the three
 *  buckets (company / per-department / per-buyer), each with 4 weekly totals
 *  plus a weighted BER used for zone classification. */
function buildEntities(
  series: HubSeries,
  stores: StoreZoneRow[]
): {
  company: EntityWeekly;
  departments: EntityWeekly[];
  buyers: EntityWeekly[];
} {
  // Company = the whole filtered set.
  const company: EntityWeekly = {
    key: "company",
    label: "Company",
    stores,
    weeks: bucketToWeeks(sumSeriesForStores(series, stores)),
    ber: weightedBer(stores),
  };

  // Per department.
  const deptMap = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = s.department ?? "(no department)";
    (deptMap.get(k) ?? deptMap.set(k, []).get(k)!).push(s);
  }
  const departments: EntityWeekly[] = [];
  for (const [key, list] of deptMap) {
    departments.push({
      key: `dept:${key}`,
      label: DEPARTMENT_LABELS[key as keyof typeof DEPARTMENT_LABELS] ?? capitalize(key),
      stores: list,
      weeks: bucketToWeeks(sumSeriesForStores(series, list)),
      ber: weightedBer(list),
    });
  }
  departments.sort((a, b) => b.stores.reduce((x, s) => x + s.spend, 0) - a.stores.reduce((x, s) => x + s.spend, 0));

  // Per buyer.
  const buyerMap = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = s.media_buyer ?? "(unassigned)";
    (buyerMap.get(k) ?? buyerMap.set(k, []).get(k)!).push(s);
  }
  const buyers: EntityWeekly[] = [];
  for (const [key, list] of buyerMap) {
    buyers.push({
      key: `buyer:${key}`,
      label: key,
      stores: list,
      weeks: bucketToWeeks(sumSeriesForStores(series, list)),
      ber: weightedBer(list),
    });
  }
  buyers.sort((a, b) => b.stores.reduce((x, s) => x + s.spend, 0) - a.stores.reduce((x, s) => x + s.spend, 0));

  return { company, departments, buyers };
}

/** Sum the department/buyer daily series buckets for the given store subset,
 *  keeping the same date grid as series.agency. */
function sumSeriesForStores(series: HubSeries, stores: StoreZoneRow[]): DailyPoint[] {
  if (stores.length === 0) return series.agency.map((p) => zeroPoint(p.date));
  // Match by (department, buyer) union so we sum only the requested slice.
  const wantDept = new Set(stores.map((s) => s.department ?? "(no department)"));
  const wantBuyer = new Set(stores.map((s) => s.media_buyer ?? "(unassigned)"));
  // Prefer the smaller pool of buckets.
  const useDept =
    Object.keys(series.byDepartment).length > 0 &&
    Object.keys(series.byDepartment).length <= Object.keys(series.byBuyer).length;
  const source = useDept ? series.byDepartment : series.byBuyer;
  const wanted = useDept ? wantDept : wantBuyer;
  const byDate = new Map<string, { spend: number; revenue: number; conversions: number; impressions: number; clicks: number; add_to_carts: number }>();
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

function zeroPoint(date: string): DailyPoint {
  return {
    date,
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    add_to_carts: 0,
    roas: null,
    cpm: null,
    cpc: null,
    ctr: null,
    cpa: null,
    atc_cpa: null,
  };
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── Line chart palette ────────────────────────────────────────────────────
const LINE_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#84cc16",
  "#a855f7",
];

// ─── Weekly comparison — line chart + table ────────────────────────────────
export function WeeklyComparisonSection({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const entities = useMemo(() => buildEntities(hub.series, filteredStores), [hub.series, filteredStores]);
  const companyInvoice = useMemo(() => weightedInvoice(filteredStores), [filteredStores]);

  // Weeks common to all entities (they all use the same 4-bucket layout).
  const weeks = entities.company.weeks;

  // Build one row per week for the chart, one column per entity.
  const chartData = weeks.map((w, i) => {
    const row: Record<string, number | string | null> = { week: w.label };
    row["Company"] = weekRoas(w);
    for (const d of entities.departments) {
      row[d.label] = weekRoas(d.weeks[i]);
    }
    for (const b of entities.buyers) {
      row[b.label] = weekRoas(b.weeks[i]);
    }
    return row;
  });

  // Line-series list for the chart.
  const chartLines: { key: string; color: string; strokeWidth: number }[] = [
    { key: "Company", color: "#111827", strokeWidth: 3 },
    ...entities.departments.map((d, i) => ({
      key: d.label,
      color: LINE_COLORS[i % LINE_COLORS.length],
      strokeWidth: 2,
    })),
    ...entities.buyers.map((b, i) => ({
      key: b.label,
      color: LINE_COLORS[(i + entities.departments.length) % LINE_COLORS.length],
      strokeWidth: 1.5,
    })),
  ];

  const companyBer = entities.company.ber;

  return (
    <section className="bg-card border border-border rounded-2xl p-5 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Weekly comparison</h2>
        <span className="text-xs text-muted-foreground">
          Last 4 rolling weeks &middot; company &rarr; department &rarr; media buyer
        </span>
      </div>

      {/* Chart: one line per entity, weekly ROAS. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Weekly ROAS
          </div>
          {companyBer != null && (
            <div className="text-[11px] text-muted-foreground">
              Reference = weighted BER (<strong>{fmtRoas(companyBer)}</strong>)
            </div>
          )}
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                tickFormatter={(v) => `${(v as number).toFixed(1)}x`}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => (v == null ? "—" : fmtRoas(v as number))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {companyBer != null && (
                <ReferenceLine
                  y={companyBer}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{ value: "BER", fontSize: 10, fill: "#f59e0b", position: "right" }}
                />
              )}
              {chartLines.map((line) => (
                <Line
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color}
                  strokeWidth={line.strokeWidth}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table: rows = entities grouped, cols = 4 weeks (zone-colored cells). */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2 pr-3 sticky left-0 bg-card">Level</th>
              <th className="text-left font-medium py-2 pr-3">BER</th>
              {weeks.map((w) => (
                <th key={w.index} className="text-left font-medium py-2 pl-3 min-w-[200px]">
                  <div>{w.label}</div>
                  <div className="text-[10px] font-normal text-muted-foreground/70">
                    {w.start.slice(5)} – {w.end.slice(5)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Company */}
            <SectionHeader label="Company" cols={weeks.length + 2} />
            <EntityRow
              entity={entities.company}
              weeks={weeks}
              invoice={companyInvoice}
              indent={false}
            />

            {/* Departments */}
            <SectionHeader label="By department" cols={weeks.length + 2} />
            {entities.departments.map((d) => (
              <EntityRow
                key={d.key}
                entity={d}
                weeks={weeks}
                invoice={weightedInvoice(d.stores)}
                indent
              />
            ))}

            {/* Media buyers */}
            <SectionHeader label="By media buyer" cols={weeks.length + 2} />
            {entities.buyers.map((b) => (
              <EntityRow
                key={b.key}
                entity={b}
                weeks={weeks}
                invoice={weightedInvoice(b.stores)}
                indent
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SectionHeader({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        className="pt-4 pb-1 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground sticky left-0 bg-card"
      >
        {label}
      </td>
    </tr>
  );
}

function EntityRow({
  entity,
  weeks,
  invoice,
  indent,
}: {
  entity: EntityWeekly;
  weeks: WeekBucket[];
  invoice: number | null;
  indent: boolean;
}) {
  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className={cn("py-2 pr-3 font-medium sticky left-0 bg-card whitespace-nowrap", indent && "pl-4")}>
        {entity.label}
        <div className="text-[10px] font-normal text-muted-foreground">
          {entity.stores.length} {entity.stores.length === 1 ? "store" : "stores"}
        </div>
      </td>
      <td className="py-2 pr-3 text-xs text-muted-foreground tabular-nums">
        {fmtRoas(entity.ber)}
      </td>
      {weeks.map((_, i) => {
        const w = entity.weeks[i];
        const zone = weekZone(w, entity.ber, invoice);
        const roas = weekRoas(w);
        return (
          <td key={i} className="py-2 pl-3 align-top">
            <WeekCell w={w} zone={zone} roas={roas} />
          </td>
        );
      })}
    </tr>
  );
}

function WeekCell({
  w,
  zone,
  roas,
}: {
  w: WeekBucket;
  zone: Zone | null;
  roas: number | null;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        zone ? zoneBg[zone] : "border-border bg-muted/30 text-muted-foreground"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest">
          {zone ? (
            <>
              <span className={cn("w-1.5 h-1.5 rounded-full", zoneDot[zone])} />
              {zoneLabel[zone]}
            </>
          ) : (
            "—"
          )}
        </div>
        <div className="text-sm font-semibold tabular-nums">{fmtRoas(roas)}</div>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>Spend {fmtCurrency(w.spend, "USD")}</span>
        <span>Rev {fmtCurrency(w.revenue, "USD")}</span>
      </div>
    </div>
  );
}
