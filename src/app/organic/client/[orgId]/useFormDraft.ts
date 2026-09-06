"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeps what somebody has typed into a form somewhere other than this tab.
 *
 * The phase-2 forms are long — the grid is a card per keyword, the top-pin
 * list is ten rows of five fields — and all of it lived in React state until
 * the one Save button at the bottom succeeded. A refused save, a crashed
 * render or a closed tab took every keystroke with it (Fit Cherries,
 * 06-09-2026: a full day of market research, and nothing on any screen even
 * knew it had existed).
 *
 * Two places, on purpose:
 *  - `localStorage`, written on every keystroke, so a crash or a reload one
 *    second later still has it. Costs nothing and needs no network.
 *  - `organic.form_drafts`, debounced, so a different machine — or a tab that
 *    never comes back — can still recover it, and so a colleague can see the
 *    work exists.
 *
 * A draft is never the record. It is applied on mount with a visible banner
 * saying where it came from, and it is deleted the moment a real save lands.
 */

export interface FormDraft {
  /** When the restored draft was last written, if one was restored. */
  restoredAt: string | null;
  /** Last time this hook persisted anything, for the "saved …" hint. */
  savedAt: string | null;
  status: "idle" | "saving" | "error";
  /** Throw the draft away without saving it (the operator's call). */
  discard: () => void;
  /** The real save landed — the draft has served its purpose. */
  clear: () => Promise<void>;
}

const DEBOUNCE_MS = 1200;

function lsKey(orgId: string, taskId: string) {
  return `organic-draft:${orgId}:${taskId}`;
}

function readLocal(orgId: string, taskId: string): { payload: unknown; updated_at: string } | null {
  try {
    const raw = window.localStorage.getItem(lsKey(orgId, taskId));
    return raw ? (JSON.parse(raw) as { payload: unknown; updated_at: string }) : null;
  } catch { return null; }
}

function writeLocal(orgId: string, taskId: string, payload: unknown) {
  try {
    window.localStorage.setItem(lsKey(orgId, taskId),
      JSON.stringify({ payload, updated_at: new Date().toISOString() }));
  } catch { /* private window, quota — the server copy still runs */ }
}

function dropLocal(orgId: string, taskId: string) {
  try { window.localStorage.removeItem(lsKey(orgId, taskId)); } catch { /* ignore */ }
}

async function post(orgId: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`/api/organic/drafts/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export function useFormDraft<T extends object>(
  orgId: string,
  taskId: string,
  state: T,
  apply: (draft: Partial<T>) => void,
  /** Hold the restore until the form has finished loading its own rows —
   *  otherwise an async load lands after the draft and silently wins. */
  opts?: { enabled?: boolean },
): FormDraft {
  const enabled = opts?.enabled !== false;
  const serialized = JSON.stringify(state);

  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<FormDraft["status"]>("idle");

  // What the form looked like at mount. Only a change from this is worth
  // storing, so merely opening a form writes nothing anywhere.
  const initialRef = useRef(serialized);
  const lastPersistedRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  // While the form is still fetching its own rows, whatever is on screen is a
  // placeholder — that, not the empty first render, is the baseline a draft
  // has to differ from.
  if (!readyRef.current && !enabled) initialRef.current = serialized;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serializedRef = useRef(serialized);
  serializedRef.current = serialized;

  // ---- restore ------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const local = readLocal(orgId, taskId);
      let remote: { payload: unknown; updated_at: string } | null = null;
      try {
        const r = (await post(orgId, { action: "load", task_id: taskId })) as
          { draft: { payload: unknown; updated_at: string } | null };
        remote = r.draft ?? null;
      } catch { /* offline or a 400 — the local copy is still worth having */ }

      const best = !local ? remote
        : !remote ? local
        : new Date(local.updated_at) > new Date(remote.updated_at) ? local : remote;

      if (!alive) { readyRef.current = true; return; }
      if (best && best.payload && typeof best.payload === "object") {
        const draftJson = JSON.stringify(best.payload);
        if (draftJson !== initialRef.current) {
          lastPersistedRef.current = draftJson;
          applyRef.current(best.payload as Partial<T>);
          setRestoredAt(best.updated_at);
        }
      }
      readyRef.current = true;
    })();
    return () => { alive = false; };
  }, [orgId, taskId, enabled]);

  // ---- persist ------------------------------------------------------------
  useEffect(() => {
    if (!readyRef.current) return;
    if (serialized === initialRef.current && lastPersistedRef.current === null) return;
    if (serialized === lastPersistedRef.current) return;

    writeLocal(orgId, taskId, JSON.parse(serialized));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setStatus("saving");
      try {
        const r = (await post(orgId, {
          action: "save", task_id: taskId, payload: JSON.parse(serialized),
        })) as { updated_at: string };
        lastPersistedRef.current = serialized;
        setSavedAt(r.updated_at);
        setStatus("idle");
      } catch {
        // The localStorage copy already landed; a failed round-trip must not
        // interrupt somebody who is typing.
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [serialized, orgId, taskId]);

  // ---- last chance, when the tab is going away ----------------------------
  useEffect(() => {
    function flush() {
      if (!readyRef.current) return;
      const current = serializedRef.current;
      if (current === lastPersistedRef.current) return;
      if (current === initialRef.current && lastPersistedRef.current === null) return;
      writeLocal(orgId, taskId, JSON.parse(current));
      try {
        navigator.sendBeacon?.(
          `/api/organic/drafts/${orgId}`,
          new Blob([JSON.stringify({ action: "save", task_id: taskId, payload: JSON.parse(current) })],
            { type: "application/json" })
        );
      } catch { /* ignore */ }
    }
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [orgId, taskId]);

  const forget = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    lastPersistedRef.current = serializedRef.current;
    dropLocal(orgId, taskId);
    setRestoredAt(null);
    setSavedAt(null);
    try { await post(orgId, { action: "clear", task_id: taskId }); } catch { /* ignore */ }
  }, [orgId, taskId]);

  const discard = useCallback(() => {
    // Only the stored copy goes; what is on screen is the operator's to keep
    // or overwrite. Re-seeding the form from the snapshot here would be a
    // second way to lose work.
    void forget();
  }, [forget]);

  return { restoredAt, savedAt, status, discard, clear: forget };
}
