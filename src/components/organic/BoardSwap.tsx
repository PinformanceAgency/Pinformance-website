"use client";

/**
 * Eén board van een lopende cyclus vervangen.
 *
 * Hiervoor was het enige antwoord op "dit board deugt niet" de hele waterfall
 * opnieuw genereren, en dat kost precies wat een waterfall ís: de spreiding
 * over weken, de boardrotatie en de zestien datums — bij een RUNNING cyclus
 * worden er ook echt ingeplande pins voor gecancelled. Fit Cherries heeft twee
 * cycli lopen waarvan er in allebei een board zit dat bij de opzet verkeerd is
 * gekozen, en dat weghalen kon alleen door beide over te doen. De Remove-knop
 * in de bibliotheek weigert bovendien (terecht) zolang een lopende cyclus erop
 * pint. Dit is de stap die daartussen ontbrak.
 *
 * Drie dingen die dit scherm bewust wél doet:
 *
 *   - **Het zegt wat er blijft staan.** Wat al gepubliceerd is verhuist niet:
 *     die pin bestaat op Pinterest, op dat board. Hem daar weghalen is een
 *     besluit over het account van de klant.
 *   - **Een board dat niet kan, staat er mét de reden** in plaats van dat het
 *     uit de lijst valt. Een keuzelijst waar het board dat je zoekt niet in
 *     staat leest als een defect, en de reden is elke keer iets anders.
 *   - **Er wordt niets afgekapt en er is een zoekveld.** Fit Cherries heeft
 *     tweeënvijftig boards; een lijst die stil bij vijftig ophoudt is hier al
 *     een keer een dure fout geweest.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Current = { board_id: string; name: string; pins: number; movable: number; published: number };
type Option = { board_id: string; name: string; live: boolean; pin_count: number; blocked: string | null };
type State = { current: Current[]; options: Option[] };
type Done = {
  from: string; to: string; moved: number;
  left_published: Array<{ sequence_number: number; scheduled_date: string }>;
  assignment: "moved" | "removed" | "untouched";
};

export function BoardSwap({ orgId, waterfallId }: { orgId: string; waterfallId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/organic/phase4/${orgId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), redirect: "error",
    });
    const raw = await res.text();
    let d: { error?: string } & Record<string, unknown> = {};
    try { d = JSON.parse(raw); } catch { /* keep raw */ }
    if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status} — ${raw.slice(0, 160)}`);
    return d;
  }

  async function load() {
    setErr(null); setBusy("load"); setDone(null);
    try {
      const d = await post({ action: "board_swap_state", waterfall_id: waterfallId });
      setState(d.swap as State);
      setOpen(true);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function swap() {
    if (!from || !to) return;
    setErr(null); setBusy("swap");
    try {
      const d = await post({
        action: "swap_board", waterfall_id: waterfallId,
        from_board_id: from, to_board_id: to,
      });
      setDone(d as unknown as Done);
      setState(null); setFrom(null); setTo(null); setQ(""); setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  const fromRow = state?.current.find((c) => c.board_id === from) ?? null;
  const toRow = state?.options.find((o) => o.board_id === to) ?? null;
  const visible = (state?.options ?? []).filter(
    (o) => o.board_id !== from && o.name.toLowerCase().includes(q.trim().toLowerCase())
  );
  const hidden = (state?.options.length ?? 0) - visible.length - (from ? 1 : 0);

  if (!open) {
    return (
      <div className="rounded-md border border-neutral-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-neutral-600">
            <span className="font-medium text-neutral-800">Replace a board in this cycle.</span>{" "}
            Every pin that has not gone out yet moves across. The dates, designs and copy stay
            as they are — regenerating the waterfall is what throws those away.
          </div>
          <button type="button" onClick={load} disabled={busy !== null}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-neutral-300
                       px-2.5 py-1.5 text-[11px] font-semibold hover:bg-neutral-50 disabled:opacity-50">
            {busy === "load" ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                             : <ArrowLeftRight className="w-3.5 h-3.5" />}
            Replace a board
          </button>
        </div>

        {done && (
          <p className="mt-2 text-[11px] text-emerald-700">
            Moved {done.moved} pin{done.moved === 1 ? "" : "s"} from{" "}
            <span className="font-medium">{done.from}</span> to{" "}
            <span className="font-medium">{done.to}</span>.
            {done.left_published.length > 0 && (
              <> {done.left_published.length} pin{done.left_published.length === 1 ? "" : "s"} already
              published stayed on {done.from} (#{done.left_published.map((p) => p.sequence_number).join(", #")})
              — those exist on Pinterest, on that board.</>
            )}
            {done.assignment !== "untouched" && (
              <> The URL&rsquo;s board assignment followed, so the next cycle will not pick {done.from} again.</>
            )}
          </p>
        )}
        {err && <p className="mt-2 text-[11px] text-red-600" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-neutral-300 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-800">Replace a board in this cycle</p>
        <button type="button" onClick={() => { setOpen(false); setFrom(null); setTo(null); setErr(null); }}
          className="text-[11px] text-neutral-500 hover:text-neutral-800">Cancel</button>
      </div>

      {/* Stap 1 — welk board eruit. De aantallen staan erbij omdat "al uit"
          het enige is wat niet meeverhuist, en dat moet je zien vóór je kiest. */}
      <div>
        <p className="text-[11px] font-medium text-neutral-700">1 · Which board comes out</p>
        <div className="mt-1 space-y-1">
          {(state?.current ?? []).map((c) => (
            <label key={c.board_id}
              className={cn("flex items-center gap-2 rounded border px-2 py-1.5 text-[11px] cursor-pointer",
                from === c.board_id ? "border-neutral-800 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50")}>
              <input type="radio" name="swap-from" checked={from === c.board_id}
                onChange={() => { setFrom(c.board_id); if (to === c.board_id) setTo(null); }} />
              <span className="font-medium text-neutral-800">{c.name}</span>
              <span className="ml-auto text-neutral-500">
                {c.movable} to move
                {c.published > 0 && <span className="text-amber-700"> · {c.published} already out</span>}
              </span>
            </label>
          ))}
        </div>
        {fromRow && fromRow.movable === 0 && (
          <p className="mt-1 text-[11px] text-amber-700">
            Every pin on {fromRow.name} has already gone out, so there is nothing left to move.
            Taking those down is a decision about the client&rsquo;s account.
          </p>
        )}
      </div>

      {/* Stap 2 — waarheen. Geblokkeerde boards blijven staan, met de reden. */}
      <div>
        <p className="text-[11px] font-medium text-neutral-700">2 · Which board takes its place</p>
        <div className="mt-1 flex items-center gap-1.5 rounded border border-neutral-200 px-2 py-1">
          <Search className="w-3 h-3 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search boards"
            className="w-full text-[11px] outline-none" />
        </div>
        <div className="mt-1 max-h-56 overflow-y-auto space-y-0.5">
          {visible.map((o) => (
            <button key={o.board_id} type="button" disabled={o.blocked !== null}
              onClick={() => setTo(o.board_id)}
              className={cn("w-full text-left rounded border px-2 py-1.5 text-[11px]",
                o.blocked !== null
                  ? "border-neutral-100 bg-neutral-50 cursor-not-allowed"
                  : to === o.board_id ? "border-neutral-800 bg-neutral-50" : "border-neutral-200 hover:bg-neutral-50")}>
              <span className={cn("font-medium", o.blocked ? "text-neutral-400" : "text-neutral-800")}>{o.name}</span>
              <span className="ml-2 text-neutral-400">{o.pin_count} pins</span>
              {o.blocked && <span className="block text-neutral-500">{o.blocked}</span>}
            </button>
          ))}
          {visible.length === 0 && (
            <p className="px-2 py-1.5 text-[11px] text-neutral-500">No board matches &ldquo;{q}&rdquo;.</p>
          )}
        </div>
        {hidden > 0 && q.trim() !== "" && (
          <p className="mt-1 text-[11px] text-neutral-500">{hidden} more board(s) hidden by the search.</p>
        )}
      </div>

      {/* Stap 3 — bevestigen, met het aantal erin. Dit verandert een plan dat
          al loopt, dus de knop zegt wat hij gaat doen en niet "Save". */}
      <div className="flex items-center gap-2 border-t border-neutral-200 pt-2">
        <button type="button" disabled={!from || !to || busy !== null || (fromRow?.movable ?? 0) === 0}
          onClick={swap}
          className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1.5
                     text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40">
          {busy === "swap" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {from && to && fromRow && toRow
            ? `Move ${fromRow.movable} pin${fromRow.movable === 1 ? "" : "s"} to ${toRow.name}`
            : "Pick both boards"}
        </button>
        {fromRow && fromRow.published > 0 && to && (
          <span className="text-[11px] text-amber-700">
            {fromRow.published} published pin{fromRow.published === 1 ? "" : "s"} stay on {fromRow.name}.
          </span>
        )}
      </div>

      {err && <p className="text-[11px] text-red-600" role="alert">{err}</p>}
    </div>
  );
}
