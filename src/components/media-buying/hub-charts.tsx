"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { CalendarDays, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { DailyPoint, HubSeries } from "@/lib/media-buying/hub-series";
import { classifyZone, DEPARTMENT_LABELS, type Zone } from "@/lib/media-buying/config";
import type { HubFilters } from "./hub-panels";
import { fmtCurrency, fmtRoas, fmtPct, zoneDot } from "./hub-format";

// ─── Filter helper (mirrors filterStores in hub-panels) ─────────────────────
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
interface WeekBucket {
  label: string;
  spend: number;
  revenue: number;
  roas: number | null;
}

const WEEK_LABELS = ["3w", "2w", "1w", "Now"];

function bucketToWeeks(daily: DailyPoint[]): WeekBucket[] {
  const last28 = daily.slice(-28);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 4; i++) {
    const slice = last28.slice(i * 7, i * 7 + 7);
    if (slice.length === 0) {
      weeks.push({ label: WEEK_LABELS[i], spend: 0, revenue: 0, roas: null });
      continue;
    }
    let spend = 0,
      revenue = 0;
    for (const p of slice) {
      spend += p.spend;
      revenue += p.revenue;
    }
    weeks.push({
      label: WEEK_LABELS[i],
      spend: Math.round(spend),
      revenue: Math.round(revenue),
      roas: spend > 0 ? revenue / spend : null,
    });
  }
  return weeks;
}

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

// ─── Entity aggregation ────────────────────────────────────────────────────
interface EntityRow {
  key: string;
  label: string;
  stores: StoreZoneRow[];
  weeks: WeekBucket[];
  zone: Zone | null;
  currentRoas: number | null;
  roasDeltaPct: number | null;
}

function zeroPoint(date: string): DailyPoint {
  return {
    date,
    spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0, add_to_carts: 0,
    roas: null, cpm: null, cpc: null, ctr: null, cpa: null, atc_cpa: null,
  };
}

function sumSeriesForStores(series: HubSeries, stores: StoreZoneRow[]): DailyPoint[] {
  if (stores.length === 0) return series.agency.map((p) => zeroPoint(p.date));
  const wantDept = new Set(stores.map((s) => s.department ?? "(no department)"));
  const wantBuyer = new Set(stores.map((s) => s.media_buyer ?? "(unassigned)"));
  const useDept =
    Object.keys(series.byDepartment).length > 0 &&
    Object.keys(series.byDepartment).length <= Object.keys(series.byBuyer).length;
  const source = useDept ? series.byDepartment : series.byBuyer;
  const wanted = useDept ? wantDept : wantBuyer;
  const byDate = new Map<string, { spend: number; revenue: number }>();
  for (const [key, points] of Object.entries(source)) {
    if (!wanted.has(key)) continue;
    for (const p of points) {
      const cur = byDate.get(p.date) ?? { spend: 0, revenue: 0 };
      cur.spend += p.spend;
      cur.revenue += p.revenue;
      byDate.set(p.date, cur);
    }
  }
  return series.agency.map((a) => {
    const b = byDate.get(a.date) ?? { spend: 0, revenue: 0 };
    return {
      ...zeroPoint(a.date),
      spend: b.spend,
      revenue: b.revenue,
      roas: b.spend > 0 ? b.revenue / b.spend : null,
    };
  });
}

function buildEntity(
  label: string,
  stores: StoreZoneRow[],
  series: HubSeries,
  keyPrefix: string
): EntityRow {
  const weeks = bucketToWeeks(sumSeriesForStores(series, stores));
  const ber = weightedBer(stores);
  const invoice = weightedInvoice(stores);
  const current = weeks[weeks.length - 1];
  const prior = weeks[weeks.length - 2];
  const zone = classifyZone({
    liveRoas: current?.roas ?? null,
    breakevenRoas: ber,
    invoiceRoas: invoice,
    spend: current?.spend ?? 0,
    windowRevenue: current?.revenue ?? 0,
  });
  const roasDeltaPct =
    prior?.roas && current?.roas ? ((current.roas - prior.roas) / prior.roas) * 100 : null;
  return {
    key: keyPrefix,
    label,
    stores,
    weeks,
    zone,
    currentRoas: current?.roas ?? null,
    roasDeltaPct,
  };
}

function buildEntities(
  hub: HubResponse,
  stores: StoreZoneRow[]
): { company: EntityRow; departments: EntityRow[]; buyers: EntityRow[] } {
  const series = hub.series;
  const company = buildEntity("Company", stores, series, "company");

  const deptMap = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = s.department ?? "(no department)";
    (deptMap.get(k) ?? deptMap.set(k, []).get(k)!).push(s);
  }
  const departments = Array.from(deptMap.entries())
    .map(([k, list]) =>
      buildEntity(
        DEPARTMENT_LABELS[k as keyof typeof DEPARTMENT_LABELS] ?? capitalize(k),
        list,
        series,
        `dept:${k}`
      )
    )
    .sort((a, b) => sumSpend(b.stores) - sumSpend(a.stores));

  const buyerMap = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = s.media_buyer ?? "(unassigned)";
    (buyerMap.get(k) ?? buyerMap.set(k, []).get(k)!).push(s);
  }
  const buyers = Array.from(buyerMap.entries())
    .map(([k, list]) => buildEntity(k, list, series, `buyer:${k}`))
    .sort((a, b) => sumSpend(b.stores) - sumSpend(a.stores));

  return { company, departments, buyers };
}

function sumSpend(stores: StoreZoneRow[]): number {
  return stores.reduce((a, s) => a + s.spend, 0);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── The section ────────────────────────────────────────────────────────────
export function WeeklyComparisonSection({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const entities = useMemo(() => buildEntities(hub, filteredStores), [hub, filteredStores]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Weekly comparison</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Grouped bars = weekly spend (grey) &amp; revenue (green) over the last 4 weeks. Read
        each row left-to-right to see growth or shrinkage per entity.
      </p>

      {/* Column headers */}
      <div className="grid grid-cols-[minmax(160px,220px)_1fr_140px] gap-4 items-center pb-2 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        <div>Level</div>
        <div>Weekly spend &amp; revenue</div>
        <div className="text-right">Current ROAS</div>
      </div>

      <SectionRow entity={entities.company} groupLabel="Company" />

      <SectionSeparator label="By department" />
      {entities.departments.map((e) => (
        <SectionRow key={e.key} entity={e} indent />
      ))}

      <SectionSeparator label="By media buyer" />
      {entities.buyers.map((e) => (
        <SectionRow key={e.key} entity={e} indent />
      ))}
    </section>
  );
}

function SectionSeparator({ label }: { label: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
      {label}
    </div>
  );
}

function SectionRow({
  entity,
  groupLabel,
  indent,
}: {
  entity: EntityRow;
  groupLabel?: string;
  indent?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(160px,220px)_1fr_140px] gap-4 items-center py-3 border-b border-border/40 last:border-b-0",
        groupLabel && "mt-2"
      )}
    >
      {/* Label + zone dot */}
      <div className={cn("flex items-center gap-2 min-w-0", indent && "pl-3")}>
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            entity.zone ? zoneDot[entity.zone] : "bg-muted"
          )}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{entity.label}</div>
          <div className="text-[11px] text-muted-foreground">
            {entity.stores.length} {entity.stores.length === 1 ? "store" : "stores"}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="h-16">
        <WeekBars weeks={entity.weeks} />
      </div>

      {/* Current ROAS + WoW delta */}
      <div className="text-right">
        <div className="text-lg font-semibold tabular-nums">
          {fmtRoas(entity.currentRoas)}
        </div>
        <TrendPill pct={entity.roasDeltaPct} />
      </div>
    </div>
  );
}

function TrendPill({ pct }: { pct: number | null }) {
  if (pct == null || !isFinite(pct)) {
    return <div className="text-[11px] text-muted-foreground">—</div>;
  }
  const positive = pct >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const cls = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return (
    <div className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums", cls)}>
      <Icon className="w-3 h-3" />
      {fmtPct(pct)}
    </div>
  );
}

function WeekBars({ weeks }: { weeks: WeekBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={12}>
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
        />
        <Tooltip
          cursor={{ fill: "currentColor", opacity: 0.05 }}
          contentStyle={{ fontSize: 11, borderRadius: 8, padding: "4px 8px" }}
          formatter={(v, name) => [fmtCurrency(v as number, "USD"), name]}
          labelStyle={{ fontSize: 10 }}
        />
        <Bar dataKey="spend" name="Spend" fill="#94a3b8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
