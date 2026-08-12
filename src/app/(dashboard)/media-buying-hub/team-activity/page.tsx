"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus, Rocket, Pause, LayoutGrid, ImageIcon, ArrowUpDown } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import type {
  TeamActivityResponse,
  WeekBucket,
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
          What the team shipped in the last 7 days — campaigns launched and
          paused in the ad account, boards created and pins added on the
          organic side. Company totals at the top, per-store detail below so
          you can see exactly which stores each buyer touched.
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
          <ActivitySection
            title="Paid Ads Activity"
            description="Campaign-level changes only — new campaigns spun up vs campaigns turned off."
            weeks={data.weeks}
            buyers={data.buyers}
            series={[
              {
                key: "launched",
                label: "Campaigns launched",
                color: "#10b981",
                icon: Rocket,
                data: data.paid.launched,
              },
              {
                key: "paused",
                label: "Campaigns paused",
                color: "#ef4444",
                icon: Pause,
                data: data.paid.paused,
              },
            ]}
          />

          <ActivitySection
            title="Organic Activity"
            description="Boards created and pins added — the raw output flowing through the dashboard last 7 days."
            weeks={data.weeks}
            buyers={data.buyers}
            series={[
              {
                key: "boards",
                label: "Boards created",
                color: "#8b5cf6",
                icon: LayoutGrid,
                data: data.organic.boards_created,
              },
              {
                key: "pins",
                label: "Pins added",
                color: "#f59e0b",
                icon: ImageIcon,
                data: data.organic.pins_added,
              },
            ]}
          />

          <PerStoreTable data={data} />
        </>
      )}
    </div>
  );
}

interface Series {
  key: string;
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
  data: WeekBucket[];
}

function ActivitySection({
  title,
  description,
  weeks,
  series,
}: {
  title: string;
  description: string;
  weeks: string[];
  buyers: string[]; // kept in signature for callsite compat; unused here.
  series: Series[];
}) {
  const currentIdx = weeks.length - 1;
  const priorIdx = Math.max(0, currentIdx - 1);

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>

      {/* Big numbers last 7 days */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {series.map((s) => {
          const current = s.data[currentIdx]?.total ?? 0;
          const prior = s.data[priorIdx]?.total ?? 0;
          const delta = current - prior;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className="rounded-xl border border-border bg-background/50 p-4 flex items-center gap-4"
            >
              <div
                className="rounded-lg p-2.5 flex-shrink-0"
                style={{ backgroundColor: s.color + "22", color: s.color }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {s.label}
                </div>
                <div className="flex items-baseline gap-3 mt-0.5">
                  <span className="text-3xl font-semibold tabular-nums">{current}</span>
                  <DeltaBadge delta={delta} />
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  last 7 days · {prior} prior 7 days
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 8-week trend bar chart */}
      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Trailing 8 × 7-day windows
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={weeks.map((w, i) => {
                const row: Record<string, string | number> = { week: shortWeek(w) };
                for (const s of series) row[s.label] = s.data[i]?.total ?? 0;
                return row;
              })}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
              barCategoryGap="25%"
              barGap={4}
            >
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
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

    </section>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  const cls =
    delta > 0
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
      : delta < 0
      ? "text-red-600 dark:text-red-400 bg-red-500/10"
      : "text-muted-foreground bg-muted";
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="w-3 h-3" />
      {delta > 0 ? "+" : ""}
      {delta} vs prior 7d
    </span>
  );
}

/** "2026-08-05" → "Aug 5". */
function shortWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m} ${d.getUTCDate()}`;
}

type SortKey = "store" | "buyer" | "launched" | "paused" | "boards" | "pins" | "total";

/** Per-store table. One row per store, showing last 7 days's counts + delta vs
 *  last week for all four metrics. Filter by buyer, sort by any column,
 *  optional "only stores with activity last 7 days" toggle. */
function PerStoreTable({ data }: { data: TeamActivityResponse }) {
  const [buyerFilter, setBuyerFilter] = useState<string>("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const currentWeek = data.weeks[data.weeks.length - 1];
  const priorWeek = data.weeks[data.weeks.length - 2] ?? null;

  // Build a per-store view: last 7 days's row + prior week's row for each store.
  const rowsByOrg = useMemo(() => {
    const byOrgWeek = new Map<string, StoreWeekRow>();
    for (const r of data.per_store) {
      byOrgWeek.set(`${r.org_id}::${r.week_start}`, r);
    }
    return data.stores.map((s) => {
      const cur = byOrgWeek.get(`${s.org_id}::${currentWeek}`);
      const prev = priorWeek ? byOrgWeek.get(`${s.org_id}::${priorWeek}`) : undefined;
      return {
        org_id: s.org_id,
        store_name: s.store_name,
        buyer: s.media_buyer,
        launched: cur?.launched ?? 0,
        paused: cur?.paused ?? 0,
        boards_created: cur?.boards_created ?? 0,
        pins_added: cur?.pins_added ?? 0,
        launched_delta: (cur?.launched ?? 0) - (prev?.launched ?? 0),
        paused_delta: (cur?.paused ?? 0) - (prev?.paused ?? 0),
        boards_delta: (cur?.boards_created ?? 0) - (prev?.boards_created ?? 0),
        pins_delta: (cur?.pins_added ?? 0) - (prev?.pins_added ?? 0),
        total:
          (cur?.launched ?? 0) +
          (cur?.paused ?? 0) +
          (cur?.boards_created ?? 0) +
          (cur?.pins_added ?? 0),
      };
    });
  }, [data.per_store, data.stores, currentWeek, priorWeek]);

  const filtered = useMemo(() => {
    return rowsByOrg.filter((r) => {
      if (buyerFilter !== "all" && r.buyer !== buyerFilter) return false;
      if (onlyActive && r.total === 0) return false;
      return true;
    });
  }, [rowsByOrg, buyerFilter, onlyActive]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const getVal = (r: typeof a): string | number => {
        switch (sortKey) {
          case "store": return r.store_name.toLowerCase();
          case "buyer": return r.buyer.toLowerCase();
          case "launched": return r.launched;
          case "paused": return r.paused;
          case "boards": return r.boards_created;
          case "pins": return r.pins_added;
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

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "store" || k === "buyer" ? "asc" : "desc");
    }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Per store — last 7 days</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {shortWeek(currentWeek)} → today. Numbers to the right show
            delta vs the prior 7 days so you can spot which stores got extra
            love (or none at all) this period.
          </p>
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <ColHeader label="Store" k="store" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <ColHeader label="Buyer" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <ColHeader label="Launched" k="launched" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label="Paused" k="paused" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label="Boards" k="boards" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label="Pins" k="pins" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <ColHeader label="Total" k="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
            {sorted.map((r) => (
              <tr key={r.org_id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/30">
                <td className="py-2 font-medium">{r.store_name}</td>
                <td className="py-2 text-muted-foreground">{r.buyer}</td>
                <NumCell value={r.launched} delta={r.launched_delta} />
                <NumCell value={r.paused} delta={r.paused_delta} />
                <NumCell value={r.boards_created} delta={r.boards_delta} />
                <NumCell value={r.pins_added} delta={r.pins_delta} />
                <td className="py-2 pr-2 text-right tabular-nums font-semibold">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing {sorted.length} of {data.stores.length} stores.
      </div>
    </section>
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
