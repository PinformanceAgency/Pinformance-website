/**
 * Delivery meeting — fixed ids and knobs. Board and column ids are verified
 * against live monday data (29-09-2026); change them here and nowhere else.
 */

export const STREAMS = ["dropship", "branded"] as const;
export type Stream = (typeof STREAMS)[number];

/** Pipeline order. A run's `stage` is the NEXT stage to do. */
export const STAGES = [
  "collect",
  "fathom",
  "targets",
  "compute",
  "briefs",
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
 * to fit in it: one transcript chunk, one batch of briefs, one stream's render.
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
  TODO_GROUPS: ["group_title", "group_mm5car0h", "group_mkyfmg04"],
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

/** Fathom recordings the pipeline looks for. */
export const FATHOM = {
  API: "https://api.fathom.ai/external/v1",
  /** Last week's delivery meeting, by stream: title and weekday offset. */
  MEETING_TITLE: {
    dropship: "mediabuying - dropship",
    branded: "delivery meeting branding - pinformance",
  } as Record<Stream, string>,
  /** Days before the meeting the previous one was held (Tue / Wed). */
  MEETING_DAYS_BEFORE: { dropship: 7, branded: 6 } as Record<Stream, number>,
  DEEP_DIVE_BY: "tycho",
  /** Characters of transcript per Claude call — one chunk per invocation. */
  CHUNK_CHARS: 45_000,
} as const;

export const STORAGE_BUCKET = "delivery-meeting";

/** Claude model for extraction and writing. */
export const MODEL = "claude-sonnet-5";

/** Briefs per step. */
export const BRIEF_BATCH = 6;
/** Stores per targets step. */
export const TARGET_BATCH = 8;

/**
 * Deliver waits for both streams until this UTC hour:minute, then sends what
 * it has. 09:45 UTC is 10:45 in winter and 11:45 in summer in Amsterdam —
 * still before the 12:00 promise either way.
 */
export const DELIVER_WAIT_UNTIL_UTC = { h: 9, m: 45 };
