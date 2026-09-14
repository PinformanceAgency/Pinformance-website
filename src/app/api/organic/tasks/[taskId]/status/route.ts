import { NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { recomputeStatuses } from "@/lib/organic/status";
import { autoLinkAsset, autoLinkAssetsFromText } from "@/lib/organic/assets-auto";
import type { SkipReason, TaskStatus } from "@/lib/organic/types";

export const runtime = "nodejs";

const ALLOWED: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];
const VALID_SKIP_REASONS: SkipReason[] = [
  "NOT_APPLICABLE", "CLIENT_REFUSED", "ALREADY_DONE", "BLOCKED_EXTERNAL", "OTHER",
];

interface Body {
  status: TaskStatus;
  time_spent_min?: number;
  notes?: string | null;
  skip_reason?: SkipReason;
  skip_note?: string | null;
  /** Optional URL captured with the completion. If set, auto-creates an
   *  organic.assets row linked to this task's definition id, with type
   *  inferred from task + hostname. */
  link?: string | null;
  link_title?: string | null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = (await req.json()) as Body;

  if (!ALLOWED.includes(body.status)) {
    return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
  }
  // time_spent_min is no longer required to finish a task. It was a
  // mandatory field that told us nothing we act on, and it stood between
  // a manager and marking work done — which is how tasks end up finished
  // in real life but open in here. The column stays and is still written
  // when a value is supplied, because the margin screens read it.
  if (body.status === "SKIPPED") {
    if (!body.skip_reason || !VALID_SKIP_REASONS.includes(body.skip_reason)) {
      return NextResponse.json(
        { error: `skip_reason is required and must be one of: ${VALID_SKIP_REASONS.join(", ")}` },
        { status: 400 }
      );
    }
    if (body.skip_reason === "OTHER" && !body.skip_note?.trim()) {
      return NextResponse.json(
        { error: "skip_note is required when skip_reason=OTHER" },
        { status: 400 }
      );
    }
  }

  const pool = organicPool();
  const cur = await pool.query<{ org_id: string; started_at: string | null; cycle: string | null; def_id: string }>(
    `SELECT org_id::text, started_at, cycle, task_id AS def_id
       FROM organic.client_tasks WHERE id = $1`,
    [taskId]
  );
  if (cur.rowCount === 0) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  const { org_id, started_at, cycle, def_id } = cur.rows[0];

  // A phase-4 task whose answer is an artefact cannot be finished by saying
  // so. There is no hand route to any of them — a pin gets an image from
  // P4.2.5, copy from the editor, a queue from "Save & queue" — so a manual
  // DONE here is simply a false statement about the database, and it is the
  // one thing this app has spent its whole history trying not to record.
  // The Longevity store, 14-09-2026: "Queue for publishing · DONE" and
  // "Approve the waterfall · DONE" over sixteen pins still at PLANNED, on a
  // waterfall regenerated an hour earlier. Clarissa reported the cycle as
  // finished, and every task pill agreed with her.
  //
  // SKIPPED is deliberately still allowed: that is a decision somebody
  // makes and owns, not a claim about what is in the tables. Phases 1-3 are
  // untouched — closing P1.2.x by hand is a legitimate call there, because
  // the remaining item is usually somebody else's developer.
  if (body.status === "DONE" && cycle && def_id.startsWith("P4.")) {
    const { cycleTaskFact } = await import("@/lib/organic/phase4");
    const fact = await cycleTaskFact(org_id, cycle, def_id);
    if (fact && !fact.done) {
      return NextResponse.json({
        error: `${def_id} cannot be closed by hand: ${fact.note} ` +
          `Run the control on the cycle card — the task closes itself when the work is there. ` +
          `If it does not apply to this cycle, skip it with a reason instead.`,
      }, { status: 409 });
    }
  }

  const nowIso = new Date().toISOString();
  if (body.status === "DONE") {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status='DONE'::organic.task_status,
              completed_at = $1::timestamptz,
              started_at   = COALESCE(started_at, $1::timestamptz),
              time_spent_min = COALESCE($2, time_spent_min),
              notes = COALESCE($3, notes),
              skip_reason = NULL, skip_note = NULL
        WHERE id = $4`,
      [nowIso, body.time_spent_min ?? null, body.notes ?? null, taskId]
    );
  } else if (body.status === "SKIPPED") {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status='SKIPPED'::organic.task_status,
              skip_reason = $1, skip_note = $2,
              notes = COALESCE($3, notes),
              completed_at = COALESCE(completed_at, $4::timestamptz)
        WHERE id = $5`,
      [body.skip_reason, body.skip_note ?? null, body.notes ?? null, nowIso, taskId]
    );
  } else if (body.status === "IN_PROGRESS" && !started_at) {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status=$1::organic.task_status,
              started_at = $2::timestamptz,
              notes = COALESCE($3, notes)
        WHERE id = $4`,
      [body.status, nowIso, body.notes ?? null, taskId]
    );
  } else {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status=$1::organic.task_status,
              notes = COALESCE($2, notes)
        WHERE id = $3`,
      [body.status, body.notes ?? null, taskId]
    );
  }

  // Auto-capture assets: any URL supplied via `link` OR pasted inline in
  // `notes` becomes an organic.assets row linked to this task's definition.
  // Manual entry via the Assets tab stays as a fallback.
  const captured: string[] = [];
  const taskDefId = (await pool.query<{ task_id: string }>(
    `SELECT task_id FROM organic.client_tasks WHERE id = $1`, [taskId]
  )).rows[0]?.task_id ?? null;
  if (body.link) {
    const id = await autoLinkAsset({
      orgId: org_id, url: body.link, taskId: taskDefId,
      title: body.link_title ?? null,
    });
    if (id) captured.push(id);
  }
  if (body.notes) {
    const ids = await autoLinkAssetsFromText(org_id, taskDefId, body.notes);
    captured.push(...ids);
  }

  const { updated } = await recomputeStatuses(org_id);
  return NextResponse.json({ ok: true, recomputed: updated, assets_captured: captured.length });
}
