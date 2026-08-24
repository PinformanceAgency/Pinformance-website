"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Paperclip, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where the work on a task actually gets recorded.
 *
 * This replaces a bare `+` icon whose only explanation was a title
 * attribute. Two things were wrong with that: nobody could tell what it
 * did without hovering, and there was no way to write a note at all
 * unless you were finishing or skipping the task — so findings ended up
 * in Slack instead of against the step that produced them.
 *
 * Now every task carries a visible work panel: what has been written, what
 * has been attached, and two labelled buttons to add either. It is always
 * on screen, never behind an icon.
 */

export interface TaskAsset {
  id: string;
  title: string;
  url: string;
  uploaded_at: string;
}

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 " +
  "text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50";

const primaryBtn =
  "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold " +
  "text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50";

export function TaskWork({
  orgId, clientTaskId, taskId, taskName, notes, assets, readOnly,
}: {
  orgId: string;
  /** The row id — what the API writes against. */
  clientTaskId: string;
  /** The definition id, e.g. P1.2.1 — what assets are linked to. */
  taskId: string;
  taskName: string;
  notes: string | null;
  assets: TaskAsset[];
  /** Blocked tasks can still be read, but not written to. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "note" | "doc">("idle");
  const [draft, setDraft] = useState(notes ?? "");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  async function call(url: string, init: RequestInit) {
    setErr(null); setBusy(true);
    try {
      const res = await fetch(url, { ...init, redirect: "error" });
      // Text first: an HTML error page thrown into res.json() disappears
      // as a swallowed SyntaxError and the user sees nothing happen.
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(text); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.slice(0, 140)}`);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    const ok = await call(`/api/organic/tasks/${clientTaskId}/notes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes: draft }),
    });
    if (ok) { setMode("idle"); refresh(); }
  }

  async function saveDoc() {
    if (!docUrl.trim()) { setErr("Paste a link to the document first."); return; }
    const ok = await call(`/api/organic/assets/${orgId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: docTitle.trim() || `${taskId} — document`,
        url: docUrl.trim(), type: "OTHER", linked_task_id: taskId,
      }),
    });
    if (ok) { setDocTitle(""); setDocUrl(""); setMode("idle"); refresh(); }
  }

  async function removeDoc(assetId: string) {
    const ok = await call(`/api/organic/assets/${orgId}?id=${encodeURIComponent(assetId)}`, {
      method: "DELETE",
    });
    if (ok) refresh();
  }

  const hasWork = !!notes || assets.length > 0;

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
          Your work on this task
        </span>
        {!hasWork && mode === "idle" && (
          <span className="text-[11px] text-muted-foreground">
            Nothing recorded yet
          </span>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* ---- what is already recorded --------------------------- */}
        {notes && mode !== "note" && (
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="flex items-start gap-2">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="flex-1 text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                {notes}
              </p>
              {!readOnly && (
                <button type="button" onClick={() => { setDraft(notes); setMode("note"); }}
                  className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                  title="Edit this note">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {assets.length > 0 && (
          <ul className="space-y-1">
            {assets.map((a) => (
              <li key={a.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <a href={a.url} target="_blank" rel="noreferrer"
                   className="flex-1 min-w-0 text-xs text-primary hover:underline truncate">
                  {a.title}
                </a>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {a.uploaded_at.slice(0, 10)}
                </span>
                <a href={a.url} target="_blank" rel="noreferrer"
                   className="text-muted-foreground hover:text-foreground shrink-0" title="Open">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {!readOnly && (
                  <button type="button" onClick={() => removeDoc(a.id)} disabled={busy}
                    className="text-muted-foreground hover:text-red-600 shrink-0" title="Remove">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* ---- note editor ---------------------------------------- */}
        {mode === "note" && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-foreground">
              What did you find or decide on &ldquo;{taskName}&rdquo;?
            </label>
            <textarea
              autoFocus
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type what you did, what you found, or what you decided. Paste any link and it is saved to the library automatically."
              className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveNote} disabled={busy} className={primaryBtn}>
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {busy ? "Saving…" : "Save note"}
              </button>
              <button type="button" onClick={() => { setDraft(notes ?? ""); setMode("idle"); setErr(null); }}
                      className={btn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ---- document form -------------------------------------- */}
        {mode === "doc" && (
          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-foreground">
              Link a document for &ldquo;{taskName}&rdquo;
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Name (optional)"
                className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary/60" />
              <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
                autoFocus
                placeholder="https://docs.google.com/… or any link"
                className="sm:col-span-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary/60" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Paste a Google Doc, Sheet, Drive file, Figma board or any URL. It appears here
              and in the store&rsquo;s Assets library, linked to this task.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDoc} disabled={busy} className={primaryBtn}>
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {busy ? "Saving…" : "Save document"}
              </button>
              <button type="button" onClick={() => { setMode("idle"); setErr(null); }} className={btn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ---- the two visible actions ---------------------------- */}
        {mode === "idle" && !readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setDraft(notes ?? ""); setMode("note"); }}
                    className={btn}>
              <FileText className="w-3.5 h-3.5" />
              {notes ? "Edit note" : "Add note"}
            </button>
            <button type="button" onClick={() => setMode("doc")} className={btn}>
              <Paperclip className="w-3.5 h-3.5" />
              Attach document
            </button>
          </div>
        )}

        {readOnly && !hasWork && (
          <p className="text-[11px] text-muted-foreground">
            This task is blocked. Notes and documents can be added once it is unblocked.
          </p>
        )}

        {err && (
          <p className={cn("text-[11px] text-red-600 break-words")} role="alert">
            Could not save: {err}
          </p>
        )}
      </div>
    </div>
  );
}
