"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Zone = "red" | "orange" | "green";

interface StoreRow {
  org_id: string;
  store_name: string;
  media_buyer: string | null;
  department: string | null;
  currency: string | null;
  zone: Zone | null;
  roas: number | null;
  spend: number;
  revenue: number;
  breakeven_roas: number | null;
  invoice_roas: number | null;
}

interface ApiResponse {
  days: number;
  stores: StoreRow[];
}

type SortDir = "worst_first" | "best_first";
type SortKey = "zone_roas" | "store" | "buyer" | "roas" | "spend" | "revenue";

const WINDOW_OPTIONS = [
  { days: 1, label: "Yesterday" },
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
];

export default function StoreRankingPage() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyerFilter, setBuyerFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [sortDir, setSortDir] = useState<SortDir>("worst_first");
  const [sortKey, setSortKey] = useState<SortKey>("zone_roas");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/media-buying/store-ranking?days=${days}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as ApiResponse))
      .catch((e) => setError(typeof e === "string" ? e : String(e)))
      .finally(() => setLoading(false));
  }, [days]);

  const buyers = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const s of data.stores) if (s.media_buyer) set.add(s.media_buyer);
    return Array.from(set).sort();
  }, [data]);

  const departments = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const s of data.stores) if (s.department) set.add(s.department);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.stores.filter((s) => {
      if (buyerFilter !== "all" && s.media_buyer !== buyerFilter) return false;
      if (deptFilter !== "all" && s.department !== deptFilter) return false;
      return true;
    });
  }, [data, buyerFilter, deptFilter]);

  // Zone-then-ROAS sort. Direction picks whether worst (red + low ROAS) or
  // best (green + high ROAS) sits at the top.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const zoneRank = (z: Zone | null): number => {
      // Higher = better. Unclassified (null) sits between red and orange
      // because it's usually "no spend, can't tell" — not-catastrophic.
      if (z === "red") return 0;
      if (z === null) return 1;
      if (z === "orange") return 2;
      return 3; // green
    };

    if (sortKey === "zone_roas") {
      // Primary: zone, Secondary: ROAS. Direction respects sortDir.
      const dir = sortDir === "worst_first" ? 1 : -1;
      arr.sort((a, b) => {
        const zoneCmp = (zoneRank(a.zone) - zoneRank(b.zone)) * dir;
        if (zoneCmp !== 0) return zoneCmp;
        // Within same zone: ASC roas for worst_first, DESC for best_first.
        const aRoas = a.roas ?? -1;
        const bRoas = b.roas ?? -1;
        return (aRoas - bRoas) * dir;
      });
    } else {
      // Column-specific sort with sortDir as direction.
      const dir = sortDir === "worst_first" ? 1 : -1;
      arr.sort((a, b) => {
        const get = (r: StoreRow): string | number => {
          switch (sortKey) {
            case "store": return r.store_name.toLowerCase();
            case "buyer": return (r.media_buyer ?? "").toLowerCase();
            case "roas": return r.roas ?? -1;
            case "spend": return r.spend;
            case "revenue": return r.revenue;
            default: return 0;
          }
        };
        const av = get(a);
        const bv = get(b);
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const buckets = { red: 0, orange: 0, green: 0, unclassified: 0 };
    for (const s of filtered) {
      if (s.zone === "red") buckets.red++;
      else if (s.zone === "orange") buckets.orange++;
      else if (s.zone === "green") buckets.green++;
      else buckets.unclassified++;
    }
    return buckets;
  }, [filtered]);

  function toggleColumnSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "worst_first" ? "best_first" : "worst_first");
    } else {
      setSortKey(k);
      // Sensible default per column
      setSortDir(k === "store" || k === "buyer" ? "worst_first" : "worst_first");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Store Ranking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan all live stores by zone and ROAS for a selectable window. Filter
          by buyer or department to focus on your own book.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filters */}
      <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
        {/* Time window */}
        <div>
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Window
          </div>
          <div className="inline-flex bg-muted rounded-lg p-1 flex-wrap">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  days === w.days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Buyer + department + sort direction */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Buyer
            </div>
            <select
              value={buyerFilter}
              onChange={(e) => setBuyerFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-medium"
            >
              <option value="all">All buyers</option>
              {buyers.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Department
            </div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-medium"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              Sort
            </div>
            <div className="inline-flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setSortDir("worst_first")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                  sortDir === "worst_first"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingDown className="w-3.5 h-3.5" /> Worst first
              </button>
              <button
                onClick={() => setSortDir("best_first")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors",
                  sortDir === "best_first"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Best first
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Zone totals */}
      {data && (
        <div className="grid grid-cols-4 gap-3">
          <ZoneTotalPill kind="red" count={totals.red} />
          <ZoneTotalPill kind="orange" count={totals.orange} />
          <ZoneTotalPill kind="green" count={totals.green} />
          <ZoneTotalPill kind="unclassified" count={totals.unclassified} />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      {/* Table */}
      {!loading && data && (
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground bg-muted/30">
                  <th className="py-2.5 px-4 font-medium w-10">#</th>
                  <ColHeader label="Store" k="store" sortKey={sortKey} onSort={toggleColumnSort} align="left" />
                  <ColHeader label="Buyer" k="buyer" sortKey={sortKey} onSort={toggleColumnSort} align="left" />
                  <th className="py-2.5 px-3 font-medium">Zone</th>
                  <ColHeader label="ROAS" k="roas" sortKey={sortKey} onSort={toggleColumnSort} />
                  <ColHeader label="Spend" k="spend" sortKey={sortKey} onSort={toggleColumnSort} />
                  <ColHeader label="Revenue" k="revenue" sortKey={sortKey} onSort={toggleColumnSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                      No stores match the current filter.
                    </td>
                  </tr>
                )}
                {sorted.map((s, i) => (
                  <tr key={s.org_id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 px-4 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium">
                      {s.store_name}
                      <span className="text-[11px] text-muted-foreground ml-1.5">
                        · BER {fmtRoas(s.breakeven_roas)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {s.media_buyer ?? "—"}
                      <span className="text-[11px] text-muted-foreground/70 ml-1">
                        {s.department ? `· ${s.department}` : ""}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <ZoneBadge zone={s.zone} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">
                      <span className={cn(roasColorClass(s.zone))}>{fmtRoas(s.roas)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                      {fmtMoney(s.spend, s.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                      {fmtMoney(s.revenue, s.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-muted-foreground px-4 py-2 border-t border-border">
            Showing {sorted.length} of {data.stores.length} configured stores.
            Window: {WINDOW_OPTIONS.find((w) => w.days === days)?.label ?? `${days}d`}.
          </div>
        </section>
      )}
    </div>
  );
}

function ColHeader({
  label, k, sortKey, onSort, align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = k === sortKey;
  return (
    <th className={cn("py-2.5 px-3 font-medium select-none", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("w-3 h-3 opacity-40", active && "opacity-100")} />
      </button>
    </th>
  );
}

function ZoneBadge({ zone }: { zone: Zone | null }) {
  const cfg = {
    red: { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400", label: "Red" },
    orange: { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400", label: "Orange" },
    green: { bg: "bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-400", label: "Green" },
  } as const;
  if (!zone) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
        No data
      </span>
    );
  }
  const c = cfg[zone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", c.bg, c.text)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", zone === "red" ? "bg-red-500" : zone === "orange" ? "bg-amber-500" : "bg-emerald-500")} />
      {c.label}
    </span>
  );
}

function ZoneTotalPill({ kind, count }: { kind: "red" | "orange" | "green" | "unclassified"; count: number }) {
  const cfg = {
    red: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-700 dark:text-red-400", label: "Red" },
    orange: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-700 dark:text-amber-400", label: "Orange" },
    green: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-400", label: "Green" },
    unclassified: { bg: "bg-muted border-border", text: "text-muted-foreground", label: "No data" },
  }[kind];
  return (
    <div className={cn("rounded-xl border p-3", cfg.bg)}>
      <div className={cn("text-[10px] font-medium uppercase tracking-wide", cfg.text)}>
        {cfg.label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{count}</div>
    </div>
  );
}

function roasColorClass(zone: Zone | null): string {
  if (zone === "red") return "text-red-600 dark:text-red-400";
  if (zone === "orange") return "text-amber-600 dark:text-amber-400";
  if (zone === "green") return "text-emerald-600 dark:text-emerald-400";
  return "text-muted-foreground";
}

function fmtRoas(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2) + "x";
}

function fmtMoney(v: number, currency: string | null): string {
  if (!v) return "—";
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "CHF" ? "CHF " : currency === "GBP" ? "£" : "";
  return `${symbol}${Math.round(v).toLocaleString("en-US")}`;
}
