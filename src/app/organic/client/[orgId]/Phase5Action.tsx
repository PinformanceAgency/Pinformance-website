"use client";

import Link from "next/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionKind } from "./Phase4Action";

/** Phase 5 adds two kinds of its own to phase 4's five. */
type Phase5Kind =
  | ActionKind
  | { kind: "templates"; describe: string }
  | { kind: "forecast"; describe: string };

/**
 * The control that does the work, per phase-5 task.
 *
 * Phase 5 is monthly execution, like phase 4 — pull the numbers, find what
 * won, feed it back into next month. It was rendering with the research
 * treatment from phases 1 to 3: a note box and an attach button on thirteen
 * tasks, so the manager had to go and read the numbers somewhere else and
 * come back to describe them.
 *
 * The same five kinds as phase 4. Most of phase 5 is genuinely read-and-
 * judge rather than press-a-button, so `readout` and `external` carry more
 * of it here than they do there — which is the honest shape, not a gap.
 */
export const PHASE5_ACTIONS: Record<string, Phase5Kind> = {
  "P5.1.1": { kind: "readout",
    describe: "Pulled automatically with the filters fixed: Organic, Claimed Domain, Your Pins, real-time off. This is the source of truth for volume — if a number looks wrong, check the filters before you check the maths.",
    href: "analytics", hrefLabel: "Store analytics" },
  "P5.1.2": { kind: "external", tool: "GA4",
    describe: "Session duration, bounce rate, pages per session. GA4 measures quality, never volume — Pinterest native is the volume number. Attach the export below." },
  "P5.1.3": { kind: "readout",
    describe: "Over eighty percent of Pinterest happens in the in-app browser, which drops the referral tag, so that traffic lands in GA4 as direct. The gap is computed on the analytics screen; what belongs here is the sentence you put in front of the client, because every one of them asks.",
    href: "analytics", hrefLabel: "See the gap" },
  "P5.1.4": { kind: "external", tool: "Looker Studio",
    describe: "Four panels: acquisition, behaviour, conversion, and Pinterest against the other channels. The comparison against global is the whole point — Pinterest brings less volume and demonstrably better visitors." },

  "P5.2.1": { kind: "readout",
    describe: "Top three to five on outbound clicks, and separately on saves. Never on impressions — those say nothing about intent. Clicks are conversion winners and you reuse the layout; saves are aesthetic winners and you replicate the photography.",
    href: "analytics", hrefLabel: "Store analytics" },
  "P5.2.2": { kind: "readout",
    describe: "Which design on which board worked, and why. This is computed from published pins and their performance, and it is what ranks the boards and fills the design brief next month — the loop only closes if it is read.",
    href: "analytics", hrefLabel: "Store analytics" },
  "P5.2.3": { kind: "templates",
    describe: "Mark the templates that produced winners. This is the loop the method rests on: next month's design brief starts from a handful of layouts that work instead of from scratch. Judged on outbound clicks and saves, never impressions." },

  "P5.3.1": { kind: "external", tool: "Pinterest Trends",
    describe: "Set to the client's market country. Look for emerging searches that fit the taste graph — a rising term outside the brand's world is somebody else's opportunity." },
  "P5.3.2": { kind: "external", tool: "Pinterest Shopping Trends",
    describe: "Which product categories are rising. This is advice the client can act on for stock and focus, which is what makes the report worth reading." },
  "P5.3.3": { kind: "forecast",
    describe: "What rises on Pinterest rises on Google weeks later. Drafted from this month's trend checks, the taste graph and what has won here — then you approve it. With no trend notes recorded it will say the reading is thin rather than invent movement." },
  "P5.3.4": { kind: "panel", section: "Phase 4 — readiness",
    describe: "Trends plus winners become next month's candidate list. The readiness panel at the top of phase 4 already ranks URLs by what has won here — this task is deciding which of them the month is built around, and writing down why." },

  "P5.4.1": { kind: "external", tool: "Pinterest Ads Manager",
    describe: "Three engagement audiences (pin engagers 30 / 60 / 90 days) and three site-visitor audiences, exported and handed to the paid side. Never through the Promote button — boosting an organic pin blends organic and paid in the same pin data and destroys the ROI reporting." },
  "P5.5.1": { kind: "panel", section: "Library",
    describe: "Every six months: the full keyword bank, the board architecture and the competitor set. Retire what is not performing. The keyword and board screens carry the counts you need." },
};

export function Phase5Action({ orgId, taskId }: { orgId: string; taskId: string }) {
  const spec = PHASE5_ACTIONS[taskId];
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

        {spec.kind === "panel" && (
          <p className="text-sm">
            <span className="text-muted-foreground">Control: </span>
            <span className="font-medium text-foreground">{spec.section}</span>
          </p>
        )}

        {spec.kind === "external" && (
          <p className="text-sm">
            <span className="text-muted-foreground">Happens in: </span>
            <span className="font-medium text-foreground">{spec.tool}</span>
          </p>
        )}

        {spec.kind === "readout" && spec.href && (
          <Link href={`/client/${orgId}/${spec.href}`} className="o-btn text-xs inline-flex">
            {spec.hrefLabel ?? "Open"} <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        )}

        {spec.kind === "templates" && <TemplatePanel orgId={orgId} />}
        {spec.kind === "forecast" && <ForecastPanel orgId={orgId} />}

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


/* ------------------------------------------------------------------ */

async function callP5(orgId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/organic/phase5/${orgId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), redirect: "error",
  });
  const raw = await res.text();
  let data: { error?: string } & Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* keep raw */ }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${raw.slice(0, 140)}`);
  return data;
}

interface Standing {
  template_id: string; name: string; intent: string; aspect_ratio: string | null;
  times_used: number; is_proven: boolean; clicks: number; saves: number; designs: number;
}

/**
 * P5.2.3 — which templates are proven.
 *
 * Ordered by clicks then saves, because that is how the method judges a
 * winner. Impressions are deliberately absent: they say nothing about
 * intent and putting them on screen invites somebody to mark a template
 * proven on reach alone.
 */
function TemplatePanel({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setBusy("load"); setErr(null);
    try {
      const d = await callP5(orgId, { action: "template_standings" });
      setRows((d.templates as Standing[]) ?? []);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  async function toggle(t: Standing) {
    setBusy(t.template_id); setErr(null);
    try {
      await callP5(orgId, { action: "set_template_proven", template_id: t.template_id, proven: !t.is_proven });
      await load();
      startTransition(() => router.refresh());
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  if (rows === null) {
    return (
      <div>
        <button onClick={load} disabled={busy === "load"} className="o-btn o-btn-primary">
          {busy === "load" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {busy === "load" ? "Loading…" : "Open the templates"}
        </button>
        {err && <p className="mt-2 text-xs text-o-neg break-words">{err}</p>}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-o-ink-2">
      No templates recorded for this client yet. They are created during onboarding, in Canva or Figma,
      and linked to a design when it is produced.
    </p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((t) => (
        <div key={t.template_id}
             className="flex items-center gap-3 flex-wrap rounded-lg bg-o-surface ring-1 ring-inset ring-o-hairline px-3.5 py-2.5">
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-medium text-foreground">{t.name}</p>
            <p className="text-xs text-muted-foreground">
              {t.intent === "CLICK" ? "click pin" : "save pin"}
              {t.aspect_ratio ? ` · ${t.aspect_ratio}` : ""} · used {t.times_used}× · {t.designs} design{t.designs === 1 ? "" : "s"}
            </p>
          </div>
          <span className="o-figure text-sm text-foreground">{t.clicks.toLocaleString("en-US")}</span>
          <span className="o-eyebrow">clicks</span>
          <span className="o-figure text-sm text-foreground">{t.saves.toLocaleString("en-US")}</span>
          <span className="o-eyebrow">saves</span>
          <button onClick={() => toggle(t)} disabled={busy !== null}
                  className={cn("o-btn", t.is_proven && "o-btn-dark")}>
            {t.is_proven ? <><Check className="w-4 h-4" /> Proven</> : "Mark proven"}
          </button>
        </div>
      ))}
      {err && <p className="text-xs text-o-neg break-words">{err}</p>}
    </div>
  );
}

/** P5.3.3 — the forward-looking paragraph, drafted then approved. */
function ForecastPanel({ orgId }: { orgId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [thin, setThin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const d = await callP5(orgId, { action: "draft_forecast" });
            setText(d.forecast as string);
            setThin(!d.had_trend_input);
          } catch (e) { setErr((e as Error).message); }
          finally { setBusy(false); }
        }}
        disabled={busy} className="o-btn o-btn-primary">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {busy ? "Drafting…" : text ? "Draft again" : "Draft the forecast"}
      </button>
      {thin && (
        <p className="text-xs text-o-accent">
          No trend notes recorded on P5.3.1 or P5.3.2 this month, so the draft has little to work from.
        </p>
      )}
      {text && (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
                    className="o-input text-sm" />
          <p className="text-xs text-muted-foreground">
            Edit it, then paste it into the report. Nothing here reaches the client on its own.
          </p>
        </>
      )}
      {err && <p className="text-xs text-o-neg break-words">{err}</p>}
    </div>
  );
}
