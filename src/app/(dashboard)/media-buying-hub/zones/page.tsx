"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useHubData } from "@/hooks/use-hub-data";
import {
  GlobalFilterBar,
  EMPTY_FILTERS,
  type HubFilters,
} from "@/components/media-buying/hub-panels";
import {
  ZoneBlocksSection,
  ZoneRangeSection,
  fmtRangeLabel,
  type RangeMeta,
} from "@/components/media-buying/hub-charts";
import { StoreDeepDive } from "@/components/media-buying/hub-store-deepdive";
import type { RangeZoneRow } from "@/lib/media-buying/zones";
import { cn } from "@/lib/utils";

type ZoneScope = "weekly" | "monthly" | "last-month" | "custom";

const SCOPE_LABELS: Record<ZoneScope, string> = {
  weekly: "Last 4 weeks",
  monthly: "This month",
  "last-month": "Last month",
  custom: "Custom range",
};

// ─── Date helpers ──────────────────────────────────────────────────────────
// All of these work in UTC, because snapshot_date is a plain UTC date and the
// zone engine buckets on it. Doing the arithmetic in local time puts someone
// in Amsterdam a day ahead of the data for the first two hours of every day.
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => isoOf(new Date());
const shiftIso = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
};
/** The Monday of the week `iso` falls in (Monday itself returns itself). */
const mondayOf = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return isoOf(d);
};
const monthStartOf = (iso: string) => `${iso.slice(0, 7)}-01`;
const lastMonthBounds = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return { from: isoOf(first), to: isoOf(last) };
};

interface Preset {
  label: string;
  bounds: () => { from: string; to: string };
}

// "Last 7 / 30 days" end YESTERDAY, like every other window in the hub, so the
// custom tab and the weekly buckets are answering about the same days. The
// two "to date" presets deliberately do include today — being able to look at
// this week so far is the reason this tab exists.
const PRESETS: Preset[] = [
  {
    label: "Week to date",
    bounds: () => ({ from: mondayOf(todayIso()), to: todayIso() }),
  },
  {
    label: "Month to date",
    bounds: () => ({ from: monthStartOf(todayIso()), to: todayIso() }),
  },
  {
    label: "Last 7 days",
    bounds: () => ({ from: shiftIso(todayIso(), -7), to: shiftIso(todayIso(), -1) }),
  },
  {
    label: "Last 30 days",
    bounds: () => ({ from: shiftIso(todayIso(), -30), to: shiftIso(todayIso(), -1) }),
  },
  { label: "Last month", bounds: () => lastMonthBounds(todayIso()) },
];

export default function ZonesPage() {
  const { hub, error } = useHubData();
  const [filters, setFilters] = useState<HubFilters>(EMPTY_FILTERS);
  const [scope, setScope] = useState<ZoneScope>("weekly");
  const [deepDiveOrgId, setDeepDiveOrgId] = useState<string | null>(null);
  const openStore = useCallback((orgId: string) => setDeepDiveOrgId(orgId), []);
  const closeStore = useCallback(() => setDeepDiveOrgId(null), []);

  // Custom range. The draft dates are what the inputs hold; `range` is what
  // came back from the server, so the numbers on screen always carry the
  // period they were actually computed for rather than the one being typed.
  const [draftFrom, setDraftFrom] = useState(() => mondayOf(todayIso()));
  const [draftTo, setDraftTo] = useState(() => todayIso());
  const [range, setRange] = useState<{ rows: RangeZoneRow[]; meta: RangeMeta } | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const loadRange = useCallback(async (from: string, to: string) => {
    setRangeLoading(true);
    setRangeError(null);
    try {
      const res = await fetch(
        `/api/media-buying/zones/range?from=${from}&to=${to}`
      );
      const data = await res.json();
      if (!res.ok) {
        setRangeError(data?.error ?? "Failed to load the range");
        return;
      }
      setRange({ rows: data.rows as RangeZoneRow[], meta: data.meta as RangeMeta });
    } catch (e) {
      setRangeError(String(e));
    } finally {
      setRangeLoading(false);
    }
  }, []);

  // First switch to the custom tab loads the default period (this week so
  // far); after that it only reloads when Apply or a preset is pressed.
  useEffect(() => {
    if (scope === "custom" && !range && !rangeLoading && !rangeError) {
      loadRange(draftFrom, draftTo);
    }
  }, [scope, range, rangeLoading, rangeError, draftFrom, draftTo, loadRange]);

  const applyPreset = (p: Preset) => {
    const { from, to } = p.bounds();
    setDraftFrom(from);
    setDraftTo(to);
    loadRange(from, to);
  };

  const invalidRange = draftFrom > draftTo || draftTo > todayIso();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Zones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Red / orange / green at company, department and media-buyer level.
          The last four weeks show short-term flips, this month shows who is on
          pace, last month is the finished month with its own numbers on every
          store, and a custom range answers any other period you need.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {!hub && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading hub…
        </div>
      )}

      {hub && (
        <>
          <GlobalFilterBar hub={hub} filters={filters} onChange={setFilters} />
          <div className="inline-flex bg-muted rounded-lg p-1">
            {(["weekly", "monthly", "last-month", "custom"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  scope === s
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {scope === "custom" && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    From
                  </span>
                  <input
                    type="date"
                    value={draftFrom}
                    max={draftTo}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    To
                  </span>
                  <input
                    type="date"
                    value={draftTo}
                    min={draftFrom}
                    max={todayIso()}
                    onChange={(e) => setDraftTo(e.target.value)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
                  />
                </label>
                <button
                  onClick={() => loadRange(draftFrom, draftTo)}
                  disabled={invalidRange || rangeLoading}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    invalidRange || rangeLoading
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-foreground text-background hover:opacity-90"
                  )}
                >
                  {rangeLoading ? "Loading…" : "Apply"}
                </button>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      disabled={rangeLoading}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Green needs ROAS ≥ invoice ROAS and enough scale, same as every
                other tab. The scale floor here is the <strong>weekly</strong>{" "}
                floor pro-rated over the days you picked (€5k revenue per week,
                or the spend floor for spend-fee stores), converted to each
                store&apos;s own currency — so a 7-day range lands on exactly
                the same colour as the weekly bucket for those days.
              </p>
              {range?.meta.includes_today && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  This range ends today, and today is still partial — snapshots
                  come in every six hours, so the last day is whatever Pinterest
                  had reported at the most recent run.
                </p>
              )}
            </div>
          )}

          {rangeError && scope === "custom" && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {rangeError}
            </div>
          )}

          {scope === "custom" ? (
            range ? (
              <>
                <div className="text-xs text-muted-foreground">
                  Showing {fmtRangeLabel(range.meta)} — {range.meta.days}{" "}
                  {range.meta.days === 1 ? "day" : "days"}.
                  {rangeLoading && " Refreshing…"}
                </div>
                <ZoneRangeSection
                  hub={hub}
                  filters={filters}
                  rows={range.rows}
                  meta={range.meta}
                  onStoreClick={openStore}
                />
              </>
            ) : (
              !rangeError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Computing the range…
                </div>
              )
            )
          ) : (
            <ZoneBlocksSection
              hub={hub}
              filters={filters}
              onStoreClick={openStore}
              mode={scope}
            />
          )}
        </>
      )}

      {hub && deepDiveOrgId && (
        <StoreDeepDive orgId={deepDiveOrgId} hub={hub} onClose={closeStore} />
      )}
    </div>
  );
}
