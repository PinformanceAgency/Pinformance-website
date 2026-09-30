/**
 * Delivery meeting — fixed ids and knobs. Board and column ids are verified
 * against live monday data (29-09-2026); change them here and nowhere else.
 */

export const STREAMS = ["dropship", "branded"] as const;
export type Stream = (typeof STREAMS)[number];

/** Pipeline order. A run's `stage` is the NEXT stage to do. */
export const STAGES = [
  "collect",
  "targets",
  "compute",
  "render",
  "deliver",
  "done",
] as const;
export type Stage = (typeof STAGES)[number];

/** What the cron routes accept: the stages plus the read-only watchdog. */
export const ROUTE_STAGES = [...STAGES.filter((s) => s !== "done"), "check"] as const;
export type RouteStage = (typeof ROUTE_STAGES)[number];

/**
 * What one invocation may spend. The repo measured ~60 s of real run time per
 * invocation whatever `maxDuration` says (weekly-update-sync, 17-08-2026), so
 * a step is only STARTED when this much is still left, and every step is sized
 * to fit in it: one batch of targets, one stream's render.
 */
export const RUN_BUDGET_MS = 50_000;
/** A step that has not started by this point waits for the next invocation. */
export const MIN_STEP_MS = 35_000;
/** How long an invocation holds a run before another may take it over. */
export const LEASE_MS = 120_000;

/** Monday. */
export const MONDAY = {
  // Mediabuying To-do's: Weekly Store Logs and the to-dos
  TODO_BOARD: 5101714191,
  LOG_GROUP_ARCHIVE: "group_mm5zkew3",
  LOG_GROUP_LIVE: "group_mm5zbv0d",
  COL_STORE: "text_mm1csd9j",
  COL_DEADLINE: "date_mm1c4dgx",
  COL_PERSON: "person",
  COL_STATUS: "status",
  COL_LOG_DOC: "doc_mm65vp27",
  LOG_ITEM_PREFIX: "weekly media buying cycle",
  LOG_TEMPLATE_DOC: 5105093575,

  // Clients board: stores are subitems
  CLIENTS_SUBITEM_BOARD: 5088411076,
  CLIENTS_COL_PERSON: "person",
  CLIENTS_COL_STATUS: "status",

  // Weekly Updates: the fallback numbers for stores not on the dashboard
  WEEKLY_PARENT_BOARD: 5091362359,
  WEEKLY_SUBITEM_BOARD: 5091487606,
  WU_COL_REVENUE: "numeric_mm0dgayk",
  WU_COL_SPEND: "numeric_mm0dje2n",
  WU_COL_SEND_DATE: "date_mm0rkas9",
  WU_COL_CURRENCY: "text_mm0qxxnt",
} as const;

export const STORAGE_BUCKET = "delivery-meeting";

/** Claude model for reading the targets out of the logs. */
export const MODEL = "claude-sonnet-5";

/** Stores per targets step. */
export const TARGET_BATCH = 8;

/**
 * Where the result lands: a to-do for Tycho in "Tycho To Do's" on the
 * Operations To Do's board, one per meeting, the files attached to its update.
 * Problems found by the 10:30 check go to Tristan's group.
 */
export const MONDAY_DELIVERY = {
  BOARD: 5100077374,
  GROUP_TYCHO: "group_title",
  PERSON_TYCHO: 108368238,
  GROUP_TRISTAN: "group_mm1tf651",
  PERSON_TRISTAN: 101160765,
  COL_PERSON: "person",
  COL_STATUS: "status",
  COL_DEADLINE: "date_mm2zm1vb",
  COL_PRIORITY: "color_mm34y739",
  STATUS_TODO: "To Do",
  PRIORITY: "High",
} as const;

/** The day each meeting's decks are delivered, relative to the Tuesday: both on Tuesday. */
export const MEETING_DAY_OFFSET = { dropship: 0, branded: 0 } as const;

/**
 * When the to-do lands with Tycho, in Amsterdam time: both decks on Tuesday at
 * 10:00 (Tristan, 30-09-2026 — branded was Wednesday 08:00 while the run also
 * built a prep from Tycho's deep dives; with the prep gone there is nothing to
 * wait for). The crons run in UTC and fire at both candidate hours; deliver
 * waits for the local hour, so summer and winter time both land on the minute
 * without a code change.
 */
export const DELIVER_AT_LOCAL_HOUR = { dropship: 10, branded: 10 } as const;
export const TIME_ZONE = "Europe/Amsterdam";
