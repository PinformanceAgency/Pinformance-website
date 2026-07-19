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
function filterStores(stores: StoreZoneRow[], f: HubFilters): StoreZoneRow[] {
  return stores.filter((s) => {
    if (!s.configured || !s.is_active) return false;
    if (f.department && s.department !== f.department) return false;
    if (f.niche && s.niche !== f.niche) return false;
    if (f.country) {
      const list = s.countries && s.countries.length > 0 ? s.countries : s.country ? [s.country] : [];
      if (!list.includes(f.country)) return false;
    }
    if (f.buyer && s.media_buyer !== f.buyer) return false;
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
interface EntityRow {
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
