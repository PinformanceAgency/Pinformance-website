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
  start: string;
  end: string;
  stores: StoreRow[];
}

type SortDir = "worst_first" | "best_first";
type SortKey = "zone_roas" | "store" | "roas" | "spend" | "revenue";

/** Default range: last 7 days ending yesterday. */
function defaultRange(): { start: string; end: string } {
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const end = y.toISOString().slice(0, 10);
  const start = new Date(y.getTime() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { start, end };
}

export default function StoreRankingPage() {
  const [{ start: startInit, end: endInit }] = useState(defaultRange);
  const [start, setStart] = useState(startInit);
  const [end, setEnd] = useState(endInit);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("all");
  const [dept, setDept] = useState("all");
  const [sortDir, setSortDir] = useState<SortDir>("worst_first");
  const [sortKey, setSortKey] = useState<SortKey>("zone_roas");

  useEffect(() => {
    if (start > end) return; // invalid range
    setLoading(true);
    setError(null);
    fetch(`/api/media-buying/store-ranking?start=${start}&end=${end}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as ApiResponse))
      .catch((e) => setError(typeof e === "string" ? e : String(e)))
      .finally(() => setLoading(false));
  }, [start, end]);

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
      if (buyer !== "all" && s.media_buyer !== buyer) return false;
      if (dept !== "all" && s.department !== dept) return false;
      return true;
    });
  }, [data, buyer, dept]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const zoneRank = (z: Zone | null): number => {
      if (z === "red") return 0;
      if (z === null) return 1;
      if (z === "orange") return 2;
      return 3;
    };
    const dir = sortDir === "worst_first" ? 1 : -1;
    if (sortKey === "zone_roas") {
      arr.sort((a, b) => {
        const zc = (zoneRank(a.zone) - zoneRank(b.zone)) * dir;
        if (zc !== 0) return zc;
        return ((a.roas ?? -1) - (b.roas ?? -1)) * dir;
      });
    } else {
      arr.sort((a, b) => {
        const get = (r: StoreRow): string | number => {
          switch (sortKey) {
            case "store": return r.store_name.toLowerCase();
            case "roas": return r.roas ?? -1;
            case "spend": return r.spend;
            case "revenue": return r.revenue;
            default: return 0;
          }
        };
        const av = get(a), bv = get(b);
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleColumnSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "worst_first" ? "best_first" : "worst_first");
    else setSortKey(k);
  }

  const invalidRange = start > end;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Store Ranking</h1>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter bar — everything on one line */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="px-2.5 py-1.5 bg-background border border-border rounded-md font-medium tabular-nums"
        />
        <span className="text-muted-foreground">→</span>
        <input
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="px-2.5 py-1.5 bg-background border border-border rounded-md font-medium tabular-nums"
        />
        {invalidRange && (
          <span className="text-red-600 dark:text-red-400 font-medium">
            End date must be after start.
          </span>
        )}
        <span className="flex-1" />
        <select
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          className="px-2 py-1.5 bg-background border border-border rounded-md font-medium"
        >
          <option value="all">All buyers</option>
          {buyers.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="px-2 py-1.5 bg-background border border-border rounded-md font-medium"
        >
          <option value="all">All depts</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={() => setSortDir(sortDir === "worst_first" ? "best_first" : "worst_first")}
          className="px-2 py-1.5 bg-background border border-border rounded-md font-medium inline-flex items-center gap-1"
          title={sortDir === "worst_first" ? "Sorting worst→best. Click to flip." : "Sorting best→worst. Click to flip."}
        >
          {sortDir === "worst_first"
            ? <><TrendingDown className="w-3 h-3" /> Worst first</>
            : <><TrendingUp className="w-3 h-3" /> Best first</>
          }
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}

      {/* Compact table — one line per store, zone as color dot */}
      {!loading && data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wide">
                  <ColHeader label="Store" k="store" sortKey={sortKey} onSort={toggleColumnSort} align="left" />
                  <th className="py-1.5 px-2 font-medium text-right">Buyer</th>
                  <ColHeader label="ROAS" k="roas" sortKey={sortKey} onSort={toggleColumnSort} />
                  <ColHeader label="Spend" k="spend" sortKey={sortKey} onSort={toggleColumnSort} />
                  <ColHeader label="Revenue" k="revenue" sortKey={sortKey} onSort={toggleColumnSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                      No stores match the current filter.
                    </td>
                  </tr>
                )}
                {sorted.map((s) => (
                  <tr key={s.org_id} className="border-b border-border/30 last:border-b-0 hover:bg-muted/20">
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-2">
                        <ZoneDot zone={s.zone} />
                        <span className="font-medium">{s.store_name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">
                      {s.media_buyer ?? "—"}
                    </td>
                    <td className={cn("py-1.5 px-2 text-right tabular-nums font-semibold", roasColor(s.zone))}>
                      {fmtRoas(s.roas)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {fmtMoney(s.spend, s.currency)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {fmtMoney(s.revenue, s.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-muted-foreground px-3 py-1.5 border-t border-border">
            {sorted.length}/{data.stores.length} stores · {data.start} → {data.end}
          </div>
        </div>
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
    <th className={cn("py-1.5 px-2 font-medium select-none", align === "right" ? "text-right" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        <ArrowUpDown className={cn("w-2.5 h-2.5 opacity-40", active && "opacity-100")} />
      </button>
    </th>
  );
}

function ZoneDot({ zone }: { zone: Zone | null }) {
  const cls =
    zone === "red" ? "bg-red-500"
    : zone === "orange" ? "bg-amber-500"
    : zone === "green" ? "bg-emerald-500"
    : "bg-muted-foreground/30";
  return <span className={cn("w-2 h-2 rounded-full flex-shrink-0", cls)} title={zone ?? "no data"} />;
}

function roasColor(zone: Zone | null): string {
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
