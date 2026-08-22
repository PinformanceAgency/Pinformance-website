/**
 * Activate an organisation for the organic app.
 *
 * Idempotent: safe to call twice — the second call is a no-op if
 * client_settings already exists.
 *
 * Steps:
 *   1. Insert a default row in organic.client_settings for the org
 *   2. Instantiate every non-recurring task definition (phases 1–3) into
 *      organic.client_tasks. Recurring tasks (phases 4–5) run per cycle and
 *      are handled by a separate flow.
 *   3. Recompute statuses so tasks without preconditions unlock to TODO.
 */
import { organicDb } from "./db";
import { recomputeStatuses } from "./status";

export async function activateClient(orgId: string): Promise<{
  already: boolean;
  tasks_created: number;
  statuses_updated: number;
}> {
  const db = organicDb();

  const { data: existing, error: existErr } = await db
    .from("client_settings")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (existErr) throw new Error(`check settings: ${existErr.message}`);

  if (existing) {
    // Already activated — nothing to seed. Still recompute in case
    // preconditions have changed.
    const { updated } = await recomputeStatuses(orgId);
    return { already: true, tasks_created: 0, statuses_updated: updated };
  }

  const { error: insertErr } = await db.from("client_settings").insert({ org_id: orgId });
  if (insertErr) throw new Error(`create settings: ${insertErr.message}`);

  // Load every non-recurring active task definition and materialise into
  // client_tasks. Start every one as BLOCKED — the recompute right below
  // will flip the ones without preconditions to TODO.
  const { data: defs, error: defsErr } = await db
    .from("task_definitions")
    .select("id")
    .eq("is_recurring", false)
    .eq("active", true);
  if (defsErr) throw new Error(`load defs: ${defsErr.message}`);

  const rows = (defs ?? []).map((d) => ({
    org_id: orgId,
    task_id: d.id as string,
    status: "BLOCKED" as const,
  }));

  if (rows.length > 0) {
    const { error: seedErr } = await db.from("client_tasks").insert(rows);
    if (seedErr) throw new Error(`seed tasks: ${seedErr.message}`);
  }

  const { updated } = await recomputeStatuses(orgId);
  return { already: false, tasks_created: rows.length, statuses_updated: updated };
}
