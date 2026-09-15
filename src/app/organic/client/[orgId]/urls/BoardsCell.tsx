"use client";

/**
 * Assigning boards to a URL, from the URLs library.
 *
 * The cycle gate asks two things of a URL: that its topic has five boards
 * live on Pinterest, and that the URL itself carries four. The first is
 * board building; the second is one decision that took ten seconds — and
 * until now it could only be made **inside a cycle**, on the setup panel of
 * a cycle you could not start because the boards were not assigned. A
 * circular gate: the blocker text said "assign boards on the URLs page", and
 * the URLs page had no such control.
 *
 * Roha Home, 15-09-2026: topic "Bathroom Organization" covered with five
 * live boards, all five URLs past their cooldown, and every one of them
 * stuck at `0 of 4 boards assigned`. The store was a single click from its
 * first cycle and there was nowhere to click.
 *
 * Only boards that exist on Pinterest are offered. A pin onto a board with
 * no `pinterest_board_id` is never returned by the publish query — it does
 * not fail, it simply never goes out — so offering one here would hand
 * somebody a cycle that cannot publish.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BoardOption {
  id: string;
  name: string;
  topic_id: string | null;
  topic_name: string | null;
  pin_count: number;
}

async function save(orgId: string, urlId: string, boardIds: string[]) {
  const res = await fetch(`/api/organic/phase4/${orgId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "assign_boards", url_id: urlId, board_ids: boardIds }),
    redirect: "error",
  });
  const raw = await res.text();
  let data: { error?: string } = {};
  try { data = JSON.parse(raw); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 160)}`);
}

export function BoardsCell({
  orgId, urlId, urlTopicId, assigned, assignedIds, boards, warning,
}: {
  orgId: string;
  urlId: string;
  urlTopicId: string | null;
  assigned: number;
  assignedIds: string[];
  boards: BoardOption[];
  /** Why this URL still cannot be selected, if the reason is not the boards. */
  warning: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(assignedIds);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The URL's own topic first: a board is chosen for the URL it will carry,
  // and an off-topic board is the deviation checkBoards() reports. Ordering
  // is not a filter — a manager may deliberately reach outside the topic.
  const sorted = useMemo(() => {
    const own = boards.filter((b) => urlTopicId && b.topic_id === urlTopicId);
    const rest = boards.filter((b) => !urlTopicId || b.topic_id !== urlTopicId);
    return [...own, ...rest];
  }, [boards, urlTopicId]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function commit() {
    setBusy(true); setErr(null);
    try {
      await save(orgId, urlId, picked);
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="relative inline-block text-right">
      <button
        type="button"
        onClick={() => { setPicked(assignedIds); setOpen((o) => !o); }}
        title="Assign the boards this URL pins onto"
        className={cn(
          "o-num rounded px-1.5 py-0.5 tabular-nums hover:bg-o-sunk",
          assigned >= 4 ? "text-o-ink" : "text-o-clay"
        )}
      >
        {assigned} of 4
      </button>
      {warning && <span className="ml-1 text-o-neg" title={warning}>!</span>}

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-[24rem] rounded-[10px] border border-o-hairline-firm bg-o-surface p-3 text-left o-card-raised">
          <p className="o-eyebrow mb-2">Boards this URL pins onto</p>
          {sorted.length === 0 ? (
            <p className="py-2 text-xs text-o-ink-3">
              No board of this store is on Pinterest yet. Boards are created three a night — the Boards
              page shows how many are still to come.
            </p>
          ) : (
            <>
              <ul className="max-h-64 divide-y divide-o-hairline overflow-y-auto">
                {sorted.map((b) => {
                  const on = picked.includes(b.id);
                  const onTopic = !!urlTopicId && b.topic_id === urlTopicId;
                  return (
                    <li key={b.id}>
                      <button type="button" onClick={() => toggle(b.id)}
                              className="flex w-full items-baseline gap-2 px-1 py-2 text-left text-xs hover:bg-o-sunk">
                        <span className={cn(
                          "mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                          on ? "border-o-accent bg-o-accent text-white" : "border-o-hairline-firm"
                        )}>
                          {on && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-o-ink">{b.name}</span>
                          <span className="block truncate text-[10px] text-o-ink-3">
                            {b.topic_name ?? "no topic"}
                            {!onTopic && urlTopicId && " · off topic"}
                            {" · "}{b.pin_count} pins
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={cn("text-[11px]", picked.length >= 4 ? "text-o-ink-3" : "text-o-clay")}>
                  {picked.length} picked{picked.length < 4 && " — the gate asks for four"}
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setOpen(false)}
                          className="o-btn o-btn-ghost px-2 py-1 text-xs">Cancel</button>
                  {/* Never disabled below four: fewer is a deliberate choice the
                      deviation panel reports, and a dead button with no reason
                      on it has been read as broken three times in this app. */}
                  <button type="button" onClick={commit} disabled={busy}
                          className="o-btn o-btn-primary px-2 py-1 text-xs">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {busy ? "Saving…" : "Save"}
                  </button>
                </span>
              </div>
            </>
          )}
          {err && <p className="mt-1.5 text-[11px] text-o-neg" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
