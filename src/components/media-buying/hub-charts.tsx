"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { DailyPoint, HubSeries } from "@/lib/media-buying/hub-series";
import { classifyZone, DEPARTMENT_LABELS, type Zone } from "@/lib/media-buying/config";
import type { HubFilters } from "./hub-panels";
import { fmtCurrency, fmtRoas, fmtPct, zoneBg, zoneDot, zoneLabel } from "./hub-format";

// ─── Filter helper (mirrors filterStores in hub-panels) ─────────────────────
export function filterStores(stores: StoreZoneRow[], f: HubFilters): StoreZoneRow[] {
  return stores.filter((s) => {
    if (!s.configured || !s.is_active) return false;
    if (f.department && s.department !== f.department) return false;
    if (f.niche && s.niche !== f.niche) return false;
    if (f.country) {
      const list = s.countries && s.countries.length > 0 ? s.countries : s.country ? [s.country] : [];
      if (!list.includes(f.country)) return false;
    }
    if (f.buyer && s.media_buyer !== f.buyer) return false;
    if (f.invoicing_model && s.invoicing_model !== f.invoicing_model) return false;
    return true;
  });
}

// ─── Weekly bucketing ───────────────────────────────────────────────────────
interface WeekBucket {
  label: string;
  start: string;
  end: string;
  spend: number;
  revenue: number;
  roas: number | null;
}

const WEEK_LABELS = ["3w ago", "2w ago", "Last week", "This week"];

function fmtMonthDay(iso: string): string {
  // "2026-07-01" → "Jul 1"
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function bucketToWeeks(daily: DailyPoint[]): WeekBucket[] {
  const last28 = daily.slice(-28);
  const weeks: WeekBucket[] = [];
  for (let i = 0; i < 4; i++) {
    const slice = last28.slice(i * 7, i * 7 + 7);
    if (slice.length === 0) {
      weeks.push({
        label: WEEK_LABELS[i],
        start: "",
        end: "",
        spend: 0,
        revenue: 0,
        roas: null,
      });
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
      start: slice[0].date,
      end: slice[slice.length - 1].date,
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
export interface EntityRow {
  key: string;
  label: string;
  stores: StoreZoneRow[];
  weeks: WeekBucket[];
  ber: number | null;
  invoice: number | null;
  weekZones: (Zone | null)[];
  currentZone: Zone | null;
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

/** How to slice the daily series for the requested store subset. Picking the
 *  wrong axis was the root cause of "every buyer shows the same numbers as
 *  their department" — for a buyer roll-up we MUST sum from series.byBuyer,
 *  not from series.byDepartment, otherwise all buyers inside a single dept
 *  end up sharing the department's totals. */
type GroupBy = "company" | "department" | "buyer";

function sumSeriesForStores(
  series: HubSeries,
  stores: StoreZoneRow[],
  groupBy: GroupBy = "buyer"
): DailyPoint[] {
  if (stores.length === 0) return series.agency.map((p) => zeroPoint(p.date));
  if (groupBy === "company") {
    // Whole book: agency series is already the sum of every store's daily
    // total, so return it directly (respects the filtered store set only
    // when the caller passed the filtered list — which is always the case).
    return series.agency.map((p) => ({ ...p }));
  }
  const isBuyer = groupBy === "buyer";
  const source = isBuyer ? series.byBuyer : series.byDepartment;
  const wanted = new Set(
    stores.map((s) =>
      isBuyer ? s.media_buyer ?? "(unassigned)" : s.department ?? "(no department)"
    )
  );
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
  keyPrefix: string,
  groupBy: GroupBy = "buyer"
): EntityRow {
  const weeks = bucketToWeeks(sumSeriesForStores(series, stores, groupBy));
  const ber = weightedBer(stores);
  const invoice = weightedInvoice(stores);
  const weekZones = weeks.map((w) =>
    classifyZone({
      liveRoas: w.roas,
      breakevenRoas: ber,
      invoiceRoas: invoice,
      spend: w.spend,
      windowRevenue: w.revenue,
    })
  );
  const current = weeks[weeks.length - 1];
  const prior = weeks[weeks.length - 2];
  const currentZone = weekZones[weekZones.length - 1];
  const roasDeltaPct =
    prior?.roas && current?.roas ? ((current.roas - prior.roas) / prior.roas) * 100 : null;
  return {
    key: keyPrefix,
    label,
    stores,
    weeks,
    ber,
    invoice,
    weekZones,
    currentZone,
    currentRoas: current?.roas ?? null,
    roasDeltaPct,
  };
}

export function buildEntities(
  hub: HubResponse,
  stores: StoreZoneRow[]
): { company: EntityRow; departments: EntityRow[]; buyers: EntityRow[] } {
  const series = hub.series;
  const company = buildEntity("Company", stores, series, "company", "company");

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
        `dept:${k}`,
        "department"
      )
    )
    .sort((a, b) => sumSpend(b.stores) - sumSpend(a.stores));

  const buyerMap = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = s.media_buyer ?? "(unassigned)";
    (buyerMap.get(k) ?? buyerMap.set(k, []).get(k)!).push(s);
  }
  const buyers = Array.from(buyerMap.entries())
    .map(([k, list]) => buildEntity(k, list, series, `buyer:${k}`, "buyer"))
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
    <div className="space-y-4">
      <SectionTitle
        label="Company"
        description="Aggregate for the whole filtered book — spend, revenue and ROAS per week."
      />
      <EntityBlock entity={entities.company} />

      <SectionTitle
        label="By department"
        description="Same weekly breakdown, split per department."
      />
      <div className="space-y-4">
        {entities.departments.map((e) => (
          <EntityBlock key={e.key} entity={e} />
        ))}
      </div>

      <SectionTitle
        label="By media buyer"
        description="Same weekly breakdown, per buyer — who's carrying red weeks and who's stacking green."
      />
      <div className="space-y-4">
        {entities.buyers.map((e) => (
          <EntityBlock key={e.key} entity={e} />
        ))}
      </div>
    </div>
  );
}

function SectionTitle({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <CalendarDays className="w-4 h-4 text-muted-foreground" />
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-widest">{label}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function EntityBlock({ entity }: { entity: EntityRow }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      {/* Header: label + current headline metric */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <ZonePill zone={entity.currentZone} />
          <div>
            <h3 className="text-lg font-semibold">{entity.label}</h3>
            <div className="text-xs text-muted-foreground">
              {entity.stores.length} {entity.stores.length === 1 ? "store" : "stores"}
              {entity.ber != null && (
                <> &middot; BER <strong>{fmtRoas(entity.ber)}</strong></>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Current ROAS
          </div>
          <div className="text-3xl font-semibold tabular-nums leading-none">
            {fmtRoas(entity.currentRoas)}
          </div>
          <div className="mt-1">
            <TrendPill pct={entity.roasDeltaPct} label="vs last week" />
          </div>
        </div>
      </div>

      {/* Bigger bar chart */}
      <div className="h-56 md:h-64">
        <WeekBars weeks={entity.weeks} ber={entity.ber} />
      </div>

      {/* Per-week zoom: zone dot + ROAS + delta + spend/revenue */}
      <div className="mt-4 grid grid-cols-4 gap-3 border-t border-border pt-4">
        {entity.weeks.map((w, i) => (
          <WeekDetail
            key={i}
            week={w}
            zone={entity.weekZones[i]}
            priorRoas={i > 0 ? entity.weeks[i - 1].roas : null}
          />
        ))}
      </div>
    </section>
  );
}

function WeekDetail({
  week,
  zone,
  priorRoas,
}: {
  week: WeekBucket;
  zone: Zone | null;
  priorRoas: number | null;
}) {
  const delta =
    priorRoas != null && priorRoas > 0 && week.roas != null
      ? ((week.roas - priorRoas) / priorRoas) * 100
      : null;
  const hasData = week.spend > 0 || week.revenue > 0;
  return (
    <div className="text-center px-2">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            zone ? zoneDot[zone] : "bg-muted"
          )}
        />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
          {week.label}
        </span>
      </div>
      {hasData && week.start && (
        <div className="text-[10px] text-muted-foreground/70 mb-1">
          {fmtMonthDay(week.start)} – {fmtMonthDay(week.end)}
        </div>
      )}
      <div className="text-lg font-semibold tabular-nums">
        {fmtRoas(week.roas)}
      </div>
      <div className="min-h-[16px]">
        {delta != null && <TrendPill pct={delta} small />}
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums space-y-0.5">
        <div>Spend <span className="text-foreground">{fmtCurrency(week.spend, "USD")}</span></div>
        <div>Rev <span className="text-foreground">{fmtCurrency(week.revenue, "USD")}</span></div>
      </div>
    </div>
  );
}

function ZonePill({ zone }: { zone: Zone | null }) {
  if (!zone) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
        Unclassified
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest", zoneBg[zone])}>
      <span className={cn("w-2 h-2 rounded-full", zoneDot[zone])} />
      {zoneLabel[zone]}
    </span>
  );
}

function TrendPill({
  pct,
  label,
  small,
}: {
  pct: number | null;
  label?: string;
  small?: boolean;
}) {
  if (pct == null || !isFinite(pct)) {
    return (
      <span className={cn("text-muted-foreground", small ? "text-[11px]" : "text-xs")}>—</span>
    );
  }
  const positive = pct >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  const cls = positive
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        small ? "text-[11px]" : "text-xs",
        cls
      )}
    >
      <Icon className={cn(small ? "w-3 h-3" : "w-3.5 h-3.5")} />
      {fmtPct(pct)}
      {label && !small && <span className="text-muted-foreground font-normal ml-1">{label}</span>}
    </span>
  );
}

function WeekBars({ weeks, ber }: { weeks: WeekBucket[]; ber: number | null }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={weeks}
        margin={{ top: 12, right: 12, bottom: 4, left: 4 }}
        barCategoryGap={"20%"}
      >
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
          tickFormatter={(v) =>
            (v as number) >= 1000
              ? `$${Math.round((v as number) / 1000)}k`
              : `$${v}`
          }
          width={44}
        />
        <Tooltip
          cursor={{ fill: "currentColor", opacity: 0.05 }}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v, name) => [fmtCurrency(v as number, "USD"), name]}
        />
        <Bar dataKey="spend" name="Spend" fill="#94a3b8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Zone blocks (large per-entity view) ───────────────────────────────────
/** Big-block view of zone composition per entity — one card per Company /
 *  Department / Media buyer. Each card has a stacked bar chart of store
 *  counts per zone over the last 4 weeks, then a three-column list of the
 *  stores currently in each zone. Rewired to focus on "how many stores are
 *  in each zone" rather than showing ROAS numbers. */
export function ZoneBlocksSection({
  hub,
  filters,
  onStoreClick,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onStoreClick?: (orgId: string) => void;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const groups = useMemo(() => {
    const byDept = new Map<string, StoreZoneRow[]>();
    const byBuyer = new Map<string, StoreZoneRow[]>();
    for (const s of filteredStores) {
      const d = s.department ?? "(no department)";
      (byDept.get(d) ?? byDept.set(d, []).get(d)!).push(s);
      const b = s.media_buyer ?? "(unassigned)";
      (byBuyer.get(b) ?? byBuyer.set(b, []).get(b)!).push(s);
    }
    const departments = Array.from(byDept.entries())
      .map(([k, list]) => ({
        key: `dept:${k}`,
        label: DEPARTMENT_LABELS[k as keyof typeof DEPARTMENT_LABELS] ?? capitalize(k),
        stores: list,
      }))
      .sort((a, b) => b.stores.length - a.stores.length);
    const buyers = Array.from(byBuyer.entries())
      .map(([k, list]) => ({ key: `buyer:${k}`, label: k, stores: list }))
      .sort((a, b) => b.stores.length - a.stores.length);
    return { departments, buyers };
  }, [filteredStores]);

  return (
    <div className="space-y-4">
      <SectionTitle label="Company" description="Zone composition for the whole filtered book." />
      <ZoneBlock
        title="Company"
        stores={filteredStores}
        onStoreClick={onStoreClick}
      />
      <SectionTitle label="By department" description="Same view per department." />
      <div className="space-y-4">
        {groups.departments.map((g) => (
          <ZoneBlock key={g.key} title={g.label} stores={g.stores} onStoreClick={onStoreClick} />
        ))}
      </div>
      <SectionTitle label="By media buyer" description="Same view per buyer." />
      <div className="space-y-4">
        {groups.buyers.map((g) => (
          <ZoneBlock key={g.key} title={g.label} stores={g.stores} onStoreClick={onStoreClick} />
        ))}
      </div>
    </div>
  );
}

interface ZoneCounts {
  red: number;
  orange: number;
  green: number;
  unclassified: number;
}

const WEEK_LABELS_FULL = ["3w ago", "2w ago", "Last week", "This week"];

function countZonesForWeek(stores: StoreZoneRow[], weekIndex: number): ZoneCounts {
  const c: ZoneCounts = { red: 0, orange: 0, green: 0, unclassified: 0 };
  for (const s of stores) {
    const z = s.weekly_zones?.[weekIndex] ?? null;
    if (z === "red") c.red++;
    else if (z === "orange") c.orange++;
    else if (z === "green") c.green++;
    else c.unclassified++;
  }
  return c;
}

function ZoneBlock({
  title,
  stores,
  onStoreClick,
}: {
  title: string;
  stores: StoreZoneRow[];
  onStoreClick?: (orgId: string) => void;
}) {
  // Build 4 weekly rows of {week, red, orange, green} for the stacked bar chart.
  const chartData = [0, 1, 2, 3].map((i) => {
    const c = countZonesForWeek(stores, i);
    return {
      week: WEEK_LABELS_FULL[i],
      Red: c.red,
      Orange: c.orange,
      Green: c.green,
    };
  });
  // Delta text: current vs prior week per zone.
  const current = countZonesForWeek(stores, 3);
  const prior = countZonesForWeek(stores, 2);
  const currentZoneByStore = new Map<string, Zone | null>(
    stores.map((s) => [s.org_id, (s.weekly_zones?.[3] ?? s.zone) as Zone | null])
  );
  const red = stores.filter((s) => currentZoneByStore.get(s.org_id) === "red");
  const orange = stores.filter((s) => currentZoneByStore.get(s.org_id) === "orange");
  const green = stores.filter((s) => currentZoneByStore.get(s.org_id) === "green");
  const unclassified = stores.filter((s) => {
    const z = currentZoneByStore.get(s.org_id);
    return z !== "red" && z !== "orange" && z !== "green";
  });

  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <div className="text-xs text-muted-foreground">
            {stores.length} {stores.length === 1 ? "store" : "stores"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ZoneTally label="Red" count={current.red} delta={current.red - prior.red} kind="red" />
          <ZoneTally label="Orange" count={current.orange} delta={current.orange - prior.orange} kind="orange" />
          <ZoneTally label="Green" count={current.green} delta={current.green - prior.green} kind="green" />
        </div>
      </div>

      {/* Chart */}
      <div className="h-56 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 12, bottom: 4, left: 4 }} barCategoryGap={"20%"} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
            <XAxis
              dataKey="week"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
              width={30}
            />
            <Tooltip
              cursor={{ fill: "currentColor", opacity: 0.05 }}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            {/* Grouped side-by-side (no stackId) so red / orange / green sit next
                to each other per week rather than stacking on top of each other. */}
            <Bar dataKey="Red" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Orange" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Green" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Store lists per zone */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border pt-4">
        <ZoneColumn kind="red" stores={red} onStoreClick={onStoreClick} />
        <ZoneColumn kind="orange" stores={orange} onStoreClick={onStoreClick} />
        <ZoneColumn kind="green" stores={green} onStoreClick={onStoreClick} />
      </div>
      {unclassified.length > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          {unclassified.length} store{unclassified.length === 1 ? "" : "s"} not classified this
          week (no spend).
        </div>
      )}
    </section>
  );
}

function ZoneTally({
  label,
  count,
  delta,
  kind,
}: {
  label: string;
  count: number;
  delta: number;
  kind: "red" | "orange" | "green";
}) {
  const color =
    kind === "red"
      ? "text-red-600 dark:text-red-400"
      : kind === "orange"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
  const border =
    kind === "red"
      ? "border-red-500/40"
      : kind === "orange"
      ? "border-amber-500/40"
      : "border-emerald-500/40";
  return (
    <div className={cn("rounded-lg border px-3 py-1.5 min-w-[74px] text-center", border)}>
      <div className={cn("text-[10px] uppercase tracking-widest font-semibold", color)}>{label}</div>
      <div className="text-lg font-semibold tabular-nums leading-none mt-0.5">{count}</div>
      {delta !== 0 && (
        <div
          className={cn(
            "text-[10px] tabular-nums font-medium mt-0.5",
            delta > 0 ? color : "text-muted-foreground"
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta} wk/wk
        </div>
      )}
    </div>
  );
}

function ZoneColumn({
  kind,
  stores,
  onStoreClick,
}: {
  kind: "red" | "orange" | "green";
  stores: StoreZoneRow[];
  onStoreClick?: (orgId: string) => void;
}) {
  const styles = {
    red: {
      header: "text-red-600 dark:text-red-400",
      border: "border-red-500/40",
      bg: "bg-red-500/5 hover:bg-red-500/10",
      dot: "bg-red-500",
    },
    orange: {
      header: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/40",
      bg: "bg-amber-500/5 hover:bg-amber-500/10",
      dot: "bg-amber-500",
    },
    green: {
      header: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-500/40",
      bg: "bg-emerald-500/5 hover:bg-emerald-500/10",
      dot: "bg-emerald-500",
    },
  }[kind];
  const label = kind === "red" ? "Red" : kind === "orange" ? "Orange" : "Green";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("w-2 h-2 rounded-full", styles.dot)} />
        <span className={cn("text-[10px] uppercase tracking-widest font-semibold", styles.header)}>
          {label} — {stores.length}
        </span>
      </div>
      {stores.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No stores</div>
      ) : (
        <ul className="space-y-1">
          {stores.map((s) => (
            <li key={s.org_id}>
              <button
                onClick={() => onStoreClick?.(s.org_id)}
                className={cn(
                  "w-full text-left rounded-lg border px-2.5 py-1.5",
                  styles.border,
                  styles.bg,
                  !onStoreClick && "cursor-default"
                )}
              >
                <div className="text-sm font-medium truncate">{s.store_name}</div>
                {s.media_buyer && (
                  <div className="text-[11px] text-muted-foreground truncate">{s.media_buyer}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Zone matrix (kept for now; deprecated in favour of ZoneBlocksSection) ─
/** @deprecated Use ZoneBlocksSection. */
export function ZoneMatrix({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const entities = useMemo(() => buildEntities(hub, filteredStores), [hub, filteredStores]);
  const weekLabels = entities.company.weeks.map((w) => w.label);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Zone matrix</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Read each row left → right to see how the zone flipped week by week.
        Company on top, then per department, then per media buyer.
      </p>

      {/* Header row */}
      <div className="grid grid-cols-[minmax(180px,220px)_repeat(4,minmax(0,1fr))] gap-2 mb-2 pb-2 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
        <div>Level</div>
        {weekLabels.map((l) => (
          <div key={l} className="text-center">{l}</div>
        ))}
      </div>

      <MatrixGroup label="Company" entities={[entities.company]} />
      <MatrixGroup label="By department" entities={entities.departments} />
      <MatrixGroup label="By media buyer" entities={entities.buyers} />
    </section>
  );
}

function MatrixGroup({ label, entities }: { label: string; entities: EntityRow[] }) {
  if (entities.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold pt-1 pb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {entities.map((e) => (
          <MatrixRow key={e.key} entity={e} />
        ))}
      </div>
    </div>
  );
}

function MatrixRow({ entity }: { entity: EntityRow }) {
  return (
    <div className="grid grid-cols-[minmax(180px,220px)_repeat(4,minmax(0,1fr))] gap-2 items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{entity.label}</div>
        <div className="text-[11px] text-muted-foreground">
          {entity.stores.length} {entity.stores.length === 1 ? "store" : "stores"}
        </div>
      </div>
      {entity.weeks.map((w, i) => (
        <ZoneCell key={i} zone={entity.weekZones[i]} roas={w.roas} hasData={w.spend > 0} />
      ))}
    </div>
  );
}

function ZoneCell({ zone, roas, hasData }: { zone: Zone | null; roas: number | null; hasData: boolean }) {
  if (!hasData) {
    return (
      <div className="rounded-lg border border-dashed border-border/50 h-14 flex items-center justify-center text-[11px] text-muted-foreground/50">
        —
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-lg border h-14 flex items-center justify-center gap-2 transition-colors",
        zone
          ? {
              red: "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-400",
              orange: "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400",
              green: "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
            }[zone]
          : "border-border text-muted-foreground"
      )}
    >
      {zone && (
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            {
              red: "bg-red-500",
              orange: "bg-amber-500",
              green: "bg-emerald-500",
            }[zone]
          )}
        />
      )}
      <div className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-widest font-semibold">
          {zone ?? "n/a"}
        </span>
        <span className="text-xs font-medium tabular-nums opacity-80">
          {fmtRoas(roas)}
        </span>
      </div>
    </div>
  );
}
