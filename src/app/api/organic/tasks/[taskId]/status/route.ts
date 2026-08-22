import { NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { recomputeStatuses } from "@/lib/organic/status";
import type { TaskStatus } from "@/lib/organic/types";

export const runtime = "nodejs";

const ALLOWED: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];

interface Body {
  status: TaskStatus;
  time_spent_min?: number;
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

  const pool = organicPool();

  const cur = await pool.query<{ org_id: string; started_at: string | null }>(
    `SELECT org_id::text, started_at
       FROM organic.client_tasks WHERE id = $1`,
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
          SET status = $1::organic.task_status,
              completed_at = $2::timestamptz,
              started_at = COALESCE(started_at, $2::timestamptz),
              time_spent_min = $3,
              completed_by = NULL
        WHERE id = $4`,
      [body.status, nowIso, body.time_spent_min, taskId]
    );
  } else if (body.status === "IN_PROGRESS" && !started_at) {
    await pool.query(
      `UPDATE organic.client_tasks
          SET status = $1::organic.task_status, started_at = $2::timestamptz
        WHERE id = $3`,
      [body.status, nowIso, taskId]
    );
  } else {
    await pool.query(
      `UPDATE organic.client_tasks SET status = $1::organic.task_status WHERE id = $2`,
      [body.status, taskId]
    );
  }

  const { updated } = await recomputeStatuses(org_id);
  return NextResponse.json({ ok: true, recomputed: updated });
}
