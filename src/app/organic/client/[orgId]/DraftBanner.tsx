"use client";

import type { FormDraft } from "./useFormDraft";

/** Says, quietly and continuously, that what is on screen is not only on
 *  screen. Without it "your work is safe" is a claim nobody can check. */
export function DraftHint({ draft }: { draft?: FormDraft }) {
  if (!draft) return null;
  if (draft.status === "saving") return <span className="text-[10px] text-neutral-400">saving draft…</span>;
  if (draft.status === "error") {
    return <span className="text-[10px] text-amber-600">draft kept on this device only — no connection</span>;
  }
  if (draft.savedAt) {
    return (
      <span className="text-[10px] text-neutral-400">
        draft kept · {new Date(draft.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </span>
    );
  }
  return null;
}

export function DraftBanner({ draft }: { draft: FormDraft }) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900 flex items-center gap-2">
      <span className="flex-1">
        Restored what was typed here on{" "}
        {new Date(draft.restoredAt as string).toLocaleString("en-GB", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        })}{" "}
        and never saved. Check it, then save.
      </span>
      <button type="button" onClick={draft.discard}
        className="rounded border border-amber-400 px-1.5 py-0.5 text-[10px] font-medium hover:bg-amber-100">
        Discard draft
      </button>
    </div>
  );
}

