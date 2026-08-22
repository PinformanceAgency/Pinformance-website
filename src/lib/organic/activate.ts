/**
 * Activate an organisation for the organic app.
 *
 * Idempotent: safe to call twice — the second call is a no-op if
 * client_settings already exists.
 *
 * Steps:
 *   1. Insert a default row in organic.client_settings for the org
 *   2. Instantiate every non-recurring active task definition (phases 1-3)
 *      into organic.client_tasks. Recurring tasks (phases 4-5) run per
 *      cycle and are handled by a separate flow.
 *   3. Recompute statuses so tasks without preconditions unlock to TODO.
 */
import { organicPool } from "./db";
import { recomputeStatuses } from "./status";

export async function activateClient(orgId: string): Promise<{
  already: boolean;
  tasks_created: number;
  statuses_updated: number;
}> {
  const pool = organicPool();

  const existing = await pool.query(
    `SELECT 1 FROM organic.client_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const { updated } = await recomputeStatuses(orgId);
    return { already: true, tasks_created: 0, statuses_updated: updated };
  }

  await pool.query(`INSERT INTO organic.client_settings (org_id) VALUES ($1)`, [orgId]);

  // Seed every non-recurring active task definition as BLOCKED. The recompute
  // that follows flips the ones without preconditions to TODO.
  const seed = await pool.query<{ count: string }>(
    `WITH ins AS (
       INSERT INTO organic.client_tasks (org_id, task_id, status)
       SELECT $1, id, 'BLOCKED'::organic.task_status
         FROM organic.task_definitions
        WHERE is_recurring = false AND active = true
       RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM ins`,
    [orgId]
  );
  const tasksCreated = Number(seed.rows[0]?.count ?? 0);

  const { updated } = await recomputeStatuses(orgId);
  return { already: false, tasks_created: tasksCreated, statuses_updated: updated };
}
