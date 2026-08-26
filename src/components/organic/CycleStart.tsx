import Link from "next/link";
import { ArrowRight, CheckCircle2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CycleReadiness } from "@/lib/organic/phase4";

/**
 * What to do on phase 4, said plainly.
 *
 * Phases 1 to 3 open on a list of tasks: you can see what is next without
 * being told. Phase 4 is cycle-scoped, so on a store with no cycle running
 * the page had nothing on it — a goal box, "No cycle is running", and
 * "0 URLs eligible" in grey. That is the single moment a manager most
 * needs direction, and the page answered with a number and no way to act
 * on it.
 *
 * So it now answers three questions in order: can I start something, what
 * is stopping me, and where do I go to clear it. The blockers are ordered
 * by how many URLs each is holding up, because clearing the one blocking
 * nine beats clearing the one blocking one.
 */
export function CycleStart({ readiness, base }: { readiness: CycleReadiness; base: string }) {
  const { eligible, running, ready, blockers, total_urls } = readiness;

  // Deliberately not hidden while cycles are running. The first version
  // did hide it, and that removed the only answer to the question a manager
  // asks second: the plan says two URLs a month, one is running, why can I
  // not start the next. That answer is the blocker list.
  return (
    <section className="o-card overflow-hidden">
      <div className="o-card-head px-6 py-5">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="o-h3 text-foreground">
            {eligible > 0 ? "Ready to start" : running > 0 ? "Nothing more to start yet" : "Nothing can start yet"}
          </h2>
          {running > 0 && (
            <span className="o-eyebrow">{running} cycle{running === 1 ? "" : "s"} running</span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
          {eligible > 0
            ? <>{eligible} URL{eligible === 1 ? " is" : "s are"} out of cooldown with a covered topic and five boards
               assigned. Pick one and the sixteen-pin chain begins.</>
            : total_urls === 0
              ? <>A cycle turns one URL into sixteen pins. This store has no URLs yet, so there is nothing to run.</>
              : <>A cycle needs a URL that is out of cooldown, sits under a topic with five boards, and has five
                 boards of its own assigned. None of the {total_urls} URLs here clear all three
                 {running > 0 ? " — so the ones below are all that can run for now." : " yet."}</>}
        </p>
      </div>

      {ready.length > 0 && (
        <ul className="divide-y divide-o-hairline">
          {ready.map((r) => (
            <li key={r.url_id} className="px-6 py-4 flex items-start gap-4">
              <CheckCircle2 className="w-4 h-4 text-o-ink shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{r.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{r.why}</p>
              </div>
            </li>
          ))}
          <li className="px-6 py-3.5 text-sm text-muted-foreground">
            Start one from <span className="font-medium text-foreground">Start new cycle</span> below.
          </li>
        </ul>
      )}

      {ready.length === 0 && blockers.length > 0 && (
        <ul className="divide-y divide-o-hairline">
          {blockers.map((b, i) => (
            <li key={i} className="px-6 py-4 flex items-start gap-4">
              <Wrench className={cn("w-4 h-4 shrink-0 mt-0.5", i === 0 ? "text-o-accent" : "text-o-ink-3")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {b.count > 0 && (
                    <span className="o-figure mr-1.5">{b.count}</span>
                  )}
                  {b.count > 0 ? `URL${b.count === 1 ? "" : "s"}: ${b.what}` : b.what}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{b.fix}</p>
                {b.examples.length > 0 && (
                  <p className="mt-1 text-xs text-o-ink-3">{b.examples.join(" · ")}{b.count > b.examples.length ? " …" : ""}</p>
                )}
              </div>
              <Link href={`${base}/${b.href}`}
                    className="o-btn shrink-0 text-xs">
                Go there <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
