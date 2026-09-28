"use client";

/**
 * Store Ranking — the delivery meeting on the dashboard. Same periods, same
 * rules and the same ON TRACK / OFF TRACK pills as the weekly deck; see
 * lib/media-buying/store-ranking.ts for the rules themselves.
 */
import { mediaBuyerOptions } from "@/lib/media-buying/config";
import type {
  StoreRankingPeriods,
  StoreRankingRow,
} from "@/lib/media-buying/store-ranking";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiResponse {
  periods: StoreRankingPeriods;
  stores: StoreRankingRow[];
}

const DAY = 24 * 3600 * 1000;
const addDays = (iso: string, n: number) =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);

function isoWeek(iso: string): number {
  // Thursday of this week decides which year the week belongs to.
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
}

function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function fmtMoney(v: number, currency: string | null): string {
  const symbol =
    currency === "EUR" ? "€" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency ? `${currency} ` : "";
  return `${symbol}${Math.round(v).toLocaleString("en-US")}`;
}

function fmtRoas(v: number | null): string {
  return v == null ? "—" : v.toFixed(2);
}

/** A store that spent nothing in either week or this month is not running,
 *  and counting it as off track would put it on the list of stores a buyer
 *  has to explain. It is named underneath instead. */
const running = (s: StoreRankingRow) =>
  s.week.spend > 0 || s.prev_week.spend > 0 || s.month.spend > 0;

/** How far the month is from its targets — sorts the worst to the top. */
function monthScore(s: StoreRankingRow): number {
  const roas = s.month.roas != null && s.roas_target ? s.month.roas / s.roas_target : 0;
  const vol = s.month.volume_target > 0 ? s.month.volume / s.month.volume_target : 0;
  return Math.min(roas, vol);
}

export default function StoreRankingPage() {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("all");
  const [dept, setDept] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Cancel an in-flight fetch when the week changes, or a slower earlier
    // answer lands after the newer one and overwrites it.
    const abort = new AbortController();
    const qs = week ? `?week=${week}` : "";
    fetch(`/api/media-buying/store-ranking${qs}`, { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as ApiResponse))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(typeof e === "string" ? e : String(e));
      })
      .finally(() => setLoading(false));
    return () => abort.abort();
  }, [week]);

  const buyers = useMemo(
    () => mediaBuyerOptions(data?.stores.map((s) => s.media_buyer) ?? []),
    [data]
  );
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const s of data?.stores ?? []) if (s.department) set.add(s.department);
    return Array.from(set).sort();
  }, [data]);

  const inFilter = useMemo(
    () =>
      (data?.stores ?? []).filter(
        (s) =>
          (buyer === "all" || s.media_buyer === buyer) &&
          (dept === "all" || s.department === dept)
      ),
    [data, buyer, dept]
  );
  const filtered = useMemo(() => inFilter.filter(running), [inFilter]);
  const idle = useMemo(() => inFilter.filter((s) => !running(s)), [inFilter]);
  const offTrack = useMemo(
    () => filtered.filter((s) => !s.month.on_track).sort((a, b) => monthScore(a) - monthScore(b)),
    [filtered]
  );
  const onTrack = useMemo(
    () => filtered.filter((s) => s.month.on_track).sort((a, b) => monthScore(b) - monthScore(a)),
    [filtered]
  );
  const weekOnTrack = filtered.filter((s) => s.week.on_track).length;

  const p = data?.periods;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Store Ranking</h1>
          {p && (
            <p className="mt-1 text-sm text-muted-foreground">
              Week {isoWeek(p.week_start)} ({fmtDay(p.week_start)} – {fmtDay(p.week_end)}) vs week{" "}
              {isoWeek(p.prev_week_start)} · month to date {fmtDay(p.month_start)} – {fmtDay(p.month_end)}
              {p.latest && " (today and yesterday are left out: their numbers are still coming in)"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex items-center rounded-md border border-border bg-background">
            <button
              type="button"
              onClick={() => p && setWeek(addDays(p.week_start, -7))}
              className="px-2 py-1.5 hover:bg-muted/40"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-medium tabular-nums">{p ? `Week ${isoWeek(p.week_start)}` : "…"}</span>
            <button
              type="button"
              onClick={() => p && setWeek(p.latest ? null : addDays(p.week_start, 7))}
              disabled={!p || p.latest}
              className="px-2 py-1.5 hover:bg-muted/40 disabled:opacity-30"
              aria-label="Next week"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
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
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      )}

      {!loading && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <GoalCard
              label="This month"
              value={`${onTrack.length} / ${filtered.length}`}
              caption="stores on track month to date"
            />
            <GoalCard
              label={`Week ${isoWeek(data.periods.week_start)}`}
              value={`${weekOnTrack} / ${filtered.length}`}
              caption="stores on track this week"
            />
          </div>
          <Section kind="off" stores={offTrack} />
          <Section kind="on" stores={onTrack} />
          {idle.length > 0 && (
            <p className="text-xs text-muted-foreground">
              No spend in this period: {idle.map((s) => s.store_name).join(", ")}.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Week on track = ROAS ≥ invoice ROAS and revenue ≥ the weekly floor (€5,000; spend accounts
            €1,726 spend), converted at the latest ECB rate. Month on track = ROAS MTD ≥ invoice ROAS and
            revenue MTD ≥ that floor × days / 7. The week&apos;s target is the floor: the target a buyer
            agreed in the Weekly Store Log is not in the dashboard, and below the floor is off track either way.
          </p>
        </>
      )}
    </div>
  );
}

function GoalCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
      <div className="text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

function Section({ kind, stores }: { kind: "on" | "off"; stores: StoreRankingRow[] }) {
  const on = kind === "on";
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-3">
        <span className={cn("text-2xl font-bold", on ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
          {on ? "On track" : "Off track"}
        </span>
        <span className="text-base font-semibold text-muted-foreground">
          {stores.length} {stores.length === 1 ? "store" : "stores"}
        </span>
      </h2>
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide">
              <th colSpan={2} />
              <th colSpan={2} className="py-1.5 font-semibold border-t-2 border-red-600 bg-muted/40">Week</th>
              <th className="w-px bg-border" />
              <th colSpan={2} className="py-1.5 font-semibold border-t-2 border-red-600 bg-muted/40">Month</th>
            </tr>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pl-4 pr-2 font-medium">Store</th>
              <th className="py-2 px-2 font-medium">Buyer</th>
              <th className="py-2 px-2 font-medium normal-case">
                <span className="uppercase">ROAS</span> last → this (target = invoice)
              </th>
              <th className="py-2 px-2 font-medium normal-case">
                <span className="uppercase">Revenue</span> actual / target
              </th>
              <th className="w-px bg-border" />
              <th className="py-2 px-2 font-medium">Revenue MTD</th>
              <th className="py-2 px-2 font-medium">ROAS MTD / target</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-xs text-muted-foreground">
                  No stores.
                </td>
              </tr>
            )}
            {stores.map((s) => (
              <Row key={s.org_id} s={s} on={on} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ s, on }: { s: StoreRankingRow; on: boolean }) {
  const cur = s.currency;
  const up =
    s.week.roas != null && s.prev_week.roas != null
      ? s.week.roas > s.prev_week.roas
        ? true
        : s.week.roas < s.prev_week.roas
        ? false
        : null
      : null;
  return (
    <tr className="border-b border-border/40 last:border-b-0 even:bg-muted/20">
      <td className={cn("py-2.5 pl-4 pr-2 border-l-4", on ? "border-l-emerald-600" : "border-l-red-600")}>
        <span className="font-semibold">{s.store_name}</span>
      </td>
      <td className="py-2.5 px-2 text-muted-foreground capitalize">{s.media_buyer ?? "—"}</td>
      <td className="py-2.5 px-2">
        <Cell pill={s.week.roas_on_track}>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="text-muted-foreground">{fmtRoas(s.prev_week.roas)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="font-semibold">{fmtRoas(s.week.roas)}</span>
            {up === true && <span className="text-emerald-600 text-xs">▲</span>}
            {up === false && <span className="text-red-600 text-xs">▼</span>}
            <span className="text-xs text-muted-foreground">/ {fmtRoas(s.roas_target)}</span>
          </span>
        </Cell>
      </td>
      <td className="py-2.5 px-2">
        <Cell pill={s.week.volume_on_track}>
          <span className="tabular-nums">
            <span className="font-semibold">{fmtMoney(s.week.volume, cur)}</span>
            <span className="text-xs text-muted-foreground"> / {fmtMoney(s.week.volume_target, cur)}</span>
            {s.spend_account && <span className="text-xs text-muted-foreground"> spend</span>}
          </span>
        </Cell>
      </td>
      <td className="w-px bg-border" />
      <td className="py-2.5 px-2">
        <Cell pill={s.month.volume_on_track}>
          <span className="tabular-nums" title={`Target so far: ${fmtMoney(s.month.volume_target, cur)}`}>
            <span className="font-semibold">{fmtMoney(s.month.volume, cur)}</span>
            {s.spend_account && <span className="text-xs text-muted-foreground"> spend</span>}
          </span>
        </Cell>
      </td>
      <td className="py-2.5 px-2">
        <Cell pill={s.month.roas_on_track}>
          <span className="tabular-nums">
            <span className="font-semibold">{fmtRoas(s.month.roas)}</span>
            <span className="text-xs text-muted-foreground"> / {fmtRoas(s.roas_target)}</span>
          </span>
        </Cell>
      </td>
    </tr>
  );
}

function Cell({ pill, children }: { pill: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      {children}
      <TrackPill on={pill} />
    </div>
  );
}

function TrackPill({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white",
        on ? "bg-emerald-600" : "bg-red-600"
      )}
    >
      {on ? "On track" : "Off track"}
    </span>
  );
}
