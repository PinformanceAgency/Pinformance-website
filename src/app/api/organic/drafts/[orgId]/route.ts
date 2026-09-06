/**
 * Read / write / drop the unsaved draft for one form.
 *
 * POST-with-action rather than REST verbs, because the browser's
 * `navigator.sendBeacon` on pagehide can only POST — and that path is the one
 * that has to work when a tab is being closed mid-form.
 */
import { NextResponse } from "next/server";
import { saveDraft, loadDraft, clearDraft, loadDraftIndex } from "@/lib/organic/drafts";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as {
    action?: string; task_id?: string; payload?: unknown; updated_by?: string;
  };
  const taskId = String(body.task_id ?? "");
  try {
    switch (body.action) {
      case "save":
        if (!taskId) throw new Error("task_id required");
        return NextResponse.json({ ok: true, ...(await saveDraft(orgId, taskId, body.payload, body.updated_by)) });
      case "load":
        if (!taskId) throw new Error("task_id required");
        return NextResponse.json({ ok: true, draft: await loadDraft(orgId, taskId) });
      case "clear":
        if (!taskId) throw new Error("task_id required");
        await clearDraft(orgId, taskId);
        return NextResponse.json({ ok: true });
      case "index":
        return NextResponse.json({ ok: true, drafts: await loadDraftIndex(orgId) });
      default:
        throw new Error(`unknown action: ${body.action}`);
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
