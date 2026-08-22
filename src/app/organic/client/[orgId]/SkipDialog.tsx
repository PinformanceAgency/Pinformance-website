"use client";

import { useState } from "react";
import { SKIP_REASON_LABELS, type SkipReason } from "@/lib/organic/types";

export function SkipDialog({
  taskName,
  onCancel,
  onConfirm,
}: {
  taskName: string;
  onCancel: () => void;
  onConfirm: (reason: SkipReason, note: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState<SkipReason | "">("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    if (!reason) { setErr("Pick a reason."); return; }
    if (reason === "OTHER" && !note.trim()) { setErr("A note is required when picking Other."); return; }
    setErr(null);
    setSubmitting(true);
    try { await onConfirm(reason, note); }
    catch (e) { setErr((e as Error).message); setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-neutral-900">Skip task</h3>
        <p className="mt-1 text-xs text-neutral-500 break-words">
          Reason for skipping &ldquo;{taskName}&rdquo;. Skipped tasks do not satisfy preconditions.
        </p>
        <div className="mt-3 space-y-1.5">
          {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((r) => (
            <label key={r} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs cursor-pointer ${reason === r ? "border-neutral-800 bg-neutral-100" : "border-neutral-200 hover:bg-neutral-50"}`}>
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              <span>{SKIP_REASON_LABELS[r]}</span>
            </label>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={reason === "OTHER" ? "Note (required)" : "Note (optional)"}
          className="mt-3 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
        />
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 hover:bg-neutral-50">Cancel</button>
          <button onClick={confirm} disabled={submitting} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50">
            {submitting ? "Skipping…" : "Skip task"}
          </button>
        </div>
      </div>
    </div>
  );
}
