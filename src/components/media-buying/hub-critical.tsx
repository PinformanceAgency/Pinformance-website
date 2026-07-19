"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowUpRight, Flame, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { Exception } from "@/lib/media-buying/exceptions";
import type { Mover } from "@/lib/media-buying/history";
import { fmtCurrency, fmtRoas } from "./hub-format";
import { filterStores } from "./hub-charts";
import type { HubFilters } from "./hub-panels";

/**
 * Head-of-media-buying scanner. Five categorized cards so you can eyeball
 * "where's the fire and who's crushing it" in one screen:
 *
 *   1. Alarms       — someone just fell into red vs the prior period
 *   2. Attention    — exception engine flags (red streak, spend drop, …)
 *   3. Currently red — stores in the red zone right now
 *   4. Recovering    — moved out of red or into green this period
 *   5. Consistent winners — currently green, top by spend
 */
export function CriticalAttentionOverview({
  hub,
  filters,
  onStoreClick,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onStoreClick: (orgId: string) => void;
}) {
  const filteredStores = useMemo(
    () => filterStores(hub.stores, filters),
    [hub.stores, filters]
  );
  const orgIdsInFilter = useMemo(
    () => new Set(filteredStores.map((s) => s.org_id)),
    [filteredStores]
  );

  const exceptions = useMemo(
    () => hub.exceptions.filter((e) => orgIdsInFilter.has(e.org_id)),
    [hub.exceptions, orgIdsInFilter]
  );
  const movers = useMemo(
    () => hub.movers.filter((m) => orgIdsInFilter.has(m.org_id)),
    [hub.movers, orgIdsInFilter]
  );
  const alarms = movers.filter((m) => m.category === "alarm");
  const recovering = movers.filter(
    (m) => m.category === "recovery" || m.category === "improvement"
  );

  const currentlyRed = useMemo(
    () =>
      filteredStores
        .filter((s) => s.zone === "red")
        .sort((a, b) => b.spend - a.spend),
    [filteredStores]
  );
  const currentlyGreen = useMemo(
    () =>
      filteredStores
        .filter((s) => s.zone === "green")
        .sort((a, b) => b.spend - a.spend),
    [filteredStores]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AlarmCard alarms={alarms} onStoreClick={onStoreClick} />
      <ExceptionsCard exceptions={exceptions} onStoreClick={onStoreClick} />
      <CurrentlyRedCard stores={currentlyRed} onStoreClick={onStoreClick} />
      <RecoveringCard recovering={recovering} onStoreClick={onStoreClick} />
      <WinnersCard stores={currentlyGreen} onStoreClick={onStoreClick} />
    </div>
  );
}

// ─── Card shell ─────────────────────────────────────────────────────────────
function CardShell({
  icon: Icon,
  iconClass,
  title,
  count,
  emptyLabel,
  children,
  full,
}: {
  icon: React.ElementType;
  iconClass?: string;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <section className={cn("bg-card border border-border rounded-2xl p-5", full && "lg:col-span-2")}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn("w-4 h-4", iconClass ?? "text-muted-foreground")} />
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {count === 0 ? (
        <div className="text-sm text-muted-foreground italic">{emptyLabel}</div>
      ) : (
        <div>{children}</div>
      )}
    </section>
  );
}

// ─── Individual cards ───────────────────────────────────────────────────────
const RULE_LABEL: Record<Exception["rule"], string> = {
  red_streak: "Red streak",
  spend_drop: "Spend drop",
  roas_crash: "ROAS crash",
  stale_account: "Stale account",
};

function AlarmCard({
  alarms,
  onStoreClick,
}: {
  alarms: Mover[];
  onStoreClick: (orgId: string) => void;
}) {
  return (
    <CardShell
      icon={Flame}
      iconClass="text-red-500"
      title="Alarms"
      count={alarms.length}
      emptyLabel="No stores fell into red this period."
    >
      <ul className="space-y-1.5">
        {alarms.map((m) => (
          <li key={m.org_id}>
            <button
              onClick={() => onStoreClick(m.org_id)}
              className="w-full text-left rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 hover:bg-red-500/10"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{m.store_name}</span>
                <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                  {fmtCurrency(m.spend_curr, "USD")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="uppercase tracking-widest font-semibold text-red-600 dark:text-red-400">
                  {m.from ?? "—"} → {m.to ?? "—"}
                </span>
                {" · "}ROAS {fmtRoas(m.roas_prev)} → {fmtRoas(m.roas_curr)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function ExceptionsCard({
  exceptions,
  onStoreClick,
}: {
  exceptions: Exception[];
  onStoreClick: (orgId: string) => void;
}) {
  return (
    <CardShell
      icon={AlertTriangle}
      iconClass="text-amber-500"
      title="Needs attention"
      count={exceptions.length}
      emptyLabel="All clear."
    >
      <ul className="space-y-1.5">
        {exceptions.map((e, i) => {
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
                className={cn("w-full text-left rounded-lg border px-3 py-2", sevBg)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {e.store_name}{" "}
                      <span className="text-muted-foreground font-normal">
                        — {RULE_LABEL[e.rule]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{e.detail}</div>
                  </div>
                  {e.spend_context != null && (
                    <div className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                      {fmtCurrency(e.spend_context, "USD")}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
}

function CurrentlyRedCard({
  stores,
  onStoreClick,
}: {
  stores: StoreZoneRow[];
  onStoreClick: (orgId: string) => void;
}) {
  return (
    <CardShell
      icon={AlertTriangle}
      iconClass="text-red-500"
      title="Currently red"
      count={stores.length}
      emptyLabel="No stores are red right now."
    >
      <StoreList stores={stores} onStoreClick={onStoreClick} zone="red" />
    </CardShell>
  );
}

function RecoveringCard({
  recovering,
  onStoreClick,
}: {
  recovering: Mover[];
  onStoreClick: (orgId: string) => void;
}) {
  return (
    <CardShell
      icon={ArrowUpRight}
      iconClass="text-emerald-500"
      title="Recovering"
      count={recovering.length}
      emptyLabel="No zone recoveries this period."
    >
      <ul className="space-y-1.5">
        {recovering.map((m) => (
          <li key={m.org_id}>
            <button
              onClick={() => onStoreClick(m.org_id)}
              className="w-full text-left rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 hover:bg-emerald-500/10"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate">{m.store_name}</span>
                <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                  {fmtCurrency(m.spend_curr, "USD")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="uppercase tracking-widest font-semibold text-emerald-600 dark:text-emerald-400">
                  {m.from ?? "—"} → {m.to ?? "—"}
                </span>
                {" · "}ROAS {fmtRoas(m.roas_prev)} → {fmtRoas(m.roas_curr)}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function WinnersCard({
  stores,
  onStoreClick,
}: {
  stores: StoreZoneRow[];
  onStoreClick: (orgId: string) => void;
}) {
  return (
    <CardShell
      icon={Trophy}
      iconClass="text-emerald-500"
      title="Winners (green today)"
      count={stores.length}
      emptyLabel="No stores currently in the green zone."
      full
    >
      <StoreList stores={stores} onStoreClick={onStoreClick} zone="green" />
    </CardShell>
  );
}

function StoreList({
  stores,
  onStoreClick,
  zone,
}: {
  stores: StoreZoneRow[];
  onStoreClick: (orgId: string) => void;
  zone: "red" | "green" | "orange";
}) {
  const borderClass =
    zone === "red"
      ? "border-red-500/40 bg-red-500/5 hover:bg-red-500/10"
      : zone === "green"
      ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
      : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10";
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
      {stores.map((s) => (
        <li key={s.org_id}>
          <button
            onClick={() => onStoreClick(s.org_id)}
            className={cn("w-full text-left rounded-lg border px-3 py-2", borderClass)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{s.store_name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.media_buyer ?? "—"} · BER {fmtRoas(s.breakeven_roas)}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmtRoas(s.roas)}</div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtCurrency(s.spend, s.currency ?? "USD")}
                </div>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Re-export to keep bundlers happy when other components use it indirectly.
export const __hub_critical_icon = Sparkles;
