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

/** Run recompute after all writes in a flow are done, so downstream tasks
 *  unlock in one round-trip regardless of how many tasks a form completes. */
export async function recomputeAfter(orgId: string): Promise<number> {
  const { updated } = await recomputeStatuses(orgId);
  return updated;
}
