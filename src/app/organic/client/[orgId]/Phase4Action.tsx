"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Play, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CycleView } from "@/lib/organic/phase4";

/**
 * The control that does the work, per phase-4 task.
 *
 * Phases 1 to 3 are research: you found something, you write it down and
 * attach the document. Phase 4 is execution — boards get linked, keywords
 * get assigned, images get made, pins go live — and giving those tasks a
 * note box and an "attach document" button made the dashboard paperwork
 * about the work instead of the tool that does it. The manager left to do
 * the job somewhere else and came back to describe it.
 *
 * So each task renders its own action. Where a backend exists it runs it
 * here. Where one does not, it says so plainly and names the tool the work
 * happens in — which is honest, and unlike a note box it does not pretend
 * the task is finished when somebody types a sentence.
 */

export type ActionKind =
  /** Runs here, now. */
  | { kind: "run"; label: string; action: string; describe: string }
  /** The system already did it; this shows the result. */
  | { kind: "readout"; describe: string; href?: string; hrefLabel?: string }
  /** Done in the cycle panel above, which already has the control. */
  | { kind: "panel"; section: string; describe: string }
  /** Happens in an outside tool, then the result comes back in. */
  | { kind: "external"; tool: string; describe: string }
  /** Approve or reject each design or copy set. */
  | { kind: "qc"; mode: "design" | "copy"; describe: string }
  /** No control yet. Named rather than papered over. */
  | { kind: "missing"; describe: string; willDo: string };

/**
 * What each of the twenty-two tasks needs in order to be done.
 *
 * Written out task by task rather than derived from task_type, because
 * task_type says who acts, not what the control is: two AUTO tasks can
 * need a button and a read-out respectively, and both would be wrong with
 * a generic treatment.
 */
export const PHASE4_ACTIONS: Record<string, ActionKind> = {
  "P4.1.1": { kind: "readout",
    describe: "The candidate list is on the phase-4 page above, already filtered on cooldown, topic coverage and board assignment. Nothing to run." },
  "P4.1.2": { kind: "readout",
    describe: "Seasonal URLs surface automatically when their peak falls six to ten weeks out. Set the peak window on the URL if one is missing — publishing late is the most common failure there is." ,
    href: "urls", hrefLabel: "Open URLs" },
  "P4.1.3": { kind: "external", tool: "The client",
    describe: "Ask about launches and new blog posts, then add each one under URLs so it enters the candidate pool." },
  "P4.1.4": { kind: "panel", section: "Start new cycle",
    describe: "Pick a candidate and start its cycle. The readiness panel at the top of phase 4 ranks them and says why." },
  "P4.1.5": { kind: "panel", section: "1 · Setup",
    describe: "The reason dropdown in the cycle setup writes to the URL. Mandatory — it is the only record of why this month looked the way it did." },
  "P4.1.6": { kind: "panel", section: "1 · Setup",
    describe: "The keyword picker in the cycle setup. Ranks gridded terms first and drops client-forbidden ones." },
  "P4.1.7": { kind: "panel", section: "1 · Setup",
    describe: "The board picker in the cycle setup. Ranks by what has already won here, then topic, then the approved Steal List." },
  "P4.1.8": { kind: "panel", section: "1 · Setup",
    describe: "The non-primary keywords you assign become the overlay hooks. Pick ones that read as a phrase on an image." },

  "P4.2.1": { kind: "external", tool: "Pinterest search (incognito) or PinClicks",
    describe: "Search the primary keyword and record what page one rewards. Without a grid row the design brief falls back to the 80/20 default." },
  "P4.2.2": { kind: "panel", section: "2 · Design brief",
    describe: "Direct where the client has usable lifestyle material, AI where they do not. The brief and the image prompt both branch on it." },
  "P4.2.3": { kind: "run", label: "Generate the brief", action: "brief",
    describe: "Builds from the grid, the brand book, the taste graph and what has already won on this account." },
  "P4.2.4": { kind: "run", label: "Generate the four designs", action: "generate_designs",
    describe: "One image per design, each from its own prompt built from the visual worlds, the palette and the grid — so the four are genuinely distinct rather than four samples of one prompt. SAVE pins come out 2:3, CLICK pins 9:16. Takes a couple of minutes." },
  "P4.2.5": { kind: "run", label: "Cut the micro-crops", action: "generate_crops",
    describe: "Copy variant A keeps the original; B, C and D each take 96% of the frame from a different corner and scale back. That makes all four pins off one design read as four images while sharing one copy set — which is why four copy sets per URL is right and sixteen would be waste." },
  "P4.2.6": { kind: "readout",
    describe: "File names are generated lowercase, hyphenated and keyword-bearing. Check they survived the export — design tools rename on download." },
  "P4.2.7": { kind: "qc", mode: "design",
    describe: "Colours right, overlay rule respected, four genuinely different designs, file name correct. A rejection needs a reason — it is what the next generation gets corrected from." },
  "P4.2.8": { kind: "run", label: "Draft the copy", action: "generate_copy",
    describe: "Four copy sets, drafted from the brand book, the tone of voice and this account's own research. You approve them afterwards." },
  "P4.2.9": { kind: "readout",
    describe: "Title length and keyword position, description 250 to 300, no exclamation marks, hashtags or dashes, and the brand book's banned words. A failure names the rule it broke." },
  "P4.2.10": { kind: "qc", mode: "copy",
    describe: "Only what the validator cannot judge: does it sound like the brand, does it match the image, does the landing page deliver what the copy promises, are the four sets genuinely different." },

  "P4.3.1": { kind: "run", label: "Generate the waterfall", action: "waterfall",
    describe: "Sixteen pins, dates and board rotation. Design 1 goes to boards 1-2-3-4, design 2 to 2-3-4-1, so every board gets every design." },
  "P4.3.2": { kind: "panel", section: "3 · Waterfall",
    describe: "Check the spread on the calendar before anything is scheduled. Nothing goes to Pinterest until you approve it." },

  "P4.4.1": { kind: "run", label: "Push to Pinterest", action: "push",
    describe: "Standard pins over the API — never the simplified or idea format, those are barely distributed." },
  "P4.4.2": { kind: "readout",
    describe: "Failures surface on the Overview leak panel and on the pin itself. A rate limit queues itself; an expired token does not, and needs a reconnect before the next cycle.",
    href: "../../integrations", hrefLabel: "Integrations" },
};

export function Phase4Action({
  orgId, taskId, cycle,
}: {
  orgId: string;
  taskId: string;
  cycle: CycleView;
}) {
  const spec = PHASE4_ACTIONS[taskId];
  if (!spec) return null;

  return (
    <div className="mt-4 rounded-[10px] border border-o-hairline bg-o-sunk/50 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-o-hairline flex items-center justify-between gap-3">
        <span className="o-eyebrow">How this gets done</span>
        {spec.kind === "missing" && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-o-accent">
            <AlertTriangle className="w-3 h-3" /> No control yet
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        <p className="text-sm text-o-ink-2 leading-relaxed">{spec.describe}</p>

        {spec.kind === "run" && (
          <RunButton orgId={orgId} urlId={cycle.url_id} action={spec.action} label={spec.label} />
        )}

        {spec.kind === "panel" && (
          <p className="text-sm">
            <span className="text-muted-foreground">Control: </span>
            <span className="font-medium text-foreground">{spec.section}</span>
            <span className="text-muted-foreground"> on this cycle, above.</span>
          </p>
        )}

        {spec.kind === "external" && (
          <p className="text-sm">
            <span className="text-muted-foreground">Happens in: </span>
            <span className="font-medium text-foreground">{spec.tool}</span>
          </p>
        )}

        {spec.kind === "readout" && spec.href && (
          <Link href={`/client/${orgId}/${spec.href}`}
                className="o-btn text-xs inline-flex">
            {spec.hrefLabel ?? "Open"} <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}

        {spec.kind === "qc" && (
          <QcPanel orgId={orgId} urlId={cycle.url_id} mode={spec.mode} />
        )}

        {spec.kind === "missing" && (
          <p className="text-sm text-o-ink-2 leading-relaxed">
            <span className="font-medium text-foreground">When it is built: </span>
            {spec.willDo}
          </p>
        )}
      </div>
    </div>
  );
}

function RunButton({
  orgId, urlId, action, label,
}: {
  orgId: string; urlId: string; action: string; label: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function run() {
    setErr(null); setBusy(true); setOk(false);
    try {
      const body: Record<string, unknown> = { action, url_id: urlId };
      // The waterfall needs a start date; today is the only sensible
      // default and the calendar is reviewed before anything is scheduled.
      if (action === "waterfall") body.start_date = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/organic/phase4/${orgId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 140)}`);
      setOk(true);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={run} disabled={busy}
              className={cn("o-btn o-btn-primary")}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : ok ? <Check className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        {busy ? "Running…" : ok ? "Done — refreshed" : label}
      </button>
      {err && (
        <p className="mt-2 text-xs text-o-neg break-words" role="alert">
          Could not run: {err}
        </p>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */

interface CycleAsset {
  design_id: string;
  design_number: number;
  intent: string;
  route: string;
  asset_path: string | null;
  filename: string | null;
  design_qc: string;
  qc_notes: string | null;
  copy_set_id: string | null;
  tagline: string | null;
  title: string | null;
  description: string | null;
  validator_status: string | null;
  copy_qc: string | null;
  human_qc_reason: string | null;
}

/**
 * Approve or reject each design, or each copy set.
 *
 * Loaded on demand rather than with the page: four designs and their copy
 * is a lot to fetch onto every phase-4 render for two tasks out of
 * twenty-two, and nobody opens QC before the work exists.
 *
 * A rejection requires a reason, enforced server-side so every caller gets
 * the same rule. It is not bureaucracy: the reason is what the next
 * generation is corrected from, and a rejection without one leaves the
 * designer guessing at what was wrong.
 */
function QcPanel({ orgId, urlId, mode }: { orgId: string; urlId: string; mode: "design" | "copy" }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState<CycleAsset[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  async function load() {
    setErr(null); setBusy("load");
    try {
      const res = await fetch(`/api/organic/phase4/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cycle_assets", url_id: urlId }), redirect: "error",
      });
      const raw = await res.text();
      const data = JSON.parse(raw) as { assets?: CycleAsset[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? raw.slice(0, 140));
      setRows(data.assets ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setErr(null); setBusy(id + status);
    try {
      const body = mode === "design"
        ? { action: "design_qc", design_id: id, status, notes: reason[id] ?? null }
        : { action: "copy_qc", copy_set_id: id, status, reason: reason[id] ?? null };
      const res = await fetch(`/api/organic/phase4/${orgId}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body), redirect: "error",
      });
      const raw = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? raw.slice(0, 140));
      await load();
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  if (rows === null) {
    return (
      <div>
        <button type="button" onClick={load} disabled={busy === "load"} className="o-btn o-btn-primary">
          {busy === "load" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {busy === "load" ? "Loading…" : mode === "design" ? "Review the designs" : "Review the copy"}
        </button>
        {err && <p className="mt-2 text-xs text-o-neg break-words" role="alert">{err}</p>}
      </div>
    );
  }

  const items = mode === "copy" ? rows.filter((r) => r.copy_set_id) : rows;
  if (items.length === 0) {
    return <p className="text-sm text-o-ink-2">
      Nothing to review yet — {mode === "design" ? "generate the designs (P4.2.4)" : "draft the copy (P4.2.8)"} first.
    </p>;
  }

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const id = mode === "design" ? r.design_id : r.copy_set_id!;
        const status = mode === "design" ? r.design_qc : (r.copy_qc ?? "PENDING");
        const note = mode === "design" ? r.qc_notes : r.human_qc_reason;
        return (
          <div key={id} className="rounded-lg bg-o-surface ring-1 ring-inset ring-o-hairline p-3.5">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="o-figure text-[11px] text-o-ink-3">Design {r.design_number}</span>
              <span className="o-eyebrow">{r.intent === "CLICK" ? "click pin · 9:16" : "save pin · 2:3"}</span>
              <span className={cn(
                "rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide",
                status === "APPROVED" ? "bg-o-ink text-white"
                  : status === "REJECTED" ? "bg-o-accent text-white"
                  : "bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm")}>
                {status}
              </span>
              {mode === "copy" && r.validator_status && (
                <span className="o-eyebrow">validator {r.validator_status.toLowerCase()}</span>
              )}
            </div>

            {mode === "design" ? (
              r.asset_path ? (
                <a href={r.asset_path} target="_blank" rel="noreferrer" className="mt-2.5 block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.asset_path} alt={`Design ${r.design_number}`}
                       className="rounded-md ring-1 ring-inset ring-o-hairline max-h-56" />
                </a>
              ) : <p className="mt-2 text-sm text-o-accent">No image yet — run P4.2.4.</p>
            ) : (
              <div className="mt-2 space-y-1 text-sm">
                {r.tagline && <p className="text-o-ink-2"><span className="o-eyebrow mr-2">tagline</span>{r.tagline}</p>}
                <p className="font-medium text-foreground">{r.title ?? "— no title —"}</p>
                <p className="text-o-ink-2 leading-relaxed">{r.description ?? "— no description —"}</p>
              </div>
            )}

            {note && <p className="mt-2 text-sm text-o-accent">Rejected: {note}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={reason[id] ?? ""}
                onChange={(e) => setReason({ ...reason, [id]: e.target.value })}
                placeholder="Reason — required to reject"
                className="o-input flex-1 min-w-[14rem] text-sm"
              />
              <button type="button" disabled={busy !== null}
                onClick={() => decide(id, "APPROVED")}
                className={cn("o-btn", status === "APPROVED" && "o-btn-dark")}>
                <Check className="w-4 h-4" /> Approve
              </button>
              <button type="button" disabled={busy !== null}
                onClick={() => decide(id, "REJECTED")}
                className={cn("o-btn", status === "REJECTED" && "o-btn-primary")}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
      {err && <p className="text-xs text-o-neg break-words" role="alert">{err}</p>}
    </div>
  );
}
