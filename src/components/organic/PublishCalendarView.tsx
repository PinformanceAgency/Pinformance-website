"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, Label } from "./primitives";
import { Pill } from "./internal";
import type { CalendarDay, CalendarPin, PublishCalendar } from "@/lib/organic/calendar";

/**
 * The month, as it will actually happen.
 *
 * Four states, four treatments, and the difference between them is the
 * whole point of the screen:
 *
 *   live      · green   — it is on Pinterest
 *   queued    · ink     — approved, the cron will take it on its day
 *   on paper  · dashed grey — it has a date and nothing else; it will
 *               never publish as things stand
 *   blocked   · red     — queued, but something it needs is missing
 *
 * "On paper" is deliberately the palest thing on the grid. A PLANNED pin
 * renders identically to a scheduled one in every other list in this app,
 * which is how two stores sat on sixteen dated pins that were never going
 * out and read as fully scheduled months.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type PinState = "live" | "queued" | "paper" | "blocked" | "watch";

function stateOf(p: CalendarPin): PinState {
  if (p.status === "PUBLISHED") return "live";
  if (p.blocker?.kind === "not_queued") return "paper";
  if (p.blocker?.severity === "blocking") return "blocked";
  if (p.blocker?.severity === "watch") return "watch";
  return "queued";
}

/** Border rather than ring, because "on paper" has to be dashed and
 *  Tailwind has no dashed ring. */
const STATE_EDGE: Record<PinState, string> = {
  live:    "border border-o-pos/60",
  queued:  "border border-o-ink/35",
  paper:   "border border-dashed border-o-ink-3/70 opacity-55",
  blocked: "border border-o-neg/60",
  watch:   "border border-o-clay/55",
};

const STATE_LABEL: Record<PinState, string> = {
  live: "live on Pinterest",
  queued: "queued — goes out on its day",
  paper: "on paper only — not queued",
  blocked: "blocked",
  watch: "on course, waiting on its board",
};

const STATE_TONE: Record<PinState, "good" | "neutral" | "bad" | "warn"> = {
  live: "good", queued: "neutral", paper: "warn", blocked: "bad", watch: "warn",
};

/* ------------------------------------------------------------------ *
 * Thumbnail
 * ------------------------------------------------------------------ */

function Thumb({ pin, size }: { pin: CalendarPin; size: number }) {
  const state = stateOf(pin);
  return (
    <span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden rounded-[4px] bg-o-sunk",
        STATE_EDGE[state]
      )}
      style={{ width: size, height: size }}
    >
      {pin.image_url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pin.image_url} alt="" loading="lazy"
               className="h-full w-full object-cover" />
          {/* Bij een video is dit het posterframe. De markering staat er zodat
              de dag niet leest als vier keer hetzelfde plaatje wanneer één
              creative een video is. */}
          {pin.is_video && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 text-[8px] font-bold text-white">
              ▶
            </span>
          )}
        </>
      ) : (
        // No artwork is not a missing thumbnail, it is the reason the pin
        // will not publish — so it reads as a hole, not as a slow image.
        <span className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-o-neg">
          !
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * A day
 * ------------------------------------------------------------------ */

function DayCell({
  day, selected, compact, onSelect,
}: {
  day: CalendarDay;
  selected: boolean;
  compact: boolean;
  onSelect: (date: string) => void;
}) {
  const n = day.pins.length;
  const shown = compact ? 2 : 3;

  return (
    <button
      type="button"
      onClick={() => onSelect(day.date)}
      disabled={n === 0 && compact}
      aria-label={`${day.date}, ${n} pin${n === 1 ? "" : "s"}`}
      className={cn(
        "group relative flex flex-col items-start gap-1 border-b border-r border-o-hairline text-left",
        compact ? "min-h-[44px] p-1.5" : "min-h-[104px] p-2",
        day.in_month ? "bg-o-surface" : "bg-o-sunk/45",
        n > 0 && "hover:bg-o-sunk/70 cursor-pointer",
        n === 0 && !compact && "cursor-default",
        selected && "ring-2 ring-inset ring-o-accent/45 z-10",
      )}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span className={cn(
          "o-num text-[11px] tabular-nums leading-none",
          !day.in_month ? "text-o-ink-3/60"
            : day.is_today ? "flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-o-accent px-1 font-semibold text-white"
            : day.is_past ? "text-o-ink-3" : "text-o-ink-2",
        )}>
          {day.date.slice(8)}
        </span>
        {n > 0 && (
          <span className="o-num text-[10px] tabular-nums text-o-ink-3">{n}</span>
        )}
      </span>

      {n > 0 && (
        <span className="flex flex-wrap items-center gap-1">
          {day.pins.slice(0, shown).map((p) => (
            <Thumb key={p.pin_id} pin={p} size={compact ? 16 : 30} />
          ))}
          {n > shown && (
            <span className="o-num text-[10px] text-o-ink-3">+{n - shown}</span>
          )}
        </span>
      )}

      {/* The board is what the day is for. One line, truncated — the full
          list is one click away, and a cell that tries to carry four board
          names carries none of them legibly. */}
      {!compact && n > 0 && (
        <span className="mt-auto w-full truncate text-[10px] leading-tight text-o-ink-3">
          {n === 1
            ? day.pins[0].board
            : `${new Set(day.pins.map((p) => p.board)).size} boards`}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * The detail for one day
 * ------------------------------------------------------------------ */

function DayDetail({ day, orgId }: { day: CalendarDay; orgId: string }) {
  if (day.pins.length === 0) {
    return (
      <Panel className="px-5 py-4">
        <Label>{day.date}</Label>
        <p className="mt-1.5 text-[length:var(--text-o-body)] text-o-ink-2">
          Nothing is planned for this day. At {day.is_past ? "the time" : "this spacing"} that is a gap in the
          waterfall, not a failure — sixteen pins at 48-hour spacing occupy every other day.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-4 border-b border-o-hairline px-5 py-3">
        <div>
          <Label>{day.date}</Label>
          <p className="mt-0.5 text-[length:var(--text-o-body)] text-o-ink">
            {day.pins.length} pin{day.pins.length === 1 ? "" : "s"}
            {day.published > 0 && <span className="text-o-pos"> · {day.published} live</span>}
            {day.blocked > 0 && <span className="text-o-neg"> · {day.blocked} blocked</span>}
          </p>
        </div>
        {day.over_cap > 0 && (
          <Pill tone="warn">{day.over_cap} over the daily cap</Pill>
        )}
      </div>
      <ul className="divide-y divide-o-hairline">
        {day.pins.map((p) => {
          const state = stateOf(p);
          return (
            <li key={p.pin_id} className="flex gap-4 px-5 py-4">
              <Thumb pin={p} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <Pill tone={STATE_TONE[state]}>{STATE_LABEL[state]}</Pill>
                  <span className="o-num text-[length:var(--text-o-label)] text-o-ink-3">
                    D{p.design_number}{p.copy_variant} · {p.intent.toLowerCase()}
                    {p.scheduled_time && ` · ${p.scheduled_time}`}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-[length:var(--text-o-body)] text-o-ink">
                  {p.title ?? <span className="text-o-ink-3">no title written yet</span>}
                </p>
                <p className="mt-0.5 text-[length:var(--text-o-label)] text-o-ink-2">
                  <span className={p.board_live ? "" : "text-o-clay"}>{p.board}</span>
                  {!p.board_live && <span className="text-o-ink-3"> · not on Pinterest yet</span>}
                  <span className="text-o-ink-3"> — {p.url_name}</span>
                </p>
                {p.blocker && (
                  <p className={cn(
                    "mt-1.5 text-[length:var(--text-o-label)] leading-relaxed",
                    p.blocker.severity === "blocking" ? "text-o-neg" : "text-o-clay"
                  )}>
                    {p.blocker.label}
                    {p.failure_reason && <span className="text-o-ink-3"> · {p.failure_reason}</span>}
                  </p>
                )}
              </div>
              <div className="shrink-0 space-y-1 text-right">
                {p.pin_url && (
                  <a href={p.pin_url} target="_blank" rel="noreferrer"
                     className="inline-flex items-center gap-1 text-[length:var(--text-o-label)] font-medium text-o-accent hover:underline underline-offset-2">
                    Pin <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Link href={`/client/${orgId}/phase/4#${p.cycle}`}
                      className="block text-[length:var(--text-o-label)] text-o-ink-3 hover:text-o-ink-2 hover:underline underline-offset-2">
                  Cycle
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------------ *
 * The month
 * ------------------------------------------------------------------ */

export function PublishCalendarView({
  cal, compact = false,
}: {
  cal: PublishCalendar;
  compact?: boolean;
}) {
  // Open on the day people arrive asking about: today if it carries
  // anything, otherwise the next day that does.
  const initial =
    cal.weeks.flat().find((d) => d.is_today && d.pins.length > 0)?.date ??
    cal.weeks.flat().find((d) => d.in_month && !d.is_past && d.pins.length > 0)?.date ??
    null;
  const [selected, setSelected] = useState<string | null>(initial);
  const day = selected ? cal.weeks.flat().find((d) => d.date === selected) ?? null : null;

  const base = `/client/${cal.org_id}`;

  const grid = (
    <div className="overflow-hidden rounded-[10px] border-l border-t border-o-hairline">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => (
          <div key={w}
               className="border-b border-r border-o-hairline bg-o-sunk/60 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-o-ink-3">
            {compact ? w.slice(0, 1) : w}
          </div>
        ))}
        {cal.weeks.flat().map((d) => (
          <DayCell key={d.date} day={d} compact={compact}
                   selected={d.date === selected}
                   onSelect={(date) => setSelected(date === selected ? null : date)} />
        ))}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div>
        {grid}
        {day && day.pins.length > 0 && (
          <div className="mt-3">
            <DayDetail day={day} orgId={cal.org_id} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ---- month switcher ----------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <Link href={`${base}/calendar?month=${cal.prev_month}`}
                aria-label="Previous month"
                className="o-btn o-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="o-h3 min-w-[9.5rem] px-2 text-center text-o-ink">{cal.month_label}</span>
          <Link href={`${base}/calendar?month=${cal.next_month}`}
                aria-label="Next month"
                className="o-btn o-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0">
            <ChevronRight className="h-4 w-4" />
          </Link>
          {cal.month !== cal.today.slice(0, 7) && (
            <Link href={`${base}/calendar`}
                  className="ml-2 text-[length:var(--text-o-label)] font-medium text-o-accent hover:underline underline-offset-2">
              Today
            </Link>
          )}
        </div>
        <Legend />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        {grid}
        <div className="lg:sticky lg:top-4">
          {day
            ? <DayDetail day={day} orgId={cal.org_id} />
            : (
              <Panel className="px-5 py-4">
                <p className="text-[length:var(--text-o-body)] text-o-ink-2">
                  Pick a day to see which creatives go out on it, onto which board.
                </p>
              </Panel>
            )}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<[PinState, string]> = [
    ["live", "live"],
    ["queued", "queued"],
    ["watch", "waiting on board"],
    ["paper", "on paper only"],
    ["blocked", "blocked"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map(([s, label]) => (
        <span key={s} className="flex items-center gap-1.5 text-[length:var(--text-o-label)] text-o-ink-3">
          <span className={cn("h-3 w-3 rounded-[3px] bg-o-sunk", STATE_EDGE[s])} />
          {label}
        </span>
      ))}
    </div>
  );
}
