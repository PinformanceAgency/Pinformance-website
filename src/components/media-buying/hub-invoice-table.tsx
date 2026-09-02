"use client";

/**
 * Last month's numbers per store, in the shape invoicing needs them.
 *
 * The zone blocks answer "what colour was this store"; this answers "what do
 * we bill it on". Deliberately a flat, exportable table rather than another
 * card: the figures leave the dashboard for an invoice, so they have to be
 * copyable in one gesture and readable without clicking into anything.
 *
 * Three rules it does not break:
 *  - Amounts stay in the ad account's own currency and are NEVER summed
 *    across currencies. Totals are grouped per currency, always.
 *  - A store we hold no data for shows an em dash, not 0. A store nobody
 *    measured is not a store that earned nothing.
 *  - A store offboarded since the month ended is still listed if it spent
 *    during that month. It gets invoiced for the month it ran.
 */

import { useMemo, useState } from "react";
import { Download, Copy, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HubResponse } from "@/lib/media-buying/hub-types";
import type { StoreZoneRow } from "@/lib/media-buying/zones";
import type { HubFilters } from "./hub-panels";
import { fmtCurrency, fmtRoas, zoneBg, zoneLabel } from "./hub-format";

/** Same predicate as the shared filterStores, minus the is_active gate — a
 *  store that left in the new month still has a last month to be paid for. */
function filterForInvoice(stores: StoreZoneRow[], f: HubFilters): StoreZoneRow[] {
  return stores.filter((s) => {
    if (!s.configured) return false;
    if (!s.is_active && s.last_month.days_with_data === 0) return false;
    if (f.department && s.department !== f.department) return false;
    if (f.niche && s.niche !== f.niche) return false;
    if (f.country) {
      const list =
        s.countries && s.countries.length > 0 ? s.countries : s.country ? [s.country] : [];
      if (!list.includes(f.country)) return false;
    }
    if (f.buyer && s.media_buyer !== f.buyer) return false;
    if (f.invoicing_model && s.invoicing_model !== f.invoicing_model) return false;
    return true;
  });
}

/** "2026-08" → "August 2026". */
export function fmtMonthKeyLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-08" → "Aug 2026". */
export function fmtMonthKeyShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-08-14" → "14 Aug". */
function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** What the store's month looked like. Counting days cannot separate "this
 *  store was offboarded on the 8th" from "we lost eight days of data", and
 *  the first is the normal case: a store gets invoiced for the part of the
 *  month it ran. So report the SHAPE — when it started, when it stopped, and
 *  whether anything is missing in between. Only the last one is a defect. */
type MonthShape =
  | { kind: "none" }
  | { kind: "full" }
  | { kind: "partial"; label: string }
  | { kind: "gap"; label: string; gapDays: number };

function monthShape(s: StoreZoneRow): MonthShape {
  const lm = s.last_month;
  if (lm.days_with_data === 0 || !lm.measured_from || !lm.measured_through) return { kind: "none" };
  const period = `${fmtDay(lm.measured_from)} – ${fmtDay(lm.measured_through)}`;
  if (lm.gap_days > 0) return { kind: "gap", label: period, gapDays: lm.gap_days };
  if (lm.days_with_data === lm.days_in_month) return { kind: "full" };
  return { kind: "partial", label: period };
}

type SortKey = "store" | "buyer" | "spend" | "revenue" | "roas" | "basis" | "zone";
type SortDir = "asc" | "desc";

const ZONE_ORDER: Record<string, number> = { red: 0, orange: 1, green: 2 };

/** The figure the store is invoiced on, per its model. Null when we hold no
 *  data for the month — never 0. */
function basisOf(s: StoreZoneRow): number | null {
  if (s.last_month.days_with_data === 0) return null;
  return s.last_month.scale_metric === "spend" ? s.last_month.spend : s.last_month.revenue;
}

/** Dutch-Excel friendly: comma decimal separator, no thousands grouping. */
function num(n: number | null, digits = 2): string {
  if (n == null || !isFinite(n)) return "";
  return n.toFixed(digits).replace(".", ",");
}

export function InvoiceMonthTable({
  hub,
  filters,
  onStoreClick,
}: {
  hub: HubResponse;
  filters: HubFilters;
  onStoreClick?: (orgId: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "revenue",
    dir: "desc",
  });
  const [copied, setCopied] = useState(false);

  const month = hub.meta.last_completed_month ?? hub.stores[0]?.last_month.month ?? "";
  const rows = useMemo(() => filterForInvoice(hub.stores, filters), [hub.stores, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (s: StoreZoneRow): string | number => {
      switch (sort.key) {
        case "store":
          return s.store_name.toLowerCase();
        case "buyer":
          return (s.media_buyer ?? "zzz").toLowerCase();
        case "spend":
          return s.last_month.days_with_data === 0 ? -1 : s.last_month.spend;
        case "revenue":
          return s.last_month.days_with_data === 0 ? -1 : s.last_month.revenue;
        case "roas":
          return s.last_month.roas ?? -1;
        case "basis":
          return basisOf(s) ?? -1;
        case "zone":
          return s.last_month.zone ? ZONE_ORDER[s.last_month.zone] : 9;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return (va - vb) * dir;
    });
  }, [rows, sort]);

  /** Totals per currency — mixing EUR, USD, CHF and GBP into one number is
   *  the one thing this table may never do. */
  const totals = useMemo(() => {
    const map = new Map<string, { spend: number; revenue: number; stores: number }>();
    for (const s of rows) {
      if (s.last_month.days_with_data === 0) continue;
      const cur = s.currency ?? "EUR";
      const t = map.get(cur) ?? { spend: 0, revenue: 0, stores: 0 };
      t.spend += s.last_month.spend;
      t.revenue += s.last_month.revenue;
      t.stores += 1;
      map.set(cur, t);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].revenue - a[1].revenue);
  }, [rows]);

  /** Newest day of the invoiced month we hold anywhere, and who is short. */
  const measuredThrough = useMemo(() => {
    let max = "";
    for (const s of rows) {
      const m = s.last_month.measured_through;
      if (m && m > max) max = m;
    }
    return max || null;
  }, [rows]);
  /** Days missing INSIDE the period the store ran. The only shortfall that
   *  means something is wrong — a short month at either end is the store
   *  being onboarded or offboarded, which is what invoicing is for. */
  const gappy = useMemo(() => rows.filter((s) => s.last_month.gap_days > 0), [rows]);
  const partial = useMemo(
    () =>
      rows.filter(
        (s) =>
          s.last_month.gap_days === 0 &&
          s.last_month.days_with_data > 0 &&
          s.last_month.days_with_data < s.last_month.days_in_month
      ),
    [rows]
  );
  const noData = useMemo(() => rows.filter((s) => s.last_month.days_with_data === 0), [rows]);
  /** Stores that spent in the month but were never configured, so the zone
   *  engine cannot place them. They are not in `rows` and would otherwise
   *  vanish from the invoice run without a word. */
  const unconfiguredWithSpend = useMemo(
    () => hub.stores.filter((s) => !s.configured && s.last_month.days_with_data > 0 && s.last_month.spend > 0),
    [hub.stores]
  );

  const HEADERS = [
    "Store",
    "Media buyer",
    "Currency",
    "Model",
    "Spend",
    "Revenue",
    "ROAS",
    "Invoice ROAS",
    "Invoice basis",
    "Monthly floor",
    "Zone",
    "Ran from",
    "Ran through",
    "Days with data",
    "Days missing in between",
  ];

  const bodyRows = (): string[][] =>
    sorted.map((s) => {
      const lm = s.last_month;
      const has = lm.days_with_data > 0;
      return [
        s.store_name,
        s.media_buyer ?? "",
        s.currency ?? "",
        lm.scale_metric === "spend" ? "spend fee" : "revenue fee",
        has ? num(lm.spend) : "",
        has ? num(lm.revenue) : "",
        num(lm.roas),
        num(s.invoice_roas),
        num(basisOf(s)),
        num(lm.scale_target),
        lm.zone ?? "",
        lm.measured_from ?? "",
        lm.measured_through ?? "",
        `${lm.days_with_data}`,
        `${lm.gap_days}`,
      ];
    });

  const download = () => {
    // Semicolon-delimited with comma decimals: opens as columns in a
    // Dutch-locale Excel, which is where these figures are headed.
    const lines = [HEADERS, ...bodyRows()].map((r) =>
      r.map((c) => (c.includes(";") || c.includes('"') ? `"${c.replace(/"/g, '""')}"` : c)).join(";")
    );
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pinformance-invoice-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = async () => {
    const text = [HEADERS, ...bodyRows()].map((r) => r.join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the CSV button still works */
    }
  };

  const sortBy = (key: SortKey) =>
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "store" || key === "buyer" ? "asc" : "desc" }
    );

  const Th = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => (
    <th
      className={cn(
        "px-2 py-2 font-medium cursor-pointer select-none hover:text-foreground whitespace-nowrap",
        align === "right" ? "text-right" : "text-left",
        sort.key === k && "text-foreground"
      )}
      onClick={() => sortBy(k)}
    >
      {children}
      {sort.key === k && <span className="ml-1">{sort.dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-lg font-semibold">Invoice basis — {fmtMonthKeyLong(month)}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {rows.length} {rows.length === 1 ? "store" : "stores"}
            {measuredThrough && <> · measured through {measuredThrough}</>} · amounts in each
            store&apos;s own currency, never converted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {(gappy.length > 0 || noData.length > 0 || unconfiguredWithSpend.length > 0) && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          {gappy.length > 0 && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>
                {gappy.length} store{gappy.length === 1 ? "" : "s"} with days missing inside the
                period they ran:{" "}
                {gappy
                  .map((s) => `${s.store_name} (${s.last_month.gap_days}d)`)
                  .join(", ")}
                . Those amounts are short by whatever ran on the missing days.
              </span>
            </div>
          )}
          {noData.length > 0 && (
            <div>
              {noData.length} store{noData.length === 1 ? "" : "s"} have no snapshots for this
              month at all — shown as dashes, not as zero.
            </div>
          )}
          {unconfiguredWithSpend.length > 0 && (
            <div>
              {unconfiguredWithSpend.length} store{unconfiguredWithSpend.length === 1 ? "" : "s"}{" "}
              spent this month but {unconfiguredWithSpend.length === 1 ? "is" : "are"} not
              configured, so {unconfiguredWithSpend.length === 1 ? "it is" : "they are"} not
              listed: {unconfiguredWithSpend.map((s) => s.store_name).join(", ")}.
            </div>
          )}
        </div>
      )}
      {partial.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          {partial.length} store{partial.length === 1 ? "" : "s"} ran only part of{" "}
          {fmtMonthKeyLong(month)} — onboarded or offboarded mid-month. Their period is in the
          Ran column; the amounts are complete for the days they ran.
        </p>
      )}

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
              <Th k="store">Store</Th>
              <Th k="buyer">Buyer</Th>
              <Th k="spend" align="right">Spend</Th>
              <Th k="revenue" align="right">Revenue</Th>
              <Th k="roas" align="right">ROAS</Th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Invoice ROAS</th>
              <Th k="basis" align="right">Invoice basis</Th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Monthly floor</th>
              <Th k="zone">Zone</Th>
              <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Ran</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const lm = s.last_month;
              const has = lm.days_with_data > 0;
              const shape = monthShape(s);
              const basis = basisOf(s);
              const clearsFloor = basis != null && lm.scale_target > 0 && basis >= lm.scale_target;
              return (
                <tr
                  key={s.org_id}
                  className={cn(
                    "border-b border-border/60 last:border-0",
                    onStoreClick && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => onStoreClick?.(s.org_id)}
                >
                  <td className="px-2 py-2">
                    <div className="font-medium truncate max-w-[220px]">{s.store_name}</div>
                    {!s.is_active && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        offboarded
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground whitespace-nowrap">
                    {s.media_buyer ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    {has ? fmtCurrency(lm.spend, s.currency ?? "EUR") : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    {has ? fmtCurrency(lm.revenue, s.currency ?? "EUR") : "—"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmtRoas(lm.roas)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                    {fmtRoas(s.invoice_roas)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap font-semibold">
                    {basis == null ? "—" : fmtCurrency(basis, s.currency ?? "EUR")}
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {lm.scale_metric === "spend" ? "spend fee" : "revenue fee"}
                    </div>
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right tabular-nums whitespace-nowrap",
                      basis == null
                        ? "text-muted-foreground"
                        : clearsFloor
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {fmtCurrency(lm.scale_target, s.currency ?? "EUR")}
                  </td>
                  <td className="px-2 py-2">
                    {lm.zone ? (
                      <span
                        className={cn(
                          "inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                          zoneBg[lm.zone]
                        )}
                      >
                        {zoneLabel[lm.zone]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-2 text-right whitespace-nowrap text-xs",
                      shape.kind === "gap"
                        ? "text-amber-600 dark:text-amber-400 font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    {shape.kind === "none" && "—"}
                    {shape.kind === "full" && "full month"}
                    {shape.kind === "partial" && shape.label}
                    {shape.kind === "gap" && (
                      <>
                        {shape.label}
                        <div className="text-[10px]">{shape.gapDays}d missing</div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No stores match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totals.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Totals per currency
          </div>
          <div className="flex flex-wrap gap-2">
            {totals.map(([cur, t]) => (
              <div key={cur} className="rounded-lg border border-border px-3 py-2 min-w-[160px]">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {cur} · {t.stores} {t.stores === 1 ? "store" : "stores"}
                </div>
                <div className="text-sm font-semibold tabular-nums mt-0.5">
                  {fmtCurrency(t.revenue, cur)}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  spend {fmtCurrency(t.spend, cur)} · ROAS{" "}
                  {fmtRoas(t.spend > 0 ? t.revenue / t.spend : null)}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Never add these together — each is a different currency.
          </p>
        </div>
      )}
    </section>
  );
}
