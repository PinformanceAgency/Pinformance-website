import { NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { recomputeStatuses } from "@/lib/organic/status";
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
  if (body.status === "DONE" && !(typeof body.time_spent_min === "number" && body.time_spent_min > 0)) {
    return NextResponse.json(
      { error: "time_spent_min (positive number) is required when marking DONE" },
      { status: 400 }
    );
  }
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
  const cur = await pool.query<{ org_id: string; started_at: string | null }>(
    `SELECT org_id::text, started_at FROM organic.client_tasks WHERE id = $1`,
    [taskId]
  );
  if (cur.rowCount === 0) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  const { org_id, started_at } = cur.rows[0];

  const nowIso = new Date().toISOString();
  if (body.status === "DONE") {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status='DONE'::organic.task_status,
              completed_at = $1::timestamptz,
              started_at   = COALESCE(started_at, $1::timestamptz),
              time_spent_min = $2,
              notes = COALESCE($3, notes),
              skip_reason = NULL, skip_note = NULL
        WHERE id = $4`,
      [nowIso, body.time_spent_min, body.notes ?? null, taskId]
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

  const { updated } = await recomputeStatuses(org_id);
  return NextResponse.json({ ok: true, recomputed: updated });
}
