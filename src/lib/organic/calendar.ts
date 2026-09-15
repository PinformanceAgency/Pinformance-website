/**
 * THE PUBLISHING CALENDAR — which pin goes out on which day, onto which
 * board, with the picture on it.
 *
 * It exists because the one question nobody could answer from this app was
 * the simplest one: *when does the next pin go out, and what is it?* The
 * cycle card carries a per-URL plan, Today carries one day, P4.4.2 carries
 * a readout after the fact — and a store running two cycles publishes from
 * both onto one account, on days that interleave. There was no screen that
 * put the month together.
 *
 * The distinction this screen is built on, and the reason it was worth
 * building: **a date is not a queue**. A PLANNED pin has a scheduled_date,
 * renders like any other pin in every list we had, and will never publish —
 * `publishDuePins()` filters on `status = 'SCHEDULED'`. On 15-09-2026 both
 * The Longevity store and Abbey London sat on sixteen PLANNED pins with
 * dates spread across September, their waterfall still PLANNING, and every
 * screen in the app agreed that pins were "scheduled". Nothing was going
 * out and nothing said so.
 *
 * So every cell here states what will actually happen on that day, not what
 * was drawn on paper. The blocker rules mirror the cron's own WHERE clause
 * (image, board on Pinterest, title) plus the queue state, and the day
 * arithmetic mirrors its cap — because a calendar that disagrees with the
 * cron is worse than no calendar.
 */
import { organicPool } from "./db";
import { ORGANIC_DAILY_CAP } from "./pacing";

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/**
 * Why a pin will not go out on its day.
 *
 * `blocking` means the cron will never pick it up as things stand.
 * `watch` means it is on course but depends on something that has not
 * happened yet — a board scheduled to be created before the pin's own
 * date. The two must not be one colour: a store whose boards are simply
 * queued for tomorrow is fine, and painting it red teaches people to
 * ignore red.
 */
export interface PinBlocker {
  kind:
    | "not_queued"      // the waterfall was never approved — pin is PLANNED
    | "board_missing"   // board has no pinterest_board_id and no date to get one
    | "board_pending"   // board is queued for creation, in time for this pin
    | "board_late"      // board is queued for creation AFTER this pin's date
    | "no_image"
    | "no_title"
    | "failed";
  severity: "blocking" | "watch";
  label: string;
}

export interface CalendarPin {
  pin_id: string;
  sequence: number;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  image_url: string | null;
  title: string | null;
  content_code: string | null;
  board: string;
  board_live: boolean;
  board_planned_creation: string | null;
  design_number: number;
  /** SAVE (2:3, no overlay) or CLICK (9:16, overlay + CTA). */
  intent: string;
  copy_variant: string;
  url_id: string;
  url_name: string;
  /** The cycle key, so a cell can link back to the phase-4 card it came from. */
  cycle: string;
  waterfall_status: string;
  pin_url: string | null;
  published_at: string | null;
  failure_reason: string | null;
  blocker: PinBlocker | null;
}

export interface CalendarDay {
  date: string;
  in_month: boolean;
  is_today: boolean;
  is_past: boolean;
  pins: CalendarPin[];
  published: number;
  /** Pins this day that the cron can actually take, before the cap. */
  publishable: number;
  /** Pins this day it will never take as things stand. */
  blocked: number;
  /**
   * How many of this day's publishable pins the daily cap pushes to a later
   * run. Nothing is lost — the cron takes `scheduled_date <= CURRENT_DATE`,
   * so a surplus simply goes out late — but a plan that drifts is worth
   * seeing before it drifts.
   */
  over_cap: number;
}

export interface CalendarIssue {
  kind: string;
  severity: "blocking" | "watch";
  headline: string;
  detail: string;
  count: number;
  /** Relative to /client/[orgId] — the screen that fixes it. */
  fix_href?: string;
  fix_task?: string;
}

export interface PublishCalendar {
  org_id: string;
  /** YYYY-MM. */
  month: string;
  month_label: string;
  prev_month: string;
  next_month: string;
  /** Months that carry at least one pin, oldest first — for the picker. */
  months_with_pins: string[];
  today: string;
  /** min(client_settings.daily_pin_target, the method's ceiling). */
  daily_target: number;
  weeks: CalendarDay[][];
  totals: {
    pins: number;
    days_with_pins: number;
    published: number;
    will_publish: number;
    blocked: number;
    failed: number;
  };
  issues: CalendarIssue[];
  /** Across all time, not just this month — the two questions people
   *  actually arrive with. */
  last_published: string | null;
  next_publish: string | null;
  /** Set when nothing will ever publish as things stand, whatever the
   *  calendar shows. Stated once, at the top, rather than as sixteen
   *  identical cell warnings. */
  standstill: string | null;
}

/* ------------------------------------------------------------------ *
 * Month arithmetic
 * ------------------------------------------------------------------ */

const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthKey(d: string): string { return d.slice(0, 7); }

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAME[m - 1]} ${y}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monday-first weekday index (0 = Monday) for a YYYY-MM-DD string. */
function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Blockers
 * ------------------------------------------------------------------ */

interface PinRow {
  pin_id: string;
  sequence_number: number;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  image_path: string | null;
  title: string | null;
  content_code: string | null;
  board_name: string;
  board_live: boolean;
  board_planned_creation: string | null;
  design_number: number;
  intent: string;
  copy_variant: string;
  url_id: string;
  url_name: string;
  waterfall_status: string;
  pinterest_pin_id: string | null;
  published_at: string | null;
  failure_reason: string | null;
}

/**
 * The same three columns `publishDuePins()` filters on, plus the queue
 * state it filters on first. Kept in this order deliberately: the queue is
 * checked before the artefacts, because "this plan was never approved" is
 * the answer, and reporting a missing board on a pin that was never queued
 * sends somebody to fix the wrong thing.
 */
function blockerFor(r: PinRow): PinBlocker | null {
  if (r.status === "PUBLISHED") return null;
  if (r.status === "FAILED") {
    return { kind: "failed", severity: "blocking", label: "Pinterest refused this pin" };
  }
  if (r.status === "PLANNED") {
    return {
      kind: "not_queued", severity: "blocking",
      label: "not queued — this plan was never approved",
    };
  }
  // SCHEDULED from here.
  if (!r.image_path) {
    return { kind: "no_image", severity: "blocking", label: "no image on this pin" };
  }
  if (!r.title) {
    return { kind: "no_title", severity: "blocking", label: "no copy title" };
  }
  if (!r.board_live) {
    if (!r.board_planned_creation) {
      return {
        kind: "board_missing", severity: "blocking",
        label: `board "${r.board_name}" is not on Pinterest and is not queued to be created`,
      };
    }
    if (r.board_planned_creation > r.scheduled_date) {
      return {
        kind: "board_late", severity: "blocking",
        label: `board "${r.board_name}" is not created until ${r.board_planned_creation}`,
      };
    }
    return {
      kind: "board_pending", severity: "watch",
      label: `board "${r.board_name}" is created on ${r.board_planned_creation}`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

/**
 * Every live pin for the store, hung on a month grid.
 *
 * One query for the whole store rather than one per month: a store holds
 * tens of pins, not thousands, and reading them all is what lets the month
 * picker say which months have anything in them and the header answer
 * "when is the next one" without a second round trip.
 *
 * ABANDONED waterfalls and CANCELLED pins are excluded, for the reason
 * written down about `liveWaterfallId()`: a regenerated cycle leaves a full
 * superseded plan behind, and a calendar that draws it shows a month twice
 * as busy as the account will ever be.
 */
export async function loadPublishCalendar(
  orgId: string,
  month?: string
): Promise<PublishCalendar> {
  const pool = organicPool();
  const today = new Date().toISOString().slice(0, 10);
  const target = month && /^\d{4}-\d{2}$/.test(month) ? month : monthKey(today);

  const [pinsRes, settingsRes] = await Promise.all([
    pool.query<PinRow>(
      `SELECT p.id::text                       AS pin_id,
              p.sequence_number,
              p.scheduled_date::text           AS scheduled_date,
              p.scheduled_time::text           AS scheduled_time,
              p.status::text                   AS status,
              p.image_path,
              p.content_code,
              cs.title,
              b.name                           AS board_name,
              b.pinterest_board_id IS NOT NULL AS board_live,
              b.planned_creation_date::text    AS board_planned_creation,
              d.design_number,
              d.intent::text                   AS intent,
              p.copy_variant,
              u.id::text                       AS url_id,
              u.name                           AS url_name,
              w.status::text                   AS waterfall_status,
              p.pinterest_pin_id,
              p.published_at::text             AS published_at,
              p.failure_reason
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         JOIN organic.urls u       ON u.id = w.url_id
         JOIN organic.boards b     ON b.id = p.board_id
         JOIN organic.designs d    ON d.id = p.design_id
         LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
        WHERE w.org_id = $1
          AND w.status <> 'ABANDONED'::organic.waterfall_status
          AND p.status <> 'CANCELLED'::organic.pin_status
        ORDER BY p.scheduled_date, p.sequence_number`,
      [orgId]
    ),
    pool.query<{ daily_pin_target: number | null }>(
      `SELECT daily_pin_target FROM organic.client_settings WHERE org_id = $1`,
      [orgId]
    ),
  ]);

  const dailyTarget = Math.min(
    settingsRes.rows[0]?.daily_pin_target ?? 1,
    ORGANIC_DAILY_CAP
  );

  const pins: CalendarPin[] = pinsRes.rows.map((r) => ({
    pin_id: r.pin_id,
    sequence: r.sequence_number,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time ? r.scheduled_time.slice(0, 5) : null,
    status: r.status,
    image_url: r.image_path,
    title: r.title,
    content_code: r.content_code,
    board: r.board_name,
    board_live: r.board_live,
    board_planned_creation: r.board_planned_creation,
    design_number: r.design_number,
    intent: r.intent,
    copy_variant: r.copy_variant,
    url_id: r.url_id,
    url_name: r.url_name,
    cycle: `URL-${r.url_id.slice(0, 8)}`,
    waterfall_status: r.waterfall_status,
    pin_url: r.pinterest_pin_id ? `https://www.pinterest.com/pin/${r.pinterest_pin_id}/` : null,
    published_at: r.published_at,
    failure_reason: r.failure_reason,
    blocker: blockerFor(r),
  }));

  const byDate = new Map<string, CalendarPin[]>();
  for (const p of pins) {
    const arr = byDate.get(p.scheduled_date) ?? [];
    arr.push(p);
    byDate.set(p.scheduled_date, arr);
  }

  /* ---- the grid ------------------------------------------------- */

  const first = `${target}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const cells = daysInMonth(target) + weekdayIndex(first);
  const gridDays = Math.ceil(cells / 7) * 7;

  // The cap, walked forward across the grid. Carry is what the previous
  // days could not deliver: the cron takes everything whose date has
  // passed, so a surplus is late rather than lost, and the honest way to
  // show that is to let it push into the following days.
  //
  // It starts at whatever is already overdue. A backlog from before this
  // grid is exactly what makes the month ahead run late, and starting the
  // walk at zero would draw a month that clears on time while the store
  // works through last month's queue.
  let carry = pins.filter(
    (p) => p.status === "SCHEDULED" && p.blocker === null && p.scheduled_date < gridStart
  ).length;
  const flat: CalendarDay[] = [];
  for (let i = 0; i < gridDays; i++) {
    const date = addDays(gridStart, i);
    const dayPins = byDate.get(date) ?? [];
    const publishable = dayPins.filter(
      (p) => p.status === "SCHEDULED" && (p.blocker === null || p.blocker.severity === "watch")
    ).length;
    const blocked = dayPins.filter((p) => p.blocker?.severity === "blocking").length;

    const wanting = carry + publishable;
    const delivered = Math.min(dailyTarget, wanting);
    carry = wanting - delivered;

    flat.push({
      date,
      in_month: monthKey(date) === target,
      is_today: date === today,
      is_past: date < today,
      pins: dayPins,
      published: dayPins.filter((p) => p.status === "PUBLISHED").length,
      publishable,
      blocked,
      over_cap: Math.max(0, publishable - dailyTarget),
    });
  }

  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < flat.length; i += 7) weeks.push(flat.slice(i, i + 7));

  /* ---- totals for the month ------------------------------------- */

  const inMonth = pins.filter((p) => monthKey(p.scheduled_date) === target);
  const totals = {
    pins: inMonth.length,
    days_with_pins: new Set(inMonth.map((p) => p.scheduled_date)).size,
    published: inMonth.filter((p) => p.status === "PUBLISHED").length,
    will_publish: inMonth.filter(
      (p) => p.status === "SCHEDULED" && (p.blocker === null || p.blocker.severity === "watch")
    ).length,
    blocked: inMonth.filter((p) => p.blocker?.severity === "blocking").length,
    failed: inMonth.filter((p) => p.status === "FAILED").length,
  };

  /* ---- the month read as a whole -------------------------------- */

  const issues = monthIssues(inMonth, flat, dailyTarget, today);

  const published = pins.filter((p) => p.published_at);
  published.sort((a, b) => (a.published_at! < b.published_at! ? 1 : -1));
  const upcoming = pins
    .filter((p) => p.status === "SCHEDULED" && p.blocker === null && p.scheduled_date >= today)
    .map((p) => p.scheduled_date)
    .sort();

  // Nothing here will ever go out. Said once, rather than as a warning on
  // every cell — a plan that was never approved is one fact about the
  // store, not sixteen facts about sixteen pins.
  const queued = pins.filter((p) => p.status === "SCHEDULED").length;
  const planned = pins.filter((p) => p.status === "PLANNED").length;
  const standstill =
    queued === 0 && planned > 0
      ? `All ${planned} of this store's dated pins are still on paper — not one is queued. ` +
        `The waterfall is still being planned, and the publishing cron only takes pins that have been approved — ` +
        `so nothing goes out on any of these days until "Save & queue" is pressed on the cycle.`
      : null;

  const monthsWithPins = [...new Set(pins.map((p) => monthKey(p.scheduled_date)))].sort();

  return {
    org_id: orgId,
    month: target,
    month_label: monthLabel(target),
    prev_month: shiftMonth(target, -1),
    next_month: shiftMonth(target, 1),
    months_with_pins: monthsWithPins,
    today,
    daily_target: dailyTarget,
    weeks,
    totals,
    issues,
    last_published: published[0]?.published_at ?? null,
    next_publish: upcoming[0] ?? null,
    standstill,
  };
}

/* ------------------------------------------------------------------ *
 * The analysis
 * ------------------------------------------------------------------ */

/**
 * What is wrong with this month, grouped by cause rather than by pin.
 *
 * This is the half of the screen that means it does not have to be checked
 * again: a month with no issues is a month that runs by itself, and one
 * issue here stands for however many pins share it.
 */
function monthIssues(
  inMonth: CalendarPin[],
  days: CalendarDay[],
  dailyTarget: number,
  today: string
): CalendarIssue[] {
  const out: CalendarIssue[] = [];
  const group = (kind: string) => inMonth.filter((p) => p.blocker?.kind === kind);

  const notQueued = group("not_queued");
  if (notQueued.length > 0) {
    const cycles = [...new Set(notQueued.map((p) => p.url_name))];
    out.push({
      kind: "not_queued",
      severity: "blocking",
      count: notQueued.length,
      headline: `${notQueued.length} pin${notQueued.length === 1 ? "" : "s"} carry a date but are not queued`,
      detail:
        `They sit in a waterfall that is still being planned (${cycles.join(", ")}). ` +
        `A date is not a queue: the cron publishes pins with status SCHEDULED, and these are PLANNED. ` +
        `Approving the cycle with "Save & queue" moves them over without changing a single date.`,
      fix_href: "phase/4",
      fix_task: "P4.3.2",
    });
  }

  const missing = group("board_missing");
  if (missing.length > 0) {
    const boards = [...new Set(missing.map((p) => p.board))];
    out.push({
      kind: "board_missing",
      severity: "blocking",
      count: missing.length,
      headline: `${missing.length} pin${missing.length === 1 ? "" : "s"} point at a board that does not exist on Pinterest`,
      detail:
        `${boards.length} board${boards.length === 1 ? " is" : "s are"} neither created nor scheduled to be: ` +
        `${boards.join(", ")}. A pin onto a board with no Pinterest id is never returned by the publish query — ` +
        `no error, no failure, it simply never goes out.`,
      fix_href: "boards",
      fix_task: "P3.3.4",
    });
  }

  const late = group("board_late");
  if (late.length > 0) {
    const boards = [...new Set(late.map((p) => p.board))];
    out.push({
      kind: "board_late",
      severity: "blocking",
      count: late.length,
      headline: `${late.length} pin${late.length === 1 ? "" : "s"} are due before their board is created`,
      detail:
        `${boards.join(", ")} ${boards.length === 1 ? "is" : "are"} queued for creation after the pin's own date. ` +
        `Boards are created three a day, so bringing them forward means reordering the creation queue, not adding to it.`,
      fix_href: "boards",
      fix_task: "P3.3.5",
    });
  }

  const pending = group("board_pending");
  if (pending.length > 0) {
    const boards = [...new Set(pending.map((p) => p.board))];
    out.push({
      kind: "board_pending",
      severity: "watch",
      count: pending.length,
      headline: `${pending.length} pin${pending.length === 1 ? "" : "s"} wait on a board that is still being created`,
      detail:
        `${boards.join(", ")} ${boards.length === 1 ? "is" : "are"} queued and due before the pin needs ${boards.length === 1 ? "it" : "them"}. ` +
        `On course, but board creation is capped at three a day and slips if the queue grows.`,
      fix_href: "boards",
    });
  }

  const noImage = group("no_image");
  if (noImage.length > 0) {
    out.push({
      kind: "no_image",
      severity: "blocking",
      count: noImage.length,
      headline: `${noImage.length} queued pin${noImage.length === 1 ? " has" : "s have"} no image`,
      detail:
        `The micro-crops were never cut, so these pins have nothing to publish. ` +
        `P4.2.5 cuts them from the four designs; a regeneration drops them, because the crops hang off the pins it cancelled.`,
      fix_href: "phase/4",
      fix_task: "P4.2.5",
    });
  }

  const noTitle = group("no_title");
  if (noTitle.length > 0) {
    out.push({
      kind: "no_title",
      severity: "blocking",
      count: noTitle.length,
      headline: `${noTitle.length} queued pin${noTitle.length === 1 ? " has" : "s have"} no copy title`,
      detail: `Pinterest needs a title on the create call, so the cron passes these over. The copy editor writes it per design.`,
      fix_href: "phase/4",
      fix_task: "P4.2.8",
    });
  }

  const failed = inMonth.filter((p) => p.status === "FAILED");
  if (failed.length > 0) {
    out.push({
      kind: "failed",
      severity: "blocking",
      count: failed.length,
      headline: `${failed.length} pin${failed.length === 1 ? "" : "s"} failed`,
      detail:
        `Pinterest refused ${failed.length === 1 ? "it" : "them"} and they do not retry themselves: ` +
        `${[...new Set(failed.map((p) => p.failure_reason ?? "no reason recorded"))].slice(0, 2).join(" · ")}`,
      fix_href: "today",
    });
  }

  // Overdue and still queued: nothing structural is wrong with the pin, the
  // day simply came and went. Almost always the daily cap catching up.
  const overdue = inMonth.filter(
    (p) => p.status === "SCHEDULED" && p.blocker === null && p.scheduled_date < today
  );
  if (overdue.length > 0) {
    out.push({
      kind: "overdue",
      severity: "watch",
      count: overdue.length,
      headline: `${overdue.length} pin${overdue.length === 1 ? " is" : "s are"} past ${overdue.length === 1 ? "its" : "their"} date and still queued`,
      detail:
        `Everything they need is there, so the next quarter-hourly run takes them — ` +
        `at ${dailyTarget} a day, which is what makes a backlog take days rather than one run.`,
      fix_href: "today",
    });
  }

  const overCapDays = days.filter((d) => d.in_month && d.over_cap > 0);
  if (overCapDays.length > 0) {
    const surplus = overCapDays.reduce((n, d) => n + d.over_cap, 0);
    out.push({
      kind: "over_cap",
      severity: "watch",
      count: surplus,
      headline: `${overCapDays.length} day${overCapDays.length === 1 ? "" : "s"} carry more pins than the daily cap`,
      detail:
        `The store publishes ${dailyTarget} a day, and ${surplus} pin${surplus === 1 ? "" : "s"} more than that ${surplus === 1 ? "is" : "are"} planned on ` +
        `${overCapDays.map((d) => d.date).join(", ")}. ` +
        `Nothing is lost — the cron takes anything whose date has passed — but the plan runs later than it reads.`,
      fix_href: "phase/4",
      fix_task: "P4.3.2",
    });
  }

  return out;
}
