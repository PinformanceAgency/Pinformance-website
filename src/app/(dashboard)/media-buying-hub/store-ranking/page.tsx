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

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, TrendingDown, TrendingUp } from "lucide-react";
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

const yesterdayIso = () => addDays(new Date().toISOString().slice(0, 10), -1);

/** Default custom range: the last 30 days ending the day before yesterday —
 *  yesterday's numbers are still coming in. */
function defaultRange(): { from: string; to: string } {
  const to = addDays(new Date().toISOString().slice(0, 10), -2);
  return { from: addDays(to, -29), to };
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

type Period = StoreRankingRow["week"];

/** Off-track pills in a period: 2 = ROAS and volume both missed, 0 = both hit. */
const misses = (p: Period) => Number(!p.roas_on_track) + Number(!p.volume_on_track);

/** How close a period came to its targets, as a fraction: ROAS against the
 *  invoice ROAS and volume against the floor, added up. Lower is worse. */
function closeness(p: Period, roasTarget: number | null): number {
  const roas = p.roas != null && roasTarget ? p.roas / roasTarget : 0;
  const vol = p.volume_target > 0 ? p.volume / p.volume_target : 0;
  return roas + vol;
}

/**
 * Worst store first. In order, each deciding only when the one before ties:
 *   1. the month — both pills off, then one off, then both on;
 *   2. the week, on the same count;
 *   3. how far the month is from its targets (lowest ROAS and revenue first);
 *   4. the same for the week.
 * The month leads because that is what splits Off track from On track.
 */
function worstFirst(a: StoreRankingRow, b: StoreRankingRow): number {
  return (
    misses(b.month) - misses(a.month) ||
    misses(b.week) - misses(a.week) ||
    closeness(a.month, a.roas_target) - closeness(b.month, b.roas_target) ||
    closeness(a.week, a.roas_target) - closeness(b.week, b.roas_target) ||
    a.store_name.localeCompare(b.store_name)
  );
}

export default function StoreRankingPage() {
  const [week, setWeek] = useState<string | null>(null);
  const [mode, setMode] = useState<"week" | "range">("week");
  const [range, setRange] = useState(defaultRange);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyer, setBuyer] = useState("all");
  const [dept, setDept] = useState("all");
  const [order, setOrder] = useState<"worst" | "best">("worst");

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Cancel an in-flight fetch when the week changes, or a slower earlier
    // answer lands after the newer one and overwrites it.
    const abort = new AbortController();
    if (mode === "range" && (!range.from || !range.to || range.from > range.to)) {
      setLoading(false);
      return;
    }
    const qs =
      mode === "range" ? `?from=${range.from}&to=${range.to}` : week ? `?week=${week}` : "";
    fetch(`/api/media-buying/store-ranking${qs}`, { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(e.error))))
      .then((d) => setData(d as ApiResponse))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setError(typeof e === "string" ? e : String(e));
      })
      .finally(() => setLoading(false));
    return () => abort.abort();
  }, [week, mode, range]);

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
  const isRange = data?.periods.mode === "range";
  // Split on the month, as the deck does — in a custom range too: the range
  // only takes the place of the week.
  const sortFn = useCallback(
    (a: StoreRankingRow, b: StoreRankingRow) =>
      order === "worst" ? worstFirst(a, b) : worstFirst(b, a),
    [order]
  );
  const offTrack = useMemo(
    () => filtered.filter((s) => !s.month.on_track).sort(sortFn),
    [filtered, sortFn]
  );
  const onTrack = useMemo(
    () => filtered.filter((s) => s.month.on_track).sort(sortFn),
    [filtered, sortFn]
  );
  const weekOnTrack = filtered.filter((s) => s.week.on_track).length;

  const p = data?.periods;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Store Ranking</h1>
          {p && p.mode === "range" && (
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtDay(p.week_start)} – {fmtDay(p.week_end)} ({p.week_days} days) vs the {p.week_days} days
              before ({fmtDay(p.prev_week_start)} – {fmtDay(p.prev_week_end)}) · month to date{" "}
              {fmtDay(p.month_start)} – {fmtDay(p.month_end)} (today and yesterday are left out)
            </p>
          )}
          {p && p.mode === "week" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Week {isoWeek(p.week_start)} ({fmtDay(p.week_start)} – {fmtDay(p.week_end)}) vs week{" "}
              {isoWeek(p.prev_week_start)} · month to date {fmtDay(p.month_start)} – {fmtDay(p.month_end)}
              {p.latest && " (today and yesterday are left out: their numbers are still coming in)"}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-md border border-border bg-background overflow-hidden">
            {(["week", "range"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("px-2.5 py-1.5 font-medium", mode === m ? "bg-foreground text-background" : "hover:bg-muted/40")}
              >
                {m === "week" ? "Week + month" : "Custom range"}
              </button>
            ))}
          </div>
          {mode === "range" && (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="px-2 py-1 bg-background border border-border rounded-md font-medium tabular-nums"
                aria-label="From"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                max={yesterdayIso()}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="px-2 py-1 bg-background border border-border rounded-md font-medium tabular-nums"
                aria-label="To"
              />
            </div>
          )}
          {mode === "week" && (
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
          )}
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
            type="button"
            onClick={() => setOrder(order === "worst" ? "best" : "worst")}
            className="px-2 py-1.5 bg-background border border-border rounded-md font-medium inline-flex items-center gap-1"
            title="Worst first: both month pills off, then one, then the week, then the lowest ROAS and revenue against target. Click to flip."
          >
            {order === "worst" ? (
              <><TrendingDown className="w-3 h-3" /> Worst first</>
            ) : (
              <><TrendingUp className="w-3 h-3" /> Best first</>
            )}
          </button>
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
              label={
                isRange
                  ? `${fmtDay(data.periods.week_start)} – ${fmtDay(data.periods.week_end)}`
                  : `Week ${isoWeek(data.periods.week_start)}`
              }
              value={`${weekOnTrack} / ${filtered.length}`}
              caption={isRange ? "stores on track in this range" : "stores on track this week"}
            />
          </div>
          {order === "worst" ? (
            <>
              <Section kind="off" stores={offTrack} range={isRange} />
              <Section kind="on" stores={onTrack} range={isRange} />
            </>
          ) : (
            <>
              <Section kind="on" stores={onTrack} range={isRange} />
              <Section kind="off" stores={offTrack} range={isRange} />
            </>
          )}
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
            A custom range takes the place of the week and is judged like it: ROAS ≥ invoice ROAS and revenue ≥
            the weekly floor × days / 7, against the same number of days right before it. Month to date stays
            as it is and still decides On track / Off track.
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

function Section({ kind, stores, range }: { kind: "on" | "off"; stores: StoreRankingRow[]; range: boolean }) {
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
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide">
              <th colSpan={2} />
              <th colSpan={2} className="py-1.5 font-semibold border-t-2 border-red-600 bg-muted/40">
                {range ? "Range" : "Week"}
              </th>
              <th className="w-px bg-border" />
              <th colSpan={2} className="py-1.5 font-semibold border-t-2 border-red-600 bg-muted/40">Month</th>
            </tr>
            <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pl-4 pr-2 font-medium">Store</th>
              <th className="py-2 px-2 font-medium">Buyer</th>
              <th className="py-2 px-2 font-medium normal-case">
                <span className="uppercase">ROAS</span> {range ? "before" : "last"} → this (target = invoice)
              </th>
              <th className="py-2 px-2 font-medium normal-case">
                <span className="uppercase">Revenue</span> actual / target
              </th>
              <th className="w-px bg-border" />
              <th className="py-2 px-2 font-medium">ROAS MTD / target</th>
              <th className="py-2 px-2 font-medium">Revenue MTD</th>
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
  const prevVolume = s.spend_account ? s.prev_week.spend : s.prev_week.revenue;
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
            <span className="text-xs text-muted-foreground">/ {fmtRoas(s.roas_target)}</span>
            <Delta now={s.week.roas} before={s.prev_week.roas} />
          </span>
        </Cell>
      </td>
      <td className="py-2.5 px-2">
        <Cell pill={s.week.volume_on_track}>
          <span className="tabular-nums">
            <span className="font-semibold">{fmtMoney(s.week.volume, cur)}</span>
            <span className="text-xs text-muted-foreground"> / {fmtMoney(s.week.volume_target, cur)}</span>
            {s.spend_account && <span className="text-xs text-muted-foreground"> spend</span>}
            <Delta now={s.week.volume} before={prevVolume} />
          </span>
        </Cell>
      </td>
      <td className="w-px bg-border" />
      <td className="py-2.5 px-2">
        <Cell pill={s.month.roas_on_track}>
          <span className="tabular-nums">
            <span className="font-semibold">{fmtRoas(s.month.roas)}</span>
            <span className="text-xs text-muted-foreground"> / {fmtRoas(s.roas_target)}</span>
          </span>
        </Cell>
      </td>
      <td className="py-2.5 px-2">
        <Cell pill={s.month.volume_on_track}>
          <span className="tabular-nums" title={`Target so far: ${fmtMoney(s.month.volume_target, cur)}`}>
            <span className="font-semibold">{fmtMoney(s.month.volume, cur)}</span>
            {s.spend_account && <span className="text-xs text-muted-foreground"> spend</span>}
          </span>
        </Cell>
      </td>
    </tr>
  );
}

/** Change against the period before, in percent. Nothing when there is no
 *  "before" to compare with: +∞% against a week without revenue says nothing. */
function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now == null || before == null || before <= 0) return null;
  const pct = ((now - before) / before) * 100;
  const shown = Math.round(pct);
  const tone =
    shown > 0
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
      : shown < 0
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn("ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tone)}
      title="Change against the period before"
    >
      {shown > 0 ? "▲ +" : shown < 0 ? "▼ " : ""}
      {shown.toLocaleString("en-US")}%
    </span>
  );
}

function Cell({ pill, children }: { pill: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 whitespace-nowrap">
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
