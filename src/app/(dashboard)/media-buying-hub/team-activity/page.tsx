"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpDown, Rocket, Pause, LayoutGrid, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TeamActivityResponse,
  StoreWeekRow,
} from "@/lib/media-buying/team-activity";

export default function TeamActivityPage() {
  const [data, setData] = useState<TeamActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/team-activity")
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as TeamActivityResponse))
      .catch((e) => setError(typeof e === "string" ? e : String(e)));
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Team Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-store view of what each media buyer shipped in the last 7 days —
          split by paid (ad account) and organic (dashboard) work.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading team activity…
        </div>
      )}

      {data && (
        <>
          <PerStoreTable
            data={data}
            variant="paid"
            title="Paid Ads — per store (last 7 days)"
            description="Campaign-level changes. Launched = new campaigns whose start_time falls in the last 7 days. Paused = campaigns that transitioned ACTIVE→PAUSED during the period."
            icon1={Rocket}
            icon2={Pause}
            col1Label="Launched"
            col2Label="Paused"
            col1Color="#10b981"
            col2Color="#ef4444"
          />

          <PerStoreTable
            data={data}
            variant="organic"
            title="Organic — per store (last 7 days)"
            description="Boards and pins added via the dashboard. Boards = boards.created_at in the last 7 days. Pins = pins.created_at in the last 7 days."
            icon1={LayoutGrid}
            icon2={ImageIcon}
            col1Label="Boards"
            col2Label="Pins"
            col1Color="#8b5cf6"
            col2Color="#f59e0b"
          />
        </>
      )}
    </div>
  );
}

type SortKey = "store" | "buyer" | "col1" | "col2" | "total";
type Variant = "paid" | "organic";

function PerStoreTable({
  data,
  variant,
  title,
  description,
  icon1: Icon1,
  icon2: Icon2,
  col1Label,
  col2Label,
  col1Color,
  col2Color,
}: {
  data: TeamActivityResponse;
  variant: Variant;
  title: string;
  description: string;
  icon1: React.ComponentType<{ className?: string }>;
  icon2: React.ComponentType<{ className?: string }>;
  col1Label: string;
  col2Label: string;
  col1Color: string;
  col2Color: string;
}) {
  const [buyerFilter, setBuyerFilter] = useState<string>("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const currentWeek = data.weeks[data.weeks.length - 1];
  const priorWeek = data.weeks[data.weeks.length - 2] ?? null;

  // Pull the two relevant metrics per store based on the variant.
  const rows = useMemo(() => {
    const byOrgWeek = new Map<string, StoreWeekRow>();
    for (const r of data.per_store) byOrgWeek.set(`${r.org_id}::${r.week_start}`, r);
    return data.stores.map((s) => {
      const cur = byOrgWeek.get(`${s.org_id}::${currentWeek}`);
      const prev = priorWeek ? byOrgWeek.get(`${s.org_id}::${priorWeek}`) : undefined;
      const col1Cur = variant === "paid" ? cur?.launched ?? 0 : cur?.boards_created ?? 0;
      const col2Cur = variant === "paid" ? cur?.paused ?? 0 : cur?.pins_added ?? 0;
      const col1Prev = variant === "paid" ? prev?.launched ?? 0 : prev?.boards_created ?? 0;
      const col2Prev = variant === "paid" ? prev?.paused ?? 0 : prev?.pins_added ?? 0;
      return {
        org_id: s.org_id,
        store_name: s.store_name,
        buyer: s.media_buyer,
        col1: col1Cur,
        col2: col2Cur,
        col1_delta: col1Cur - col1Prev,
        col2_delta: col2Cur - col2Prev,
        total: col1Cur + col2Cur,
      };
    });
  }, [data.per_store, data.stores, currentWeek, priorWeek, variant]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (buyerFilter !== "all" && r.buyer !== buyerFilter) return false;
      if (onlyActive && r.total === 0) return false;
      return true;
    });
  }, [rows, buyerFilter, onlyActive]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const getVal = (r: typeof a): string | number => {
        switch (sortKey) {
          case "store": return r.store_name.toLowerCase();
          case "buyer": return r.buyer.toLowerCase();
          case "col1": return r.col1;
          case "col2": return r.col2;
          case "total": return r.total;
        }
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    let c1 = 0, c2 = 0;
    for (const r of filtered) { c1 += r.col1; c2 += r.col2; }
    return { c1, c2 };
  }, [filtered]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "store" || k === "buyer" ? "asc" : "desc");
    }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={buyerFilter}
            onChange={(e) => setBuyerFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-medium"
          >
            <option value="all">All buyers</option>
            {data.buyers.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            <option value="(unassigned)">(unassigned)</option>
          </select>
          <label className="text-xs font-medium inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-background border border-border rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Only stores with activity
          </label>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-2 gap-3">
        <TotalPill icon={Icon1} label={col1Label} value={totals.c1} color={col1Color} />
        <TotalPill icon={Icon2} label={col2Label} value={totals.c2} color={col2Color} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <ColHeader label="Store" k="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <ColHeader label="Buyer" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <ColHeader label={col1Label} k="col1" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label={col2Label} k="col2" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                  No stores match the current filter.
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.org_id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                <td className="py-2 font-medium">{r.store_name}</td>
                <td className="py-2 text-muted-foreground">{r.buyer}</td>
                <NumCell value={r.col1} delta={r.col1_delta} />
                <NumCell value={r.col2} delta={r.col2_delta} />
                <td className="py-2 pr-2 text-right tabular-nums font-semibold">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing {sorted.length} of {data.stores.length} stores. Deltas compare against the prior 7-day window.
      </div>
    </section>
  );
}

function TotalPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3 flex items-center gap-3">
      <div className="rounded-lg p-2 flex-shrink-0" style={{ backgroundColor: color + "22", color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Total {label.toLowerCase()}
        </div>
        <div className="text-xl font-semibold tabular-nums leading-tight mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function ColHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = k === sortKey;
  return (
    <th className={cn("py-2 font-medium select-none", align === "right" ? "text-right pr-2" : "text-left")}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "w-3 h-3 opacity-40",
            active && "opacity-100",
            active && sortDir === "asc" && "rotate-180"
          )}
        />
      </button>
    </th>
  );
}

function NumCell({ value, delta }: { value: number; delta: number }) {
  return (
    <td className="py-2 pr-2 text-right tabular-nums">
      <span className={cn("font-medium", value === 0 && "text-muted-foreground/60")}>
        {value}
      </span>{" "}
      {delta !== 0 && (
        <span
          className={cn(
            "text-[11px]",
            delta > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          )}
        >
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </td>
  );
}
