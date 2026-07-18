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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { Exception } from "@/lib/media-buying/exceptions";
import type { Mover } from "@/lib/media-buying/history";
import { benchmarksFor } from "@/lib/media-buying/benchmarks";
import type { Zone } from "@/lib/media-buying/config";
import { DEPARTMENT_LABELS, COUNTRY_OPTIONS } from "@/lib/media-buying/config";
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
  onFiltersChange,
}: {
  hub: HubResponse;
  onStoreClick: (orgId: string) => void;
  filters: HubFilters;
  onFiltersChange: (f: HubFilters) => void;
}) {
  const [expanded, setExpanded] = useState<Zone | null>("red");
  const filteredStores = useMemo(() => filterStores(hub.stores, filters), [hub.stores, filters]);
  const storeTally = tallyByZone(filteredStores);

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Zones</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Stores by health over the last {hub.meta.window_days} days. Red = below BER,
            green = above invoice ROAS &amp; at scale, orange in between.
          </p>
        </div>
        <HubFilterBar hub={hub} filters={filters} onChange={onFiltersChange} />
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
}
export const EMPTY_FILTERS: HubFilters = { department: "", niche: "", country: "", buyer: "" };

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
    for (const s of hub.stores) if (s.country) set.add(s.country);
    return Array.from(set).sort();
  }, [hub.stores]);
  const buyers = useMemo(() => {
    const set = new Set<string>();
    for (const s of hub.stores) if (s.media_buyer) set.add(s.media_buyer);
    return Array.from(set).sort();
  }, [hub.stores]);

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
      {(filters.department || filters.niche || filters.country || filters.buyer) && (
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
export function PortfolioHealthCard({ hub }: { hub: HubResponse }) {
  const ph = hub.portfolio_health;
  const w = hub.wow.agency;
  const color =
    ph.verdict === "healthy"
      ? "text-emerald-600 dark:text-emerald-400"
      : ph.verdict === "watch"
      ? "text-lime-600 dark:text-lime-400"
      : ph.verdict === "concerning"
      ? "text-amber-600 dark:text-amber-400"
      : ph.verdict === "critical"
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold">Portfolio health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Spend-weighted score across every configured store — how the book is doing overall.
          </p>
        </div>
        <div className={cn("text-xs uppercase tracking-widest font-semibold", color)}>
          {ph.verdict}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Health score" value={ph.score != null ? `${ph.score}/100` : "—"} big color={color} />
        <Stat label="Total spend (7d)" value={fmtCurrency(ph.total_spend, "USD")} />
        <Stat label="Total revenue (7d)" value={fmtCurrency(ph.total_revenue, "USD")} />
        <Stat label="Overall ROAS" value={fmtRoas(ph.overall_roas)} sub={`vs ${fmtRoas(ph.weighted_ber)} BER`} />
      </div>
      <div className="mt-3 border-t border-border pt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <WoWLine label="Spend WoW" prev={w.spend_prev} curr={w.spend_curr} pct={w.spend_delta_pct} currency="USD" />
        <WoWLine label="Revenue WoW" prev={w.revenue_prev} curr={w.revenue_curr} pct={w.revenue_delta_pct} currency="USD" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">ROAS WoW</span>
          <span className="font-medium tabular-nums">{fmtRoas(w.roas_prev)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium tabular-nums">{fmtRoas(w.roas_curr)}</span>
          <VerdictBadge verdict={w.verdict} />
        </div>
      </div>
    </section>
  );
}

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

function WoWLine({
  label,
  prev,
  curr,
  pct,
  currency,
}: {
  label: string;
  prev: number;
  curr: number;
  pct: number | null;
  currency: string;
}) {
  const trendClass = pct == null ? "text-muted-foreground" : pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const Icon = pct != null && pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{fmtCurrency(prev, currency)}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-medium tabular-nums">{fmtCurrency(curr, currency)}</span>
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", trendClass)}>
        <Icon className="w-3 h-3" />
        {fmtPct(pct)}
      </span>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: "good" | "flat" | "bad" }) {
  const cls =
    verdict === "good"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : verdict === "bad"
      ? "bg-red-500/15 text-red-700 dark:text-red-400"
      : "bg-muted text-muted-foreground";
  return <span className={cn("ml-auto text-[10px] uppercase tracking-widest font-semibold rounded-full px-2 py-0.5", cls)}>{verdict === "good" ? "Good week" : verdict === "bad" ? "Weak week" : "Flat"}</span>;
}

// ─── Media buyer scorecard ──────────────────────────────────────────────────
export function BuyerScorecard({ hub }: { hub: HubResponse }) {
  const rows = hub.buyer_scorecard;
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-base font-semibold">Media buyer scorecard</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Zone distribution and week-over-week movement per buyer — surfaces who&apos;s carrying red stores.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium py-2">Buyer</th>
              <th className="text-right font-medium py-2">Stores</th>
              <th className="text-right font-medium py-2">Spend (7d)</th>
              <th className="text-right font-medium py-2">ROAS</th>
              <th className="text-left font-medium py-2 pl-3">Zones</th>
              <th className="text-right font-medium py-2">Spend WoW</th>
              <th className="text-right font-medium py-2">ROAS WoW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.media_buyer} className="border-b border-border/60 last:border-b-0">
                <td className="py-2 font-medium">{r.media_buyer}</td>
                <td className="py-2 text-right tabular-nums">{r.stores}</td>
                <td className="py-2 text-right tabular-nums">{fmtCurrency(r.spend, "USD")}</td>
                <td className="py-2 text-right tabular-nums">{fmtRoas(r.roas)}</td>
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
                <td colSpan={7} className="py-6 text-center text-muted-foreground text-sm">
                  No configured stores yet. Fill in buyers on the Store Settings page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
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
