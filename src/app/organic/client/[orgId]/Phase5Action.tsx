"use client";

import Link from "next/link";
import { ExternalLink, AlertTriangle } from "lucide-react";
import type { ActionKind } from "./Phase4Action";

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
export const PHASE5_ACTIONS: Record<string, ActionKind> = {
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
  "P5.2.3": { kind: "missing",
    describe: "Mark the winning templates as proven, so each client converges on a handful of layouts that work instead of starting from scratch every month.",
    willDo: "Write to organic.design_templates and read it back in the design brief. The table exists and nothing writes to it yet." },

  "P5.3.1": { kind: "external", tool: "Pinterest Trends",
    describe: "Set to the client's market country. Look for emerging searches that fit the taste graph — a rising term outside the brand's world is somebody else's opportunity." },
  "P5.3.2": { kind: "external", tool: "Pinterest Shopping Trends",
    describe: "Which product categories are rising. This is advice the client can act on for stock and focus, which is what makes the report worth reading." },
  "P5.3.3": { kind: "missing",
    describe: "What rises on Pinterest rises on Google weeks later. Turning that into a forward-looking note is what makes the reporting strategic rather than a record of last month.",
    willDo: "Draft from the trends checks plus the taste graph, through the same validator harness the copy uses." },
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
