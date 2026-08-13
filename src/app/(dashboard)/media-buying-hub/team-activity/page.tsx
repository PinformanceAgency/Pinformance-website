"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowUpDown, Rocket, Pause, Layers, DollarSign, CalendarClock, LayoutGrid, ImageIcon } from "lucide-react";
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
          <PaidTable data={data} />
          <OrganicTable data={data} />
        </>
      )}
    </div>
  );
}

type SortDir = "asc" | "desc";

/* ═══ Paid ═══════════════════════════════════════════════════════════════ */

type PaidKey = "store" | "buyer" | "launched" | "paused" | "ads_paused" | "budget_changed" | "active_days";

function PaidTable({ data }: { data: TeamActivityResponse }) {
  const [buyer, setBuyer] = useState("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortKey, setSortKey] = useState<PaidKey>("launched");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const cw = data.weeks[data.weeks.length - 1];
  const pw = data.weeks[data.weeks.length - 2] ?? null;

  const rows = useMemo(() => {
    const m = new Map<string, StoreWeekRow>();
    for (const r of data.per_store) m.set(`${r.org_id}::${r.week_start}`, r);
    return data.stores.map((s) => {
      const c = m.get(`${s.org_id}::${cw}`);
      const p = pw ? m.get(`${s.org_id}::${pw}`) : undefined;
      return {
        org_id: s.org_id,
        store_name: s.store_name,
        buyer: s.media_buyer,
        launched: c?.launched ?? 0,
        paused: c?.paused ?? 0,
        ads_paused: c?.ads_paused ?? 0,
        budget_changed: c?.budget_changed ?? 0,
        active_days: c?.active_days ?? 0,
        launched_d: (c?.launched ?? 0) - (p?.launched ?? 0),
        paused_d: (c?.paused ?? 0) - (p?.paused ?? 0),
        ads_paused_d: (c?.ads_paused ?? 0) - (p?.ads_paused ?? 0),
        budget_changed_d: (c?.budget_changed ?? 0) - (p?.budget_changed ?? 0),
        active_days_d: (c?.active_days ?? 0) - (p?.active_days ?? 0),
      };
    });
  }, [data.per_store, data.stores, cw, pw]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (buyer !== "all" && r.buyer !== buyer) return false;
        if (onlyActive && r.launched === 0 && r.paused === 0 && r.ads_paused === 0 && r.budget_changed === 0) return false;
        return true;
      }),
    [rows, buyer, onlyActive]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const v = (r: typeof a): string | number => {
        switch (sortKey) {
          case "store": return r.store_name.toLowerCase();
          case "buyer": return r.buyer.toLowerCase();
          case "launched": return r.launched;
          case "paused": return r.paused;
          case "ads_paused": return r.ads_paused;
          case "budget_changed": return r.budget_changed;
          case "active_days": return r.active_days;
        }
      };
      const av = v(a), bv = v(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    const t = { launched: 0, paused: 0, ads_paused: 0, budget_changed: 0 };
    for (const r of filtered) {
      t.launched += r.launched;
      t.paused += r.paused;
      t.ads_paused += r.ads_paused;
      t.budget_changed += r.budget_changed;
    }
    return t;
  }, [filtered]);

  function toggle(k: PaidKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "store" || k === "buyer" ? "asc" : "desc"); }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <SectionHeader
        title="Paid Ads — per store (last 7 days)"
        description="What each buyer touched in the ad account per store. Ads paused only counts ads whose parent campaign is currently still active — so byproducts of pausing a whole campaign don't drown the creative-optimization signal. Active days = distinct days with any paid action (best proxy for how often the buyer touched this account — Pinterest doesn't expose login history)."
        buyers={data.buyers}
        buyer={buyer}
        onBuyer={setBuyer}
        onlyActive={onlyActive}
        onOnlyActive={setOnlyActive}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <TotalPill icon={Rocket}       label="Launched"      value={totals.launched}       color="#10b981" />
        <TotalPill icon={Pause}        label="Paused"        value={totals.paused}         color="#ef4444" />
        <TotalPill icon={Layers}       label="Ads paused"    value={totals.ads_paused}     color="#f97316" />
        <TotalPill icon={DollarSign}   label="Budget edits"  value={totals.budget_changed} color="#0ea5e9" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <PaidHeader label="Store"        k="store"          sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" />
              <PaidHeader label="Buyer"        k="buyer"          sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" />
              <PaidHeader label="Launched"     k="launched"       sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <PaidHeader label="Paused"       k="paused"         sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <PaidHeader label="Ads paused"   k="ads_paused"     sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <PaidHeader label="Budget edits" k="budget_changed" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <PaidHeader label="Active days"  k="active_days"    sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
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
                <NumCell value={r.launched}       delta={r.launched_d} />
                <NumCell value={r.paused}         delta={r.paused_d} />
                <NumCell value={r.ads_paused}     delta={r.ads_paused_d} />
                <NumCell value={r.budget_changed} delta={r.budget_changed_d} />
                <ActiveDaysCell days={r.active_days} delta={r.active_days_d} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing {sorted.length} of {data.stores.length} stores. Deltas compare vs the prior 7-day window.
      </div>
    </section>
  );
}

/* ═══ Organic ════════════════════════════════════════════════════════════ */

type OrgKey = "store" | "buyer" | "boards" | "pins" | "total";

function OrganicTable({ data }: { data: TeamActivityResponse }) {
  const [buyer, setBuyer] = useState("all");
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortKey, setSortKey] = useState<OrgKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const cw = data.weeks[data.weeks.length - 1];
  const pw = data.weeks[data.weeks.length - 2] ?? null;

  const rows = useMemo(() => {
    const m = new Map<string, StoreWeekRow>();
    for (const r of data.per_store) m.set(`${r.org_id}::${r.week_start}`, r);
    return data.stores.map((s) => {
      const c = m.get(`${s.org_id}::${cw}`);
      const p = pw ? m.get(`${s.org_id}::${pw}`) : undefined;
      return {
        org_id: s.org_id,
        store_name: s.store_name,
        buyer: s.media_buyer,
        boards: c?.boards_created ?? 0,
        pins: c?.pins_added ?? 0,
        boards_d: (c?.boards_created ?? 0) - (p?.boards_created ?? 0),
        pins_d: (c?.pins_added ?? 0) - (p?.pins_added ?? 0),
        total: (c?.boards_created ?? 0) + (c?.pins_added ?? 0),
      };
    });
  }, [data.per_store, data.stores, cw, pw]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (buyer !== "all" && r.buyer !== buyer) return false;
        if (onlyActive && r.total === 0) return false;
        return true;
      }),
    [rows, buyer, onlyActive]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const v = (r: typeof a): string | number => {
        switch (sortKey) {
          case "store": return r.store_name.toLowerCase();
          case "buyer": return r.buyer.toLowerCase();
          case "boards": return r.boards;
          case "pins": return r.pins;
          case "total": return r.total;
        }
      };
      const av = v(a), bv = v(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    let b = 0, p = 0;
    for (const r of filtered) { b += r.boards; p += r.pins; }
    return { boards: b, pins: p };
  }, [filtered]);

  function toggle(k: OrgKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "store" || k === "buyer" ? "asc" : "desc"); }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <SectionHeader
        title="Organic — per store (last 7 days)"
        description="Boards and pins added via the dashboard. Boards = new rows in the boards table with created_at in the window. Pins = new rows in the pins table (approved, scheduled, posted, whatever status)."
        buyers={data.buyers}
        buyer={buyer}
        onBuyer={setBuyer}
        onlyActive={onlyActive}
        onOnlyActive={setOnlyActive}
      />

      <div className="grid grid-cols-2 gap-3">
        <TotalPill icon={LayoutGrid} label="Boards" value={totals.boards} color="#8b5cf6" />
        <TotalPill icon={ImageIcon}  label="Pins"   value={totals.pins}   color="#f59e0b" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <OrgHeader label="Store"  k="store"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" />
              <OrgHeader label="Buyer"  k="buyer"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} align="left" />
              <OrgHeader label="Boards" k="boards" sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <OrgHeader label="Pins"   k="pins"   sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <OrgHeader label="Total"  k="total"  sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
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
                <NumCell value={r.boards} delta={r.boards_d} />
                <NumCell value={r.pins}   delta={r.pins_d} />
                <td className="py-2 pr-2 text-right tabular-nums font-semibold">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Showing {sorted.length} of {data.stores.length} stores. Deltas compare vs the prior 7-day window.
      </div>
    </section>
  );
}

/* ═══ Shared bits ════════════════════════════════════════════════════════ */

function SectionHeader({
  title, description, buyers, buyer, onBuyer, onlyActive, onOnlyActive,
}: {
  title: string;
  description: string;
  buyers: string[];
  buyer: string;
  onBuyer: (v: string) => void;
  onlyActive: boolean;
  onOnlyActive: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={buyer}
          onChange={(e) => onBuyer(e.target.value)}
          className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-xs font-medium"
        >
          <option value="all">All buyers</option>
          {buyers.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value="(unassigned)">(unassigned)</option>
        </select>
        <label className="text-xs font-medium inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-background border border-border rounded-lg cursor-pointer">
          <input type="checkbox" checked={onlyActive} onChange={(e) => onOnlyActive(e.target.checked)} className="w-3.5 h-3.5" />
          Only stores with activity
        </label>
      </div>
    </div>
  );
}

function TotalPill({
  icon: Icon, label, value, color,
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

function PaidHeader(props: { label: string; k: PaidKey; sortKey: PaidKey; sortDir: SortDir; onSort: (k: PaidKey) => void; align?: "left" | "right"; }) {
  const active = props.k === props.sortKey;
  return (
    <th className={cn("py-2 font-medium select-none", (props.align ?? "right") === "right" ? "text-right pr-2" : "text-left")}>
      <button type="button" onClick={() => props.onSort(props.k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {props.label}
        <ArrowUpDown className={cn("w-3 h-3 opacity-40", active && "opacity-100", active && props.sortDir === "asc" && "rotate-180")} />
      </button>
    </th>
  );
}

function OrgHeader(props: { label: string; k: OrgKey; sortKey: OrgKey; sortDir: SortDir; onSort: (k: OrgKey) => void; align?: "left" | "right"; }) {
  const active = props.k === props.sortKey;
  return (
    <th className={cn("py-2 font-medium select-none", (props.align ?? "right") === "right" ? "text-right pr-2" : "text-left")}>
      <button type="button" onClick={() => props.onSort(props.k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
        {props.label}
        <ArrowUpDown className={cn("w-3 h-3 opacity-40", active && "opacity-100", active && props.sortDir === "asc" && "rotate-180")} />
      </button>
    </th>
  );
}

function NumCell({ value, delta }: { value: number; delta: number }) {
  return (
    <td className="py-2 pr-2 text-right tabular-nums">
      <span className={cn("font-medium", value === 0 && "text-muted-foreground/60")}>{value}</span>{" "}
      {delta !== 0 && (
        <span className={cn("text-[11px]", delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
          {delta > 0 ? "+" : ""}{delta}
        </span>
      )}
    </td>
  );
}

/** Active-days rendered as X/7 with a matching visual bar, so 7/7 pops as
 *  "worked every day" and 1/7 immediately reads as "barely touched". */
function ActiveDaysCell({ days, delta }: { days: number; delta: number }) {
  const pct = Math.min(1, days / 7);
  const barColor = days >= 5 ? "#10b981" : days >= 3 ? "#f59e0b" : days > 0 ? "#ef4444" : "transparent";
  return (
    <td className="py-2 pr-2 text-right tabular-nums">
      <div className="inline-flex items-center gap-2 justify-end w-full">
        <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full" style={{ width: `${pct * 100}%`, backgroundColor: barColor }} />
        </div>
        <span className={cn("font-medium tabular-nums", days === 0 && "text-muted-foreground/60")}>
          {days}<span className="text-muted-foreground/60">/7</span>
        </span>
        {delta !== 0 && (
          <span className={cn("text-[11px]", delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
    </td>
  );
}
