"use client";

/**
 * Publiceren stilzetten zonder de planning te verliezen.
 *
 * Er was hiervoor geen knop, en de enige uitweg was pins cancellen — waarmee
 * de spreiding over weken, de boardrotatie en de datums van een hele cyclus
 * verdwijnen. Dat is precies wat je niet wil als de reden is "de creatives
 * moeten beter": je wil de creatives vervangen, niet het plan.
 *
 * Twee schalen, één component:
 *
 *   scope="store"  de hele store. De grote schakelaar.
 *   scope="cycle"  één cyclus. Dit is het geval dat zich echt voordoet — Fit
 *                  Cherries publiceert uit twee cycli tegelijk, en een pauze op
 *                  store-niveau zet ook de goede stil.
 *
 * De reden is verplicht bij het stilzetten en niet bij het weer aanzetten. Een
 * stille store zonder reden is precies het scherm waar de volgende persoon een
 * uur op zoekt, en het staat op de kalender, in P4.4.2 en in de cron-uitvoer.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PublishingPause({
  orgId, scope, urlId, pausedAt, reason, heldPins,
}: {
  orgId: string;
  scope: "store" | "cycle";
  /** Alleen bij scope="cycle". */
  urlId?: string;
  /** ISO-datum, of null als er niets stilstaat. */
  pausedAt: string | null;
  reason: string | null;
  /** Hoeveel pins er nu wachten. Alleen ter informatie. */
  heldPins?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const paused = pausedAt != null;
  const what = scope === "store" ? "this store" : "this cycle";

  async function send(next: boolean, text?: string) {
    setErr(null); setBusy(true);
    try {
      const res = await fetch(`/api/organic/phase4/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(
          scope === "store"
            ? { action: "pause_store", paused: next, reason: text }
            : { action: "pause_cycle", url_id: urlId, paused: next, reason: text }
        ),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOpen(false); setWhy("");
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (paused) {
    return (
      <div className="rounded-lg bg-o-accent/[0.07] ring-1 ring-inset ring-o-clay/25 px-3.5 py-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <Pause className="w-4 h-4 text-o-clay shrink-0" />
          Publishing is paused for {what} since {pausedAt.slice(0, 10)}
        </p>
        {reason && <p className="mt-1 text-sm text-o-ink-2">{reason}</p>}
        <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
          {heldPins != null && heldPins > 0
            ? `${heldPins} pin${heldPins === 1 ? "" : "s"} whose date has arrived are waiting. `
            : ""}
          Nothing is lost: the dates, the boards and the spread stay as they are, and each pin goes
          out on its own date once this comes off.
        </p>
        <button type="button" onClick={() => void send(false)} disabled={busy}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                     px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {busy ? "Resuming…" : "Resume publishing"}
        </button>
        {err && <p className="mt-2 text-xs text-o-neg break-words" role="alert">{err}</p>}
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                     px-2.5 py-1.5 rounded-md border border-o-hairline text-muted-foreground
                     hover:text-foreground hover:bg-o-sunk">
          <Pause className="w-3.5 h-3.5" />
          Pause publishing{scope === "cycle" ? " for this cycle" : ""}
        </button>
      ) : (
        <div className="rounded-lg bg-o-surface ring-1 ring-inset ring-o-hairline px-3.5 py-3">
          <p className="text-sm font-medium text-foreground">Pause publishing for {what}</p>
          <p className="mt-1 text-[length:var(--text-o-label)] text-o-ink-3">
            The plan stays exactly as it is. Scheduled pins are held, not cancelled, and they go out
            on their own dates once you resume.
          </p>
          <textarea
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
            placeholder="Why — the next person reads this. For example: replacing the creatives, they were too plain."
            className={cn(
              "mt-2 w-full rounded-md border border-o-hairline bg-background px-2.5 py-2",
              "text-sm placeholder:text-o-ink-3 focus:outline-none focus:ring-1 focus:ring-o-accent/40"
            )}
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void send(true, why)} disabled={busy || !why.trim()}
              className="inline-flex items-center gap-1.5 text-[length:var(--text-o-label)] font-semibold
                         px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              {busy ? "Pausing…" : "Pause"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr(null); }} disabled={busy}
              className="text-[length:var(--text-o-label)] text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            {/* De knop is uit zolang er geen reden staat, en zegt waarom — een
                dode knop zonder uitleg is in dit project drie keer als "hij
                doet niets" teruggekomen. */}
            {!why.trim() && (
              <span className="text-[length:var(--text-o-label)] text-o-ink-3">
                a reason is required
              </span>
            )}
          </div>
          {err && <p className="mt-2 text-xs text-o-neg break-words" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
