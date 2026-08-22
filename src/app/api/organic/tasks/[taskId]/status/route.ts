import { NextResponse } from "next/server";
import { organicDb } from "@/lib/organic/db";
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

  const db = organicDb();

  // Read current row to know the org (needed for recompute) and to timestamp
  // start/completion transitions.
  const { data: current, error: readErr } = await db
    .from("client_tasks")
    .select("id, org_id, status, started_at")
    .eq("id", taskId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const patch: Record<string, unknown> = { status: body.status };
  if (body.status === "IN_PROGRESS" && !current.started_at) {
    patch.started_at = new Date().toISOString();
  }
  if (body.status === "DONE") {
    patch.completed_at = new Date().toISOString();
    patch.time_spent_min = body.time_spent_min;
    if (!current.started_at) patch.started_at = patch.completed_at;
  }

  const { error: updErr } = await db.from("client_tasks").update(patch).eq("id", taskId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const { updated } = await recomputeStatuses(current.org_id as string);
  return NextResponse.json({ ok: true, recomputed: updated });
}
