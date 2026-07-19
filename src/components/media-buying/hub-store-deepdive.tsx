"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import { benchmarksFor } from "@/lib/media-buying/benchmarks";
import { DEPARTMENT_LABELS, COUNTRY_OPTIONS } from "@/lib/media-buying/config";
import { fmtCurrency, fmtRoas, fmtPct, fmtCtr, fmtNum, zoneBg, zoneDot, zoneLabel } from "./hub-format";

const COUNTRY_LABEL: Record<string, string> = COUNTRY_OPTIONS.reduce(
  (acc, c) => ({ ...acc, [c.code]: c.label }),
  {}
);

/**
 * Store deep-dive modal. Everything a media buyer needs to know about ONE
 * store in a single scroll: zone, ROAS vs benchmarks, WoW, top+bottom
 * campaigns, exceptions and notes.
 */
export function StoreDeepDive({
  orgId,
  hub,
  onClose,
}: {
  orgId: string;
  hub: HubResponse;
  onClose: () => void;
}) {
  const store = hub.stores.find((s) => s.org_id === orgId);
  const wow = hub.wow.byStore.find((w) => w.org_id === orgId);
  const campaigns = useMemo(
    () => hub.campaigns.filter((c) => c.org_id === orgId).sort((a, b) => b.spend - a.spend),
    [hub.campaigns, orgId]
  );
  const exceptions = hub.exceptions.filter((e) => e.org_id === orgId);
  const bench = store ? benchmarksFor(store, hub.benchmarks) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!store) {
    return (
      <ModalShell onClose={onClose} title="Store not found">
        <p className="text-sm text-muted-foreground">
          This store was removed or isn&apos;t configured yet. Set it up on the Store Settings page.
        </p>
      </ModalShell>
    );
  }

  const currency = store.currency ?? "USD";
  const top = campaigns.slice(0, 5);
  const bottom = campaigns
    .filter((c) => c.spend > 0)
    .slice()
    .sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0))
    .slice(0, 5);

  return (
    <ModalShell onClose={onClose} title={store.store_name}>
      <div className="space-y-5">
        {/* Header row: zone + key context */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {store.zone && (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold border", zoneBg[store.zone])}>
              <span className={cn("w-1.5 h-1.5 rounded-full", zoneDot[store.zone])} />
              {zoneLabel[store.zone]}
            </span>
          )}
          <Chip label="Department" value={store.department ? DEPARTMENT_LABELS[store.department] : "—"} />
          <Chip label="Niche" value={store.niche ?? "—"} />
          <Chip
            label={
              (store.countries?.length ?? 0) > 1 || (store.countries?.length ?? 0) === 0
                ? "Countries"
                : "Country"
            }
            value={
              store.countries && store.countries.length > 0
                ? store.countries.map((c) => COUNTRY_LABEL[c] ?? c).join(", ")
                : store.country
                ? COUNTRY_LABEL[store.country] ?? store.country
                : "—"
            }
          />
          <Chip label="Buyer" value={store.media_buyer ?? "—"} />
          <Chip label="BER" value={fmtRoas(store.breakeven_roas)} />
          <Chip label="Invoice ROAS" value={fmtRoas(store.invoice_roas)} />
          {store.attribution_setting && (
            <Chip label="Attribution" value={store.attribution_setting} />
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Spend (7d)" value={fmtCurrency(store.spend, currency)} />
          <Kpi label="Revenue (7d)" value={fmtCurrency(store.revenue, currency)} />
          <Kpi label="ROAS" value={fmtRoas(store.roas)} sub={`vs ${fmtRoas(store.breakeven_roas)} BER`} />
          <Kpi label="CPM" value={fmtCurrency(store.cpm, currency)} />
          <Kpi label="CTR" value={fmtCtr(store.ctr)} />
        </div>

        {/* Benchmarks */}
        {bench && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BenchmarkCard
              label={`Niche ${store.niche ?? ""}`}
              stats={bench.niche}
              storeRoas={store.roas}
              currency={currency}
            />
            <BenchmarkCard
              label={`Country ${(store.countries?.[0] ?? store.country) ?? ""}`}
              stats={bench.country}
              storeRoas={store.roas}
              currency={currency}
            />
            <BenchmarkCard
              label="Overall book"
              stats={bench.overall}
              storeRoas={store.roas}
              currency={currency}
            />
          </div>
        )}

        {/* Week-over-week */}
        {wow && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <WoWStat label="Spend" prev={wow.spend_prev} curr={wow.spend_curr} pct={wow.spend_delta_pct} currency={currency} />
            <WoWStat label="Revenue" prev={wow.revenue_prev} curr={wow.revenue_curr} pct={wow.revenue_delta_pct} currency={currency} />
            <WoWRoasStat prev={wow.roas_prev} curr={wow.roas_curr} />
          </div>
        )}

        {/* Exceptions */}
        {exceptions.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-widest mb-2">
              Flags
            </div>
            <ul className="space-y-1 text-sm">
              {exceptions.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.rule.replace("_", " ")}</span>{" "}
                  <span className="text-muted-foreground">— {e.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top + bottom campaigns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CampaignList title="Top campaigns (by spend)" campaigns={top} currency={currency} />
          <CampaignList title="Bottom campaigns (by ROAS, with spend)" campaigns={bottom} currency={currency} />
        </div>

        {/* Notes */}
        <ZoneRulesFootnote store={store} hub={hub} />
      </div>
    </ModalShell>
  );
}

function ZoneRulesFootnote({
  store,
  hub,
}: {
  store: import("@/lib/media-buying/zones").StoreZoneRow;
  hub: HubResponse;
}) {
  const ber = store.breakeven_roas;
  const invoice =
    store.invoice_roas ??
    (ber != null
      ? ber *
        (store.zone_thresholds?.green_ratio ?? hub.meta.default_zone_thresholds.green_ratio)
      : null);
  const floor =
    store.zone_thresholds?.min_weekly_revenue ??
    hub.meta.default_green_revenue_weekly_floor;
  return (
    <div className="text-xs text-muted-foreground border-t border-border pt-3">
      <strong>Zone rules for this store:</strong>{" "}
      ROAS &lt; <strong>{fmtRoas(ber)}</strong> = red · ROAS &ge;{" "}
      <strong>{fmtRoas(invoice)}</strong> AND weekly revenue &ge;{" "}
      <strong>{fmtCurrency(floor, store.currency ?? "USD")}</strong> = green ·
      everything else = orange.
      {store.invoice_roas == null && (
        <span className="italic"> (Invoice ROAS not set; using BER &times; green fallback ratio.)</span>
      )}
    </div>
  );
}

function ModalShell({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-3xl mt-8 mb-8 rounded-2xl bg-card border border-border shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4 rounded-t-2xl">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Store deep-dive</div>
            <h2 className="text-lg font-semibold mt-0.5">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function BenchmarkCard({
  label,
  stats,
  storeRoas,
  currency,
}: {
  label: string;
  stats: { n: number; sufficient: boolean; roas: number | null; cpm: number | null; cpc: number | null; ctr: number | null; cpa: number | null } | null;
  storeRoas: number | null;
  currency: string;
}) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-xs text-muted-foreground italic mt-1">Not set</div>
      </div>
    );
  }
  if (!stats.sufficient) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-xs text-muted-foreground italic mt-1">Insufficient data ({stats.n} stores)</div>
      </div>
    );
  }
  const delta = stats.roas && storeRoas ? ((storeRoas - stats.roas) / stats.roas) * 100 : null;
  const cls = delta == null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">n={stats.n}</div>
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">ROAS {fmtRoas(stats.roas)}</div>
      <div className={cn("text-xs tabular-nums", cls)}>{fmtPct(delta)} vs peers</div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
        <div>CPM: <span className="text-foreground tabular-nums">{fmtCurrency(stats.cpm, currency)}</span></div>
        <div>CPC: <span className="text-foreground tabular-nums">{fmtCurrency(stats.cpc, currency)}</span></div>
        <div>CTR: <span className="text-foreground tabular-nums">{fmtCtr(stats.ctr)}</span></div>
        <div>CPA: <span className="text-foreground tabular-nums">{fmtCurrency(stats.cpa, currency)}</span></div>
      </div>
    </div>
  );
}

function WoWStat({ label, prev, curr, pct, currency }: { label: string; prev: number; curr: number; pct: number | null; currency: string }) {
  const cls = pct == null ? "text-muted-foreground" : pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label} WoW</div>
      <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {fmtCurrency(prev, currency)} → <span className="text-foreground font-medium">{fmtCurrency(curr, currency)}</span>
      </div>
      <div className={cn("text-sm tabular-nums font-medium", cls)}>{fmtPct(pct)}</div>
    </div>
  );
}
function WoWRoasStat({ prev, curr }: { prev: number | null; curr: number | null }) {
  const pct = prev && curr ? ((curr - prev) / prev) * 100 : null;
  const cls = pct == null ? "text-muted-foreground" : pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">ROAS WoW</div>
      <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
        {fmtRoas(prev)} → <span className="text-foreground font-medium">{fmtRoas(curr)}</span>
      </div>
      <div className={cn("text-sm tabular-nums font-medium", cls)}>{fmtPct(pct)}</div>
    </div>
  );
}

function CampaignList({
  title,
  campaigns,
  currency,
}: {
  title: string;
  campaigns: import("@/lib/media-buying/zones").CampaignZoneRow[];
  currency: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{title}</div>
      {campaigns.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">None</div>
      ) : (
        <ul className="space-y-1">
          {campaigns.map((c) => (
            <li key={c.entity_id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-1.5">
              {c.zone && <span className={cn("w-2 h-2 rounded-full flex-shrink-0", zoneDot[c.zone])} />}
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{c.name ?? c.entity_id}</div>
              </div>
              <div className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                {fmtCurrency(c.spend, currency)} · {fmtRoas(c.roas)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
