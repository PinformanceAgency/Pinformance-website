"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PhaseProgressLite {
  phase: number;
  pct_done: number;
  done_tasks: number;
  total_tasks: number;
  blocked_tasks: number;
}

const PHASES = [
  { n: 1, label: "Onboarding & audit" },
  { n: 2, label: "Market research" },
  { n: 3, label: "SEO architecture" },
  { n: 4, label: "Production cycles" },
  { n: 5, label: "Review & reporting" },
];

const REFERENCE_TABS = [
  { slug: "",          label: "Overview" },
  { slug: "boards",    label: "Boards" },
  { slug: "keywords",  label: "Keywords" },
  { slug: "urls",      label: "URLs" },
  { slug: "assets",    label: "Assets" },
  { slug: "analytics", label: "Analytics" },
];

export function ClientTabs({ orgId, phases }: { orgId: string; phases: PhaseProgressLite[] }) {
  const pathname = usePathname();
  const base = `/client/${orgId}`;
  const byPhase = new Map(phases.map((p) => [p.phase, p]));

  return (
    <div className="space-y-6">
      {/* Phase path — the SOP made navigable. A row of steps rather than
          a grid of cards, because the phases are sequential and the shape
          should say so. */}
      <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-o-hairline border border-o-hairline rounded-md overflow-hidden">
        {PHASES.map((ph) => {
          const p = byPhase.get(ph.n);
          const href = `${base}/phase/${ph.n}`;
          const active = pathname.startsWith(href);
          const pct = p?.pct_done ?? 0;
          const complete = pct >= 100;
          const recurring = ph.n >= 4;

          return (
            <Link key={ph.n} href={href}
              className={cn(
                "group relative bg-o-surface px-4 py-3.5",
                active ? "bg-o-sunk" : "hover:bg-o-sunk/50"
              )}>
              {/* Active marker — one of the accent's few appearances. */}
              {active && <span className="absolute inset-x-0 top-0 h-[2px] bg-o-accent" />}

              <div className="flex items-baseline justify-between gap-2">
                <span className={cn(
                  "o-display text-[length:var(--text-o-body)] font-semibold",
                  active ? "text-o-ink" : "text-o-ink-2 group-hover:text-o-ink"
                )}>
                  Phase {ph.n}
                </span>
                {p && !recurring && (
                  <span className={cn(
                    "o-num text-[length:var(--text-o-label)] tabular-nums",
                    complete ? "text-o-pos" : "text-o-ink-3"
                  )}>
                    {pct}%
                  </span>
                )}
              </div>

              <div className="mt-0.5 text-[length:var(--text-o-label)] text-o-ink-3 truncate">
                {ph.label}
              </div>

              {/* Progress only for the one-time phases. Phases 4 and 5 are
                  recurring, so a completion bar would be a category error. */}
              {!recurring && (
                <div className="mt-2.5 h-[3px] rounded-full bg-o-sunk overflow-hidden">
                  <div className="h-full rounded-full bg-o-teal transition-[width]"
                       style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
              {recurring && (
                <div className="mt-2.5 text-[length:var(--text-o-label)] text-o-ink-3">recurring</div>
              )}

              {p && p.blocked_tasks > 0 && !recurring && (
                <div className="mt-1.5 o-num text-[length:var(--text-o-label)] text-o-clay">
                  {p.blocked_tasks} blocked
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Reference surfaces — the library, always available regardless of
          which phase the store is in. The client report is deliberately
          separated from them: it is the one surface that leaves the
          building, and nobody should have to guess which tab is shareable. */}
      <nav className="flex flex-wrap items-center gap-6 border-b border-o-hairline">
        {REFERENCE_TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = t.slug
            ? pathname.startsWith(href)
            : pathname === base || pathname === `${base}/`;
          return (
            <Link key={t.slug || "overview"} href={href}
              className={cn(
                "relative pb-2.5 -mb-px text-[length:var(--text-o-body)]",
                active
                  ? "text-o-ink font-medium"
                  : "text-o-ink-3 hover:text-o-ink"
              )}>
              {t.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-[2px] bg-o-accent" />}
            </Link>
          );
        })}

        <span className="ml-auto flex items-center gap-3 pb-2.5">
          <span className="h-4 w-px bg-o-hairline-firm" />
          <Link href={`/report/${orgId}`}
                className="group flex items-center gap-2 text-[length:var(--text-o-body)] text-o-ink-2 hover:text-o-ink">
            <span className="text-[length:var(--text-o-label)] uppercase tracking-[0.08em] text-o-accent font-medium">
              Client
            </span>
            Report
            <span className="text-o-ink-3 group-hover:text-o-ink">↗</span>
          </Link>
        </span>
      </nav>
    </div>
  );
}
