"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The two things the boards library could not do.
 *
 * It was read-only, which is fine while every board is one the method
 * designed and created. It stops being fine the moment P3.3.5 cannot create
 * one: Roha Home's "Bathroom Organization Ideas" already existed on the
 * client's account, so the create failed on every run, the row stayed in the
 * queue, and P3.3.6 stayed blocked behind it — with no control anywhere to
 * link it to the real board or take it out of the plan.
 *
 * `adoptExistingBoards` now matches an exact name automatically. These are
 * for everything it will not guess at: a client board named slightly
 * differently, and a planned board that should never have been designed.
 *
 * The account list is fetched once per page rather than once per row — it is
 * a Pinterest round trip, and a library on a real store has fifty rows.
 */

interface AccountBoard {
  id: string; name: string; privacy: string; pins: number; linked_to: string | null;
}

let cache: { orgId: string; promise: Promise<AccountBoard[]> } | null = null;

async function accountBoards(orgId: string): Promise<AccountBoard[]> {
  if (cache?.orgId === orgId) return cache.promise;
  const promise = (async () => {
    const res = await fetch(`/api/organic/phase3/${orgId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "account_boards" }),
      redirect: "error",
    });
    const data = await res.json() as { boards?: AccountBoard[]; unreachable?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (data.unreachable) throw new Error(data.unreachable);
    return data.boards ?? [];
  })();
  cache = { orgId, promise };
  // A failed fetch must not be cached — the token gets reconnected and the
  // next click has to be able to try again.
  promise.catch(() => { if (cache?.promise === promise) cache = null; });
  return promise;
}

async function post(orgId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/organic/phase3/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* keep raw */ }
  if (!res.ok) throw new Error((data.error as string) ?? `HTTP ${res.status} — ${raw.slice(0, 160)}`);
  return data;
}

export function BoardActions({
  orgId, boardId, boardName, linked,
}: {
  orgId: string; boardId: string; boardName: string; linked: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [options, setOptions] = useState<AccountBoard[] | null>(null);
  const [filter, setFilter] = useState("");

  async function openPicker() {
    setErr(null); setOpen(true);
    if (options) return;
    setBusy(true);
    try { setOptions(await accountBoards(orgId)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function link(target: AccountBoard) {
    if (target.linked_to) {
      setErr(`"${target.name}" is already linked to "${target.linked_to}".`);
      return;
    }
    setErr(null); setBusy(true);
    try {
      await post(orgId, { action: "link_board", board_id: boardId, pinterest_board_id: target.id });
      cache = null;
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(
      `Remove "${boardName}" from this store's board library?\n\n` +
      `Only the row goes. Nothing is deleted on Pinterest, and a board a cycle ` +
      `is pinning onto cannot be removed at all.`
    )) return;
    setErr(null); setBusy(true);
    try {
      await post(orgId, { action: "remove_board", board_id: boardId });
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const shown = (options ?? []).filter(
    (b) => !filter || b.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="relative">
      <div className="flex items-center justify-end gap-1.5">
        {!linked && (
          <button type="button" onClick={openPicker} disabled={busy}
                  title="Point this at a board that already exists on the account"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[length:var(--text-o-label)] text-o-ink-3 hover:bg-o-sunk hover:text-o-ink-2 disabled:opacity-50">
            <Link2 className="h-3.5 w-3.5" /> Link
          </button>
        )}
        <button type="button" onClick={remove} disabled={busy}
                title="Take this row out of the library"
                aria-label={`Remove ${boardName} from the library`}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[length:var(--text-o-label)] text-o-ink-3 hover:bg-o-neg/[0.08] hover:text-o-neg disabled:opacity-50">
          {busy && !open ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {err && (
        <p className="mt-1 max-w-[22rem] text-right text-[length:var(--text-o-label)] leading-snug text-o-neg" role="alert">
          {err}
        </p>
      )}

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[24rem] rounded-[10px] border border-o-hairline-firm bg-o-surface p-3 text-left o-card-raised">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="o-eyebrow">Link “{boardName}” to</span>
            <button type="button" onClick={() => setOpen(false)}
                    className="text-o-ink-3 hover:text-o-ink-2"><X className="h-3.5 w-3.5" /></button>
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
                 placeholder="Search the account's boards"
                 className="o-input mb-2 w-full text-xs" />
          {busy && <p className="py-2 text-xs text-o-ink-3">Reading the account…</p>}
          {!busy && shown.length === 0 && (
            <p className="py-2 text-xs text-o-ink-3">
              {options === null ? "—" : "No board on the account matches."}
            </p>
          )}
          <ul className="max-h-64 divide-y divide-o-hairline overflow-y-auto">
            {shown.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => link(b)} disabled={busy || !!b.linked_to}
                        className={cn(
                          "flex w-full items-baseline justify-between gap-3 px-1 py-2 text-left text-xs",
                          b.linked_to ? "cursor-not-allowed opacity-45" : "hover:bg-o-sunk"
                        )}>
                  <span className="min-w-0 flex-1 truncate text-o-ink">{b.name}</span>
                  <span className="shrink-0 o-num text-[10px] text-o-ink-3">
                    {b.privacy.toLowerCase()} · {b.pins}
                  </span>
                </button>
                {b.linked_to && (
                  <p className="px-1 pb-1.5 text-[10px] text-o-ink-3">already linked to “{b.linked_to}”</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
