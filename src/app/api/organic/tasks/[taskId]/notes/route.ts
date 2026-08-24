import { NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { autoLinkAssetsFromText } from "@/lib/organic/assets-auto";

export const runtime = "nodejs";

/**
 * Save the working note on a task without touching its status.
 *
 * The status route already accepts `notes`, but only alongside a status
 * change — so the only way to record what you found was to finish the
 * task or skip it. That is backwards: notes are what you write *while*
 * the work is open, and forcing a status change to save them meant people
 * kept their findings somewhere else.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = (await req.json()) as { notes?: string | null };

  const pool = organicPool();
  const cur = await pool.query<{ org_id: string; task_id: string }>(
    `SELECT org_id::text, task_id FROM organic.client_tasks WHERE id = $1`,
    [taskId]
  );
  if (cur.rowCount === 0) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  // An empty note clears the field rather than storing "" — a blank note
  // and no note are the same thing to a reader, and only one of them
  // should exist in the column.
  const notes = body.notes?.trim() ? body.notes.trim() : null;

  await pool.query(
    `UPDATE organic.client_tasks SET notes = $1 WHERE id = $2`,
    [notes, taskId]
  );

  // Any URL pasted into the note becomes a linked asset, same as on
  // completion — so a link dropped in the note still turns up in the
  // Assets library instead of being buried in prose.
  const captured = notes
    ? await autoLinkAssetsFromText(cur.rows[0].org_id, cur.rows[0].task_id, notes)
    : [];

  return NextResponse.json({ ok: true, assets_captured: captured.length });
}
