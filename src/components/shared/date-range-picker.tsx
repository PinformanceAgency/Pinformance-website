"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateRange = { start: string; end: string };

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "14", label: "Last 14 days", days: 14 },
  { key: "28", label: "Last 28 days", days: 28 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 365 days", days: 365 },
];

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function shiftDateIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function presetToRange(days: number): DateRange {
  const today = todayIso();
  if (days === 0) return { start: today, end: today };
  // "Last N days" = the N most recent complete days, ending yesterday.
  // Pinterest Campaign Manager uses the same convention (today is excluded
  // because reporting is still incomplete).
  const end = shiftDateIso(today, -1);
  const start = shiftDateIso(end, -(days - 1));
  return { start, end };
}

function matchesPreset(range: DateRange): string | null {
  for (const p of PRESETS) {
    const r = presetToRange(p.days);
    if (r.start === range.start && r.end === range.end) return p.key;
  }
  return null;
}

function formatRangeLabel(range: DateRange): string {
  const presetKey = matchesPreset(range);
  if (presetKey) {
    const p = PRESETS.find((x) => x.key === presetKey)!;
    return p.label;
  }
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  if (range.start === range.end) return fmt(range.start);
  return `${fmt(range.start)} – ${fmt(range.end)}`;
}

function formatSingleLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function buildCalendarGrid(year: number, month: number): Array<string | null> {
  const firstDayUtc = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstDayUtc.getUTCDay(); // 0=Sun
  const days = daysInMonth(year, month);
  const cells: Array<string | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    const iso = new Date(Date.UTC(year, month, d)).toISOString().split("T")[0];
    cells.push(iso);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface MonthCalendarProps {
  visibleYear: number;
  visibleMonth: number; // 0-11
  onPrev: () => void;
  onNext: () => void;
  rangeStart: string | null;
  rangeEnd: string | null;
  hoverDate: string | null;
  onHoverDate: (iso: string | null) => void;
  onPick: (iso: string) => void;
  today: string;
}

function MonthCalendar({
  visibleYear,
  visibleMonth,
  onPrev,
  onNext,
  rangeStart,
  rangeEnd,
  hoverDate,
  onHoverDate,
  onPick,
  today,
}: MonthCalendarProps) {
  const cells = useMemo(() => buildCalendarGrid(visibleYear, visibleMonth), [visibleYear, visibleMonth]);
  const monthLabel = new Date(Date.UTC(visibleYear, visibleMonth, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // Determine highlight range, honoring the currently hovered "second pick".
  const effectiveEnd =
    rangeStart && !rangeEnd && hoverDate && hoverDate > rangeStart ? hoverDate : rangeEnd;
  const effectiveStart =
    rangeStart && !rangeEnd && hoverDate && hoverDate < rangeStart ? hoverDate : rangeStart;
  const isInRange = (iso: string) =>
    !!(effectiveStart && effectiveEnd && iso >= effectiveStart && iso <= effectiveEnd);

  return (
    <div className="w-[280px]">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onPrev}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium">{monthLabel}</div>
        <button
          onClick={onNext}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-[11px] text-muted-foreground mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`empty-${i}`} className="h-8" />;
          const day = parseInt(iso.slice(-2), 10);
          const isStart = iso === rangeStart;
          const isEnd = iso === rangeEnd;
          const isSingle = rangeStart && rangeStart === rangeEnd && iso === rangeStart;
          const inRange = isInRange(iso);
          const isToday = iso === today;
          const isFuture = iso > today;
          return (
            <button
              key={iso}
              disabled={isFuture}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHoverDate(iso)}
              onMouseLeave={() => onHoverDate(null)}
              className={cn(
                "h-8 text-xs relative flex items-center justify-center transition-colors",
                isFuture
                  ? "text-muted-foreground/40 cursor-not-allowed"
                  : "hover:bg-primary/10",
                inRange && !isStart && !isEnd && "bg-primary/10",
                (isStart || isEnd || isSingle) && "bg-primary text-primary-foreground font-medium rounded-full",
                isToday && !isStart && !isEnd && !isSingle && "ring-1 ring-primary/60 rounded-full"
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  align?: "left" | "right";
}

export function DateRangePicker({ value, onChange, align = "right" }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ start: string | null; end: string | null }>({
    start: value.start,
    end: value.end,
  });
  const today = todayIso();
  const initialMonth = new Date(value.end + "T00:00:00Z");
  const [visibleYear, setVisibleYear] = useState(initialMonth.getUTCFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initialMonth.getUTCMonth());
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft({ start: value.start, end: value.end });
      const d = new Date(value.end + "T00:00:00Z");
      setVisibleYear(d.getUTCFullYear());
      setVisibleMonth(d.getUTCMonth());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickPreset(days: number) {
    const r = presetToRange(days);
    setDraft(r);
    onChange(r);
    setOpen(false);
  }

  function pickDate(iso: string) {
    if (!draft.start || (draft.start && draft.end)) {
      // Start a new range.
      setDraft({ start: iso, end: null });
      return;
    }
    // We have a start, no end yet — set end (swap if needed).
    if (iso < draft.start) {
      setDraft({ start: iso, end: draft.start });
    } else {
      setDraft({ start: draft.start, end: iso });
    }
  }

  function apply() {
    if (draft.start && draft.end) {
      onChange({ start: draft.start, end: draft.end });
      setOpen(false);
    } else if (draft.start && !draft.end) {
      onChange({ start: draft.start, end: draft.start });
      setOpen(false);
    }
  }

  function shiftMonth(delta: number) {
    let m = visibleMonth + delta;
    let y = visibleYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setVisibleMonth(m);
    setVisibleYear(y);
  }

  const activePreset = matchesPreset(value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        <CalendarIcon className="w-3.5 h-3.5" />
        {formatRangeLabel(value)}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-2 rounded-xl border border-border bg-card shadow-xl z-30 p-3 flex gap-2",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="w-[120px] flex flex-col gap-0.5 pr-2 border-r border-border">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => pickPreset(p.days)}
                className={cn(
                  "text-left text-xs px-3 py-1.5 rounded-md transition-colors",
                  activePreset === p.key
                    ? "bg-primary/10 text-foreground font-medium"
                    : "hover:bg-muted text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="pl-2">
            <MonthCalendar
              visibleYear={visibleYear}
              visibleMonth={visibleMonth}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              rangeStart={draft.start}
              rangeEnd={draft.end}
              hoverDate={hoverDate}
              onHoverDate={setHoverDate}
              onPick={pickDate}
              today={today}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="text-[11px] text-muted-foreground">
                {draft.start && draft.end
                  ? `${formatSingleLabel(draft.start)} – ${formatSingleLabel(draft.end)}`
                  : draft.start
                    ? `From ${formatSingleLabel(draft.start)}`
                    : "Pick a start date"}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setOpen(false)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={apply}
                  disabled={!draft.start}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SinceDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  align?: "left" | "right";
}

export function SinceDatePicker({ value, onChange, align = "right" }: SinceDatePickerProps) {
  const [open, setOpen] = useState(false);
  const today = todayIso();
  const initial = new Date(value + "T00:00:00Z");
  const [visibleYear, setVisibleYear] = useState(initial.getUTCFullYear());
  const [visibleMonth, setVisibleMonth] = useState(initial.getUTCMonth());
  const [draft, setDraft] = useState<string | null>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
      const d = new Date(value + "T00:00:00Z");
      setVisibleYear(d.getUTCFullYear());
      setVisibleMonth(d.getUTCMonth());
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickPreset(days: number) {
    const iso = days === 0 ? today : shiftDateIso(today, -days);
    onChange(iso);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    let m = visibleMonth + delta;
    let y = visibleYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setVisibleMonth(m);
    setVisibleYear(y);
  }

  function apply() {
    if (draft) {
      onChange(draft);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
      >
        <CalendarIcon className="w-3.5 h-3.5" />
        Launched since {formatSingleLabel(value)}
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-2 rounded-xl border border-border bg-card shadow-xl z-30 p-3 flex gap-2",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="w-[120px] flex flex-col gap-0.5 pr-2 border-r border-border">
            {PRESETS.filter((p) => p.days > 0).map((p) => (
              <button
                key={p.key}
                onClick={() => pickPreset(p.days)}
                className="text-left text-xs px-3 py-1.5 rounded-md transition-colors hover:bg-muted text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="pl-2">
            <MonthCalendar
              visibleYear={visibleYear}
              visibleMonth={visibleMonth}
              onPrev={() => shiftMonth(-1)}
              onNext={() => shiftMonth(1)}
              rangeStart={draft}
              rangeEnd={draft}
              hoverDate={null}
              onHoverDate={() => {}}
              onPick={(iso) => setDraft(iso)}
              today={today}
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <div className="text-[11px] text-muted-foreground">
                {draft ? `Since ${formatSingleLabel(draft)}` : "Pick a date"}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setOpen(false)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={apply}
                  disabled={!draft}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
