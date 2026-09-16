/**
 * "Waiting on automation" — the state between IN_PROGRESS and DONE where
 * there is nothing left for a person to do.
 *
 * WHY IT IS COMPUTED AND NOT A SEVENTH task_status
 * ------------------------------------------------
 * Reported 16-09-2026: tasks like board creation sit at IN_PROGRESS for a
 * week and a half while a cron creates three boards a night. On the board
 * they are indistinguishable from work somebody has started and abandoned,
 * so every morning begins by re-deriving that there is nothing to do there.
 *
 * The honest fix is a state, and the honest place for it is not the enum.
 * `organic.task_status` partitions `client_progress` — migration 068 added a
 * count per status precisely so a phase can be charted without
 * double-counting — and every surface in the app filters on TODO /
 * IN_PROGRESS / BLOCKED. A seventh value would have to be threaded through
 * all of that, and would then be a STORED claim about a queue that moves
 * every night. This app has been bitten by exactly that shape before: a
 * stored warning goes stale, and a stale warning teaches people to dismiss
 * the panel it lives in.
 *
 * So it is derived on read from the same tables the crons act on, exactly
 * like the cycle deviations and the launch readiness. The stored status
 * stays IN_PROGRESS and still closes itself the moment the artefact is
 * there — `syncBoardCreationTask()` for P3.3.5, `recordTaskProgress()` for
 * P3.3.7 — which is the "switches to DONE automatically once completed"
 * half of the request, and was already true.
 *
 * WHAT MAY APPEAR HERE
 * --------------------
 * Only a wait a cron will actually clear on its own. If a person still has
 * to press something, that is a TODO wearing a calmer colour, and it would
 * be the most expensive kind of wrong this app can be: the store publishes
 * nothing and the board says everything is on course.
 */
export interface AutomationWait {
  /** Short, for the pill. */
  label: string;
  /** "12 boards remaining · next batch: 3 boards · 2026-09-17". */
  detail: string;
  /** Which cron does it and when, so nobody goes hunting for a button. */
  runs: string;
  /** The date the next batch moves, when it is known. */
  next_run: string | null;
  /**
   * Set when the operator CAN still help it along — a board with no planned
   * date never enters the queue at all, and calling that "waiting on
   * automation" would be a lie with a week's delay built into it.
   */
  operator_can_help: string | null;
}

/** Keyed `${cycle}::${task_id}`, with "" for a store-level task — the same
 *  convention status.ts uses, and for the same reason: a phase-4 task exists
 *  once per cycle and a flat map keeps whichever row came last. */
export type AutomationWaits = Map<string, AutomationWait>;

/** Mirrors `check_board_pace()`, which is the real limit — three per store
 *  per calendar day, whatever the cron's schedule is. */
export const BOARDS_PER_RUN = 3;

/** Board warming: SEEDS_PER_DAY in phase3.ts, one save per hourly run. */
export const SEEDS_PER_DAY_HINT = 10;

export function automationKey(cycle: string | null, taskId: string): string {
  return `${cycle ?? ""}::${taskId}`;
}

/** Look one up the way a task card holds its own identity.
 *
 *  This module is imported by client components, so it holds no database
 *  access at all — `loadAutomationWaits()` lives in queries.ts, which is
 *  server-only. Pulling pg into a client bundle through a shared helper is
 *  a build failure, not a runtime one, so it is worth the split. */
export function automationFor(
  waits: AutomationWaits | undefined,
  taskId: string,
  cycle: string | null,
): AutomationWait | null {
  if (!waits) return null;
  return waits.get(automationKey(cycle, taskId)) ?? null;
}
