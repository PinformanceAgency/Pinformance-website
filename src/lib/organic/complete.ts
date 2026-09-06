/**
 * Shared helper — mark a task DONE with the required time_spent_min,
 * optional notes, and re-run status recompute so dependents unlock.
 *
 * Callers: the status-PATCH route, viability form endpoints, intake
 * endpoint, sitemap-count endpoint. Consolidating the write here means the
 * SOP-mandatory time_spent_min is enforced in exactly one place.
 */
import type { PoolClient } from "pg";
import { organicPool } from "./db";
import { recomputeStatuses } from "./status";

interface Params {
  orgId: string;
  taskId: string; // task_definitions.id (e.g. "P1.0.4"), NOT the client_task uuid
  timeSpentMin: number;
  notes?: string | null;
  db?: PoolClient; // when called inside an existing transaction
}

export async function completeTaskByDefinition(p: Params): Promise<void> {
  if (!(p.timeSpentMin > 0)) {
    throw new Error("time_spent_min (positive number) is required to complete a task");
  }
  const runner = p.db ?? organicPool();
  const patch = await runner.query(
    `UPDATE organic.client_tasks
        SET status = 'DONE'::organic.task_status,
            completed_at = now(),
            started_at = COALESCE(started_at, now()),
            time_spent_min = $1,
            notes = COALESCE($2, notes)
      WHERE org_id = $3 AND task_id = $4 AND status <> 'DONE'`,
    [p.timeSpentMin, p.notes ?? null, p.orgId, p.taskId]
  );
  if (patch.rowCount === 0) {
    // Either the task was already DONE (idempotent) or it wasn't
    // instantiated for this org — surface the latter loudly.
    const exists = await runner.query(
      `SELECT status::text FROM organic.client_tasks WHERE org_id = $1 AND task_id = $2`,
      [p.orgId, p.taskId]
    );
    if (exists.rowCount === 0) {
      throw new Error(`task ${p.taskId} is not instantiated for this org`);
    }
    // else already DONE — fine
  }
}

/**
 * Record work on a task that is not finished yet.
 *
 * The counterpart to `completeTaskByDefinition`, and the reason both exist:
 * a form that can only either complete its task or write nothing has to
 * refuse a half-filled save, and refusing a save is how a day of research
 * ends up in no table at all (Fit Cherries, 06-09-2026). Saving what is
 * filled in and holding the task at IN_PROGRESS says the same thing without
 * throwing the work away.
 *
 * Minutes accumulate rather than overwrite — five sessions of twenty minutes
 * is what the task cost. BLOCKED is never touched (that is computed from
 * preconditions) and a DONE task is never reopened by a further save.
 */
export async function recordTaskProgress(p: {
  orgId: string;
  taskId: string;
  addMinutes?: number;
  done: boolean;
  notes?: string | null;
}): Promise<void> {
  await organicPool().query(
    `UPDATE organic.client_tasks
        SET time_spent_min = CASE WHEN $1 > 0 THEN COALESCE(time_spent_min, 0) + $1 ELSE time_spent_min END,
            started_at     = COALESCE(started_at, now()),
            notes          = COALESCE($2, notes),
            status         = CASE
                               WHEN status = 'BLOCKED'::organic.task_status THEN status
                               WHEN $3 THEN 'DONE'::organic.task_status
                               WHEN status = 'DONE'::organic.task_status THEN status
                               ELSE 'IN_PROGRESS'::organic.task_status
                             END,
            completed_at   = CASE WHEN $3 THEN COALESCE(completed_at, now()) ELSE completed_at END
      WHERE org_id = $4 AND task_id = $5`,
    [Math.max(0, Math.round(p.addMinutes || 0)), p.notes ?? null, p.done, p.orgId, p.taskId]
  );
}

/** Run recompute after all writes in a flow are done, so downstream tasks
 *  unlock in one round-trip regardless of how many tasks a form completes. */
export async function recomputeAfter(orgId: string): Promise<number> {
  const { updated } = await recomputeStatuses(orgId);
  return updated;
}
