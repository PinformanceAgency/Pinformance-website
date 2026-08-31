"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Activity,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { Exception } from "@/lib/media-buying/exceptions";
import type { Mover } from "@/lib/media-buying/history";
import {
  computeBuyerScorecard,
  computeDepartmentBreakdown,
  computePortfolioHealth,
} from "@/lib/media-buying/rollups";
import { benchmarksFor } from "@/lib/media-buying/benchmarks";
import type { Zone } from "@/lib/media-buying/config";
import { DEPARTMENT_LABELS, COUNTRY_OPTIONS, DEFAULT_ZONE_THRESHOLDS, INVOICING_MODEL_LABELS, classifyZone, mediaBuyerOptions } from "@/lib/media-buying/config";
import type { DailyPoint, HubSeries } from "@/lib/media-buying/hub-series";
import {
  fmtCurrency,
  fmtRoas,
  fmtPct,
  fmtCtr,
  fmtNum,
  zoneBg,
  zoneDot,
  zoneLabel,
} from "./hub-format";

const COUNTRY_LABEL: Record<string, string> = COUNTRY_OPTIONS.reduce(
  (acc, c) => ({ ...acc, [c.code]: c.label }),
  {}
);

// ─── Zone overview + drill-down ─────────────────────────────────────────────
export function ZoneOverview({
  hub,
  onStoreClick,
  filters,
}: {
  hub: HubResponse;
  onStoreClick: (orgId: string) => void;
  filters: HubFilters;
}) {
  const [expanded, setExpanded] = useState<Zone | null>("red");
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const storeTally = tallyByZone(filteredStores);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Zones</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Stores by health over the last {hub.meta.window_days} days. Red = below BER,
          green = above invoice ROAS &amp; at scale, orange in between.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["red", "orange", "green"] as const).map((z) => (
          <ZoneCard
            key={z}
            zone={z}
            storesCount={storeTally[z]}
            expanded={expanded === z}
            onClick={() => setExpanded(expanded === z ? null : z)}
          />
        ))}
      </div>

      {expanded && (
        <ZoneDrilldown
          zone={expanded}
          stores={filteredStores.filter((s) => s.zone === expanded)}
          onStoreClick={onStoreClick}
        />
      )}
    </section>
  );
}

function ZoneCard({
  zone,
  storesCount,
  expanded,
  onClick,
}: {
  zone: Zone;
  storesCount: number;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border px-4 py-3 transition-all hover:scale-[1.01]",
        zoneBg[zone],
        expanded && "ring-2 ring-current/40"
      )}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold">
        <span className={cn("w-2 h-2 rounded-full", zoneDot[zone])} />
        {zoneLabel[zone]}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <div className="text-3xl font-semibold tabular-nums">{storesCount}</div>
        <div className="text-[11px] text-muted-foreground">
          {storesCount === 1 ? "store" : "stores"}
        </div>
        <div className="ml-auto">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </div>
    </button>
  );
}

function ZoneDrilldown({
  zone,
  stores,
  onStoreClick,
}: {
  zone: Zone;
  stores: StoreZoneRow[];
  onStoreClick: (orgId: string) => void;
}) {
  // Store-level only. Per-campaign detail lives in the Store Deep-Dive so
  // the overview stays about "which stores need attention" instead of a wall
  // of campaign names from otherwise-healthy stores.
  return (
    <div className="mt-4">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
        Stores in {zoneLabel[zone]}
      </div>
      {stores.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">None</div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {stores
            .slice()
            .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))
            .map((s) => (
              <li key={s.org_id}>
                <button
                  onClick={() => onStoreClick(s.org_id)}
                  className="w-full text-left flex items-center justify-between rounded-lg border border-border/50 bg-background hover:bg-muted px-3 py-1.5"
                >
                  <span className="text-sm font-medium truncate">{s.store_name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground ml-2 flex-shrink-0">
                    {fmtRoas(s.roas)} / {fmtRoas(s.breakeven_roas)} BER
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ─── Filter bar (department / niche / country / buyer) ──────────────────────
export interface HubFilters {
  department: string;
  niche: string;
  country: string;
  buyer: string;
  /** "revenue_fee" | "spend_fee" | "" — Adspend fee ROAS runs lower than
   *  Revenue fee ROAS because the fee itself is smaller, so the benchmarks
   *  are misleading when you mix them. */
  invoicing_model: string;
}
export const EMPTY_FILTERS: HubFilters = {
  department: "",
  niche: "",
  country: "",
  buyer: "",
  invoicing_model: "",
};

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
    if (f.invoicing_model && s.invoicing_model !== f.invoicing_model) return false;
    return true;
  });
}

/** Global filter bar rendered at the top of the hub page — filters flow
 *  through to every downstream section so the whole page tells the same
 *  story. The window selector is passed in from the page so its value can
 *  round-trip to the API. */
export function GlobalFilterBar({
  hub,
  filters,
  onChange,
  windowSlot,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onChange: (f: HubFilters) => void;
  windowSlot?: React.ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mr-2">
          Filter
        </div>
        <HubFilterBar hub={hub} filters={filters} onChange={onChange} />
        {windowSlot && (
          <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Window
            <div className="normal-case tracking-normal">{windowSlot}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function HubFilterBar({
  hub,
  filters,
  onChange,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onChange: (f: HubFilters) => void;
}) {
  const niches = useMemo(() => {
    const set = new Set<string>();
    for (const s of hub.stores) if (s.niche) set.add(s.niche);
    return Array.from(set).sort();
  }, [hub.stores]);
  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const s of hub.stores) {
      const list = s.countries && s.countries.length > 0 ? s.countries : s.country ? [s.country] : [];
      for (const c of list) set.add(c);
    }
    return Array.from(set).sort();
  }, [hub.stores]);
  const buyers = useMemo(
    () => mediaBuyerOptions(hub.stores.map((s) => s.media_buyer)),
    [hub.stores]
  );

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={filters.department}
        onChange={(v) => onChange({ ...filters, department: v })}
        placeholder="All departments"
        options={Object.entries(DEPARTMENT_LABELS).map(([v, l]) => ({ value: v, label: l }))}
      />
      <Select
        value={filters.niche}
        onChange={(v) => onChange({ ...filters, niche: v })}
        placeholder="All niches"
        options={niches.map((n) => ({ value: n, label: n }))}
      />
      <Select
        value={filters.country}
        onChange={(v) => onChange({ ...filters, country: v })}
        placeholder="All countries"
        options={countries.map((c) => ({ value: c, label: COUNTRY_LABEL[c] ?? c }))}
      />
      <Select
        value={filters.buyer}
        onChange={(v) => onChange({ ...filters, buyer: v })}
        placeholder="All buyers"
        options={buyers.map((b) => ({ value: b, label: b }))}
      />
      <Select
        value={filters.invoicing_model}
        onChange={(v) => onChange({ ...filters, invoicing_model: v })}
        placeholder="All billing"
        options={Object.entries(INVOICING_MODEL_LABELS).map(([v, l]) => ({ value: v, label: l }))}
      />
      {(filters.department || filters.niche || filters.country || filters.buyer || filters.invoicing_model) && (
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function tallyByZone<T extends { zone: Zone | null }>(rows: T[]) {
  return rows.reduce(
    (acc, r) => {
      if (r.zone) acc[r.zone]++;
      return acc;
    },
    { red: 0, orange: 0, green: 0 } as Record<Zone, number>
  );
}

// ─── Portfolio health ───────────────────────────────────────────────────────
type OverviewWindow = 7 | 14 | 30;
const OVERVIEW_WINDOW_OPTIONS: OverviewWindow[] = [7, 14, 30];

/** Sum spend + revenue from the (already filter-summed) daily series over
 *  the last `days` days. Used to recompute the company overview when the
 *  user toggles L7 / L14 / L30. */
function sumSeriesTail(series: DailyPoint[], days: number): { spend: number; revenue: number } {
  const slice = series.slice(-days);
  let spend = 0,
    revenue = 0;
  for (const p of slice) {
    spend += p.spend;
    revenue += p.revenue;
  }
  return { spend, revenue };
}

/** Sum the department/buyer daily series buckets for a store subset, keeping
 *  the same date grid as series.agency. Mirrors the helper in hub-charts.tsx
 *  — duplicated here to avoid a cross-import. */
function sumSeriesForStoresLocal(series: HubSeries, stores: StoreZoneRow[]): DailyPoint[] {
  if (stores.length === 0) {
    return series.agency.map((p) => ({ ...p, spend: 0, revenue: 0 }));
  }
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
    return { ...a, spend: b.spend, revenue: b.revenue };
  });
}

/** Weighted BER + invoice ROAS across a store subset — needed to classify the
 *  aggregate zone. Both weight by each store's current-7d spend, since that's
 *  what StoreZoneRow.spend is; BER doesn't change with the display window, so
 *  the weighting stays representative. */
function weightedBerLocal(stores: StoreZoneRow[]): number | null {
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
function weightedInvoiceLocal(stores: StoreZoneRow[]): number | null {
  let num = 0,
    den = 0;
  for (const s of stores) {
    if (s.spend > 0 && s.breakeven_roas != null) {
      const eff =
        s.invoice_roas != null && s.invoice_roas > 0
          ? s.invoice_roas
          : s.breakeven_roas * DEFAULT_ZONE_THRESHOLDS.green_ratio;
      num += s.spend * eff;
      den += s.spend;
    }
  }
  return den > 0 ? num / den : null;
}

function pctDelta(prev: number, curr: number): number | null {
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

/** Agency-wide roll-up — the top-of-page snapshot. Recomputed client-side
 *  from the filtered store list so the numbers always match what the rest of
 *  the page is showing for the same filter. */
export function CompanyOverviewCard({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  const [windowDays, setWindowDays] = useState<OverviewWindow>(7);
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const filteredSeries = useMemo(
    () => sumSeriesForStoresLocal(hub.series, filteredStores),
    [hub.series, filteredStores]
  );

  const totals = useMemo(() => {
    const curr = sumSeriesTail(filteredSeries, windowDays);
    // Prior period sits one full window back. When we don't have enough
    // series history the deltas come out null and the UI shows an em-dash.
    const priorSlice = filteredSeries.slice(-2 * windowDays, -windowDays);
    let prevSpend = 0,
      prevRev = 0;
    for (const p of priorSlice) {
      prevSpend += p.spend;
      prevRev += p.revenue;
    }
    const ber = weightedBerLocal(filteredStores);
    const invoice = weightedInvoiceLocal(filteredStores);
    const roas = curr.spend > 0 ? curr.revenue / curr.spend : null;
    const prevRoas = prevSpend > 0 ? prevRev / prevSpend : null;
    const zone = classifyZone({
      liveRoas: roas,
      breakevenRoas: ber,
      invoiceRoas: invoice,
      spend: curr.spend,
      windowRevenue: curr.revenue,
    });
    const hasPriorData = priorSlice.length >= windowDays && prevSpend > 0;
    return {
      spend: curr.spend,
      revenue: curr.revenue,
      roas,
      ber,
      zone,
      spend_delta_pct: hasPriorData ? pctDelta(prevSpend, curr.spend) : null,
      revenue_delta_pct: hasPriorData ? pctDelta(prevRev, curr.revenue) : null,
      roas_delta_pct:
        hasPriorData && prevRoas != null && roas != null ? pctDelta(prevRoas, roas) : null,
    };
  }, [filteredSeries, filteredStores, windowDays]);

  const priorLabel = windowDays === 7 ? "WoW" : windowDays === 14 ? "vs prior 14d" : "vs prior 30d";

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Company overview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aggregate for the current filter (spend-weighted). {filteredStores.length}{" "}
            {filteredStores.length === 1 ? "store" : "stores"} in scope.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <WindowToggle value={windowDays} onChange={setWindowDays} />
          <ZoneBadge zone={totals.zone} large />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label={`Total spend (L${windowDays})`} value={fmtCurrency(totals.spend, "USD")} big />
        <Stat label={`Total revenue (L${windowDays})`} value={fmtCurrency(totals.revenue, "USD")} big />
        <Stat
          label="Overall ROAS"
          value={fmtRoas(totals.roas)}
          big
          sub={totals.ber != null ? `vs ${fmtRoas(totals.ber)} BER` : undefined}
        />
      </div>
      <div className="mt-3 border-t border-border pt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <WoWDelta label={`Spend ${priorLabel}`} pct={totals.spend_delta_pct} />
        <WoWDelta label={`Revenue ${priorLabel}`} pct={totals.revenue_delta_pct} />
        <WoWDelta label={`ROAS ${priorLabel}`} pct={totals.roas_delta_pct} />
      </div>
    </section>
  );
}

function WindowToggle({
  value,
  onChange,
}: {
  value: OverviewWindow;
  onChange: (v: OverviewWindow) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card overflow-hidden">
      {OVERVIEW_WINDOW_OPTIONS.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === d ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"
          )}
        >
          L{d}
        </button>
      ))}
    </div>
  );
}

function WoWDelta({ label, pct }: { label: string; pct: number | null }) {
  const trendClass =
    pct == null ? "text-muted-foreground" : pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const Icon = pct != null && pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", trendClass)}>
        <Icon className="w-3 h-3" />
        {fmtPct(pct)}
      </span>
    </div>
  );
}

/** @deprecated alias kept so the page can import either name mid-refactor. */
export const PortfolioHealthCard = CompanyOverviewCard;

function Stat({
  label,
  value,
  sub,
  big,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  big?: boolean;
  color?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-semibold tabular-nums", big ? "text-2xl" : "text-base", color)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Department breakdown ───────────────────────────────────────────────────
export function DepartmentBreakdown({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  // Deliberately ignore the top-level department filter — this panel is the
  // department split, so it always shows every department. Other filters
  // (niche/country/buyer) still apply.
  const filteredStores = useMemo(
    () => filterStores(hub.stores, { ...filters, department: "" }),
    [hub.stores, filters]
  );
  const filteredWow = useMemo(() => {
    const ok = new Set(filteredStores.map((s) => s.org_id));
    return hub.wow.byStore.filter((w) => ok.has(w.org_id));
  }, [hub.wow.byStore, filteredStores]);
  const rows = useMemo(
    () => computeDepartmentBreakdown(filteredStores, filteredWow),
    [filteredStores, filteredWow]
  );
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">By department</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Spend-weighted roll-up per department. Zone is derived from the aggregate
        ROAS vs the aggregate breakeven / invoice target for that department.
      </p>
      <ScorecardTable
        rows={rows.map((r) => ({
          key: r.key,
          label: DEPARTMENT_LABEL_MAP[r.key] ?? capitalize(r.key),
          stores: r.stores,
          spend: r.spend,
          revenue: r.revenue,
          roas: r.roas,
          weighted_ber: r.weighted_ber,
          zone: r.zone,
          zones: r.zones,
          wow_spend_delta_pct: r.wow_spend_delta_pct,
          wow_roas_delta_pct: r.wow_roas_delta_pct,
        }))}
        firstColLabel="Department"
        emptyLabel="No configured stores in this filter."
      />
    </section>
  );
}

const DEPARTMENT_LABEL_MAP: Record<string, string> = {
  ...DEPARTMENT_LABELS,
  "(no department)": "No department",
};

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ─── Media buyer scorecard ──────────────────────────────────────────────────
export function BuyerScorecard({
  hub,
  filters,
}: {
  hub: HubResponse;
  filters: HubFilters;
}) {
  // Deliberately ignore the top-level buyer filter (same rationale as
  // DepartmentBreakdown above).
  const filteredStores = useMemo(
    () => filterStores(hub.stores, { ...filters, buyer: "" }),
    [hub.stores, filters]
  );
  const filteredWow = useMemo(() => {
    const ok = new Set(filteredStores.map((s) => s.org_id));
    return hub.wow.byStore.filter((w) => ok.has(w.org_id));
  }, [hub.wow.byStore, filteredStores]);
  const rows = useMemo(
    () => computeBuyerScorecard(filteredStores, filteredWow),
    [filteredStores, filteredWow]
  );
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">By media buyer</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Same aggregate per media buyer — surfaces who&apos;s carrying red stores and
        who&apos;s scaling green ones.
      </p>
      <ScorecardTable
        rows={rows.map((r) => ({
          key: r.key,
          label: r.media_buyer,
          stores: r.stores,
          spend: r.spend,
          revenue: r.revenue,
          roas: r.roas,
          weighted_ber: r.weighted_ber,
          zone: r.zone,
          zones: r.zones,
          wow_spend_delta_pct: r.wow_spend_delta_pct,
          wow_roas_delta_pct: r.wow_roas_delta_pct,
        }))}
        firstColLabel="Media buyer"
        emptyLabel="No configured stores in this filter."
      />
    </section>
  );
}

interface ScorecardTableRow {
  key: string;
  label: string;
  stores: number;
  spend: number;
  revenue: number;
  roas: number | null;
  weighted_ber: number | null;
  zone: Zone | null;
  zones: { red: number; orange: number; green: number };
  wow_spend_delta_pct: number | null;
  wow_roas_delta_pct: number | null;
}

function ScorecardTable({
  rows,
  firstColLabel,
  emptyLabel,
}: {
  rows: ScorecardTableRow[];
  firstColLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-muted-foreground text-xs">
          <tr>
            <th className="text-left font-medium py-2">{firstColLabel}</th>
            <th className="text-left font-medium py-2 pl-3">Zone</th>
            <th className="text-right font-medium py-2">Stores</th>
            <th className="text-right font-medium py-2">Spend (7d)</th>
            <th className="text-right font-medium py-2">Revenue (7d)</th>
            <th className="text-right font-medium py-2">ROAS</th>
            <th className="text-right font-medium py-2">vs BER</th>
            <th className="text-left font-medium py-2 pl-3">Zone mix</th>
            <th className="text-right font-medium py-2">Spend WoW</th>
            <th className="text-right font-medium py-2">ROAS WoW</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/60 last:border-b-0">
              <td className="py-2 font-medium">{r.label}</td>
              <td className="py-2 pl-3">
                <ZoneBadge zone={r.zone} />
              </td>
              <td className="py-2 text-right tabular-nums">{r.stores}</td>
              <td className="py-2 text-right tabular-nums">{fmtCurrency(r.spend, "USD")}</td>
              <td className="py-2 text-right tabular-nums">{fmtCurrency(r.revenue, "USD")}</td>
              <td className="py-2 text-right tabular-nums font-medium">{fmtRoas(r.roas)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">
                {fmtRoas(r.weighted_ber)}
              </td>
              <td className="py-2 pl-3">
                <ZoneBars red={r.zones.red} orange={r.zones.orange} green={r.zones.green} />
              </td>
              <td className="py-2 text-right tabular-nums">
                <DeltaPct v={r.wow_spend_delta_pct} />
              </td>
              <td className="py-2 text-right tabular-nums">
                <DeltaPct v={r.wow_roas_delta_pct} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-muted-foreground text-sm">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Zone chip with dot + label. `large` variant used at the top of the page. */
function ZoneBadge({ zone, large }: { zone: Zone | null; large?: boolean }) {
  if (!zone) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        Unclassified
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold",
        zoneBg[zone],
        large ? "px-3 py-1 text-xs uppercase tracking-widest" : "px-2 py-0.5 text-[11px]"
      )}
    >
      <span className={cn("rounded-full", zoneDot[zone], large ? "w-2 h-2" : "w-1.5 h-1.5")} />
      {zoneLabel[zone]}
    </span>
  );
}

function ZoneBars({ red, orange, green }: { red: number; orange: number; green: number }) {
  const total = red + orange + green;
  if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 rounded overflow-hidden w-24">
        {red > 0 && <div className="bg-red-500" style={{ width: `${(red / total) * 100}%` }} />}
        {orange > 0 && <div className="bg-amber-500" style={{ width: `${(orange / total) * 100}%` }} />}
        {green > 0 && <div className="bg-emerald-500" style={{ width: `${(green / total) * 100}%` }} />}
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {red}·{orange}·{green}
      </span>
    </div>
  );
}

function DeltaPct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const cls = v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span className={cls}>{fmtPct(v)}</span>;
}

// ─── Exceptions ("attention") ───────────────────────────────────────────────
const RULE_LABELS: Record<Exception["rule"], string> = {
  red_streak: "Red streak",
  spend_drop: "Spend drop",
  roas_crash: "ROAS crash",
  stale_account: "Stale account",
};

export function ExceptionsPanel({
  hub,
  onStoreClick,
}: {
  hub: HubResponse;
  onStoreClick: (orgId: string) => void;
}) {
  const list = hub.exceptions;
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h2 className="text-base font-semibold">Needs attention</h2>
        <span className="text-xs text-muted-foreground">
          {list.length} flag{list.length === 1 ? "" : "s"}
        </span>
      </div>
      {list.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">All clear.</div>
      ) : (
        <ul className="space-y-2">
          {list.map((e, i) => {
            const sevBg =
              e.severity === "high"
                ? "border-red-500/40 bg-red-500/5"
                : e.severity === "medium"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border";
            return (
              <li key={i}>
                <button
                  onClick={() => onStoreClick(e.org_id)}
                  className={cn(
                    "w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2",
                    sevBg
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {e.store_name}{" "}
                      <span className="text-muted-foreground font-normal">— {RULE_LABELS[e.rule]}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{e.detail}</div>
                  </div>
                  {e.spend_context != null && (
                    <div className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                      {fmtCurrency(e.spend_context, "USD")}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Zone movers ────────────────────────────────────────────────────────────
const MOVER_LABEL: Record<Mover["category"], { label: string; cls: string; icon: React.ElementType }> = {
  recovery: { label: "Recovering", cls: "text-emerald-600 dark:text-emerald-400", icon: TrendingUp },
  improvement: { label: "Improving", cls: "text-lime-600 dark:text-lime-400", icon: TrendingUp },
  alarm: { label: "Alarm", cls: "text-red-600 dark:text-red-400", icon: TrendingDown },
  regression: { label: "Regressing", cls: "text-amber-600 dark:text-amber-400", icon: TrendingDown },
};

export function MoversPanel({
  hub,
  onStoreClick,
}: {
  hub: HubResponse;
  onStoreClick: (orgId: string) => void;
}) {
  const list = hub.movers;
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Zone movers</h2>
        <span className="text-xs text-muted-foreground">last {hub.meta.window_days}d vs prior {hub.meta.window_days}d</span>
      </div>
      {list.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No zone flips this period.</div>
      ) : (
        <ul className="space-y-1">
          {list.map((m, i) => {
            const info = MOVER_LABEL[m.category];
            const Icon = info.icon;
            return (
              <li key={i}>
                <button
                  onClick={() => onStoreClick(m.org_id)}
                  className="w-full text-left flex items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted"
                >
                  <Icon className={cn("w-4 h-4 flex-shrink-0", info.cls)} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.store_name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className={cn("uppercase tracking-widest font-semibold", info.cls)}>{info.label}</span>
                      {" · "}
                      {m.from ? zoneLabel[m.from] : "—"} → {m.to ? zoneLabel[m.to] : "—"} · ROAS {fmtRoas(m.roas_prev)} → {fmtRoas(m.roas_curr)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {fmtCurrency(m.spend_curr, "USD")}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Stores table (with benchmarks alongside) ───────────────────────────────
export function StoresTable({
  hub,
  filters,
  onStoreClick,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onStoreClick: (orgId: string) => void;
}) {
  const rows = useMemo(() => {
    const filtered = filterStores(hub.stores, filters);
    return filtered.sort((a, b) => (a.ratio ?? 999) - (b.ratio ?? 999));
  }, [hub.stores, filters]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold">Stores</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} configured &amp; active
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2">Store</th>
              <th className="text-left font-medium py-2">Dept</th>
              <th className="text-left font-medium py-2">Niche</th>
              <th className="text-right font-medium py-2">Spend</th>
              <th className="text-right font-medium py-2">ROAS</th>
              <th className="text-right font-medium py-2">BER</th>
              <th className="text-right font-medium py-2">vs niche</th>
              <th className="text-right font-medium py-2">vs country</th>
              <th className="text-left font-medium py-2 pl-3">Zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const bench = benchmarksFor(s, hub.benchmarks);
              return (
                <tr
                  key={s.org_id}
                  className="border-b border-border/60 last:border-b-0 cursor-pointer hover:bg-muted"
                  onClick={() => onStoreClick(s.org_id)}
                >
                  <td className="py-2 font-medium">{s.store_name}</td>
                  <td className="py-2 text-muted-foreground text-xs">
                    {s.department ? DEPARTMENT_LABELS[s.department] : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground text-xs">{s.niche ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{fmtCurrency(s.spend, s.currency ?? "USD")}</td>
                  <td className="py-2 text-right tabular-nums">{fmtRoas(s.roas)}</td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {fmtRoas(s.breakeven_roas)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <BenchDelta pct={bench.roasVsNichePct} sufficient={bench.niche?.sufficient} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <BenchDelta pct={bench.roasVsCountryPct} sufficient={bench.country?.sufficient} />
                  </td>
                  <td className="py-2 pl-3">
                    {s.zone ? (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border", zoneBg[s.zone])}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", zoneDot[s.zone])} />
                        {zoneLabel[s.zone]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                  No stores match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BenchDelta({ pct, sufficient }: { pct: number | null; sufficient?: boolean }) {
  if (!sufficient) return <span className="text-[11px] text-muted-foreground italic">n/a</span>;
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  const cls = pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return <span className={cls}>{fmtPct(pct)}</span>;
}

// ─── Naming-convention explorer ─────────────────────────────────────────────
export function NamingExplorer({ hub }: { hub: HubResponse }) {
  const [country, setCountry] = useState("");
  const [funnel, setFunnel] = useState("");
  const [perfPlus, setPerfPlus] = useState("");
  const [belowBer, setBelowBer] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return hub.campaigns.filter((c) => {
      if (country && c.parsed_country !== country) return false;
      if (funnel && c.parsed_funnel !== funnel) return false;
      if (perfPlus && c.parsed_performance_plus !== perfPlus) return false;
      if (belowBer && c.zone !== "red") return false;
      if (qLower) {
        const hay = `${c.name ?? ""} ${c.store_name} ${c.parsed_strategy_category ?? ""}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [hub.campaigns, country, funnel, perfPlus, belowBer, q]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const c of hub.campaigns) if (c.parsed_country) set.add(c.parsed_country);
    return Array.from(set).sort();
  }, [hub.campaigns]);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Naming-convention explorer</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Filter campaigns across every store by type, P+/NP+, country and product. Combine with
            &quot;below BER&quot; to spot patterns.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / product / store"
            className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Select
            value={country}
            onChange={setCountry}
            placeholder="All countries"
            options={countries.map((c) => ({ value: c, label: c }))}
          />
          <Select
            value={funnel}
            onChange={setFunnel}
            placeholder="All types"
            options={[
              { value: "PROSP", label: "Prospecting" },
              { value: "RET", label: "Retargeting" },
            ]}
          />
          <Select
            value={perfPlus}
            onChange={setPerfPlus}
            placeholder="All P+"
            options={[
              { value: "P+", label: "Performance+" },
              { value: "NP+", label: "Non-Performance+" },
            ]}
          />
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={belowBer}
              onChange={(e) => setBelowBer(e.target.checked)}
            />
            Below BER only
          </label>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2">Campaign</th>
              <th className="text-left font-medium py-2">Store</th>
              <th className="text-left font-medium py-2">Country</th>
              <th className="text-left font-medium py-2">Type</th>
              <th className="text-left font-medium py-2">P+</th>
              <th className="text-left font-medium py-2">Product</th>
              <th className="text-right font-medium py-2">Spend</th>
              <th className="text-right font-medium py-2">ROAS</th>
              <th className="text-left font-medium py-2 pl-3">Zone</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => b.spend - a.spend)
              .slice(0, 500)
              .map((c) => (
                <tr key={`${c.org_id}-${c.entity_id}`} className="border-b border-border/60 last:border-b-0">
                  <td className="py-1.5 text-xs truncate max-w-[280px]">{c.name ?? c.entity_id}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{c.store_name}</td>
                  <td className="py-1.5 text-xs">{c.parsed_country ?? "—"}</td>
                  <td className="py-1.5 text-xs">{c.parsed_funnel ?? "—"}</td>
                  <td className="py-1.5 text-xs">{c.parsed_performance_plus ?? "—"}</td>
                  <td className="py-1.5 text-xs">{c.parsed_strategy_category ?? "—"}</td>
                  <td className="py-1.5 text-xs text-right tabular-nums">{fmtCurrency(c.spend, "USD")}</td>
                  <td className="py-1.5 text-xs text-right tabular-nums">{fmtRoas(c.roas)}</td>
                  <td className="py-1.5 pl-3">
                    {c.zone ? (
                      <span className={cn("inline-block w-2 h-2 rounded-full", zoneDot[c.zone])} />
                    ) : null}
                  </td>
                </tr>
              ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-muted-foreground text-sm">
                  No campaigns match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          Showing top 500 by spend. Refine filters to narrow further.
        </p>
      )}
    </section>
  );
}

// Re-export helpers used by the parent page.
export { fmtCurrency, fmtRoas, fmtPct, fmtCtr, fmtNum };
