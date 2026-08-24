import Link from "next/link";
import { loadClientHeader } from "@/lib/organic/queries";
import { loadLeaks, type Leak } from "@/lib/organic/workspace";
import { loadCyclesForOrg } from "@/lib/organic/phase4";
import { computeHealthScore, loadCohortContext, type HealthScore, type CohortContext } from "@/lib/organic/health";
import * as P5 from "@/lib/organic/phase5";
import { PROVENANCE_REASON, type ProvenanceState } from "@/lib/organic/provenance";
import { Band, Panel, Label, Figure, Stat, Empty, AccentLink } from "@/components/organic/primitives";
import { SegmentedScore, BarList, type Segment } from "@/components/organic/charts";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * STORE OVERVIEW — the reference screen for the organic design system.
 *
 * Internal surface: cooler ground, denser than the client report, built
 * for someone holding fifty accounts. The question it answers in thirty
 * seconds is "what needs doing on this store today".
 */
export default async function OverviewPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  const [header, leaks, cycles, baseline, pinterest, setup] = await Promise.all([
    loadClientHeader(orgId),
    loadLeaks(orgId),
    loadCyclesForOrg(orgId),
    P5.loadBaseline(orgId),
    P5.fetchOrganicAnalytics(orgId, from, today),
    P5.loadSetupState(orgId, from, today),
  ]);

  const health = await computeHealthScore(orgId, leaks.length);
  const cohort = await loadCohortContext(orgId, health);
  const deltas = P5.computeDeltas(baseline, pinterest.totals, setup);
  const hard = deltas.filter((d) => d.tier === "hard");

  const onboarding = (header?.phases ?? []).filter((p) => p.phase <= 3);
  const onboardingDone = onboarding.length > 0 && onboarding.every((p) => p.pct_done === 100);
  const nextPhase = onboarding.find((p) => p.outstanding_tasks > 0);

  return (
    <div>
      {/* The store name lives in the sidebar switcher now, so this heading
          names the screen rather than repeating the client. */}
      <header className="mb-7">
        <h1 className="o-display text-[length:var(--text-o-figure-md)] font-semibold text-o-ink leading-snug">
          Overview
        </h1>
        <p className="mt-1.5 text-[length:var(--text-o-body)] text-o-ink-2">
          Where this store stands, and what it is losing while it stands there.
        </p>
      </header>
      <HealthBand health={health} cohort={cohort} orgId={orgId} />
      <LeakBand leaks={leaks} orgId={orgId} />
      {!onboardingDone && <OnboardingBand phases={onboarding} nextPhase={nextPhase?.phase ?? null} orgId={orgId} />}
      <CyclesBand cycles={cycles} orgId={orgId} onboardingDone={onboardingDone} />
      <ResultsBand rows={hard} ok={pinterest.ok} reason={pinterest.reason} orgId={orgId} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Health
 * ------------------------------------------------------------------ */

const SEGMENT_COLOR: Record<string, Segment["color"]> = {
  execution: "teal", foundation: "sand", performance: "clay", account: "slate",
};

function HealthBand({ health, cohort, orgId }: { health: HealthScore; cohort: CohortContext; orgId: string }) {
  const segments: Segment[] = health.components.map((c) => ({
    label: c.label, score: c.score, weight: c.weight, color: SEGMENT_COLOR[c.key],
  }));

  return (
    <Band title="Health" sub={cohort.note}>
      <Panel className="px-6 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)] gap-7 items-start">
          {/* The composite, or an honest refusal to publish one. */}
          <div>
            <Label>Composite score</Label>
            <div className="mt-1.5">
              <Figure
                value={health.composite}
                size="xl"
                suffix={health.composite !== null ? "/100" : undefined}
                reason={health.withheld_reason ?? undefined}
              />
            </div>
            {health.withheld_reason ? (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                {health.withheld_reason}
              </p>
            ) : (
              <p className="mt-2 text-[length:var(--text-o-body)] text-o-ink-3">
                Weighted across {Math.round(health.measured_weight * 100)}% of the score that is measurable.
              </p>
            )}
          </div>

          {/* Components, never a black box. */}
          <div>
            <SegmentedScore segments={segments} />
            <dl className="mt-5 space-y-2 border-t border-o-hairline pt-4">
              {health.components.map((c) => (
                <div key={c.key} className="grid grid-cols-[124px_minmax(0,1fr)] gap-3 items-baseline">
                  <dt className="text-[length:var(--text-o-body)] text-o-ink">{c.label}</dt>
                  <dd className="text-[length:var(--text-o-body)] text-o-ink-2 leading-snug">{c.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Panel>
    </Band>
  );
}

/* ------------------------------------------------------------------ *
 * Leaks
 * ------------------------------------------------------------------ */

function LeakBand({ leaks, orgId }: { leaks: Leak[]; orgId: string }) {
  if (leaks.length === 0) {
    return (
      <Band title="Leaks" sub="Ranked by what they cost, not by when they appeared.">
        <Panel className="px-6 py-5">
          <p className="text-[length:var(--text-o-body)] text-o-ink-2">
            Nothing is leaking. Every topic is covered, no cycle is stalled, and the token is valid.
          </p>
        </Panel>
      </Band>
    );
  }

  return (
    <Band title="Leaks" sub="Ranked by what they cost, not by when they appeared."
          right={<span className="o-num text-[length:var(--text-o-body)] text-o-ink-2">{leaks.length} open</span>}>
      <Panel>
        <ul className="divide-y divide-o-hairline">
          {leaks.map((l) => (
            <li key={l.kind} className="px-5 py-4">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2.5">
                    {/* The accent earns its keep here: it marks the most
                        expensive leaks and nothing else on the screen. */}
                    <span className={cn(
                      "shrink-0 w-1 h-3.5 rounded-full",
                      l.severity === "high" ? "bg-o-accent" :
                      l.severity === "medium" ? "bg-o-sand" : "bg-o-hairline-firm"
                    )} />
                    <span className="text-[length:var(--text-o-body)] font-medium text-o-ink">{l.label}</span>
                  </div>
                  <p className="mt-1 ml-[14px] text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                    {l.cost}
                  </p>
                  {l.detail.length > 0 && (
                    <ul className="mt-1.5 ml-[14px] space-y-0.5">
                      {l.detail.slice(0, 3).map((d, i) => (
                        <li key={i} className="text-[length:var(--text-o-label)] text-o-ink-3 truncate">{d}</li>
                      ))}
                      {l.detail.length > 3 && (
                        <li className="text-[length:var(--text-o-label)] text-o-ink-3">
                          +{l.count - 3} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <AccentLink href={`/client/${orgId}/${l.fix_href}`}>Fix</AccentLink>
                  {l.fix_task && (
                    <div className="mt-0.5 o-num text-[length:var(--text-o-label)] text-o-ink-3">{l.fix_task}</div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </Band>
  );
}

/* ------------------------------------------------------------------ *
 * Onboarding
 * ------------------------------------------------------------------ */

function OnboardingBand({
  phases, nextPhase, orgId,
}: {
  phases: Array<{ phase: number; total_tasks: number; done_tasks: number; skipped_tasks: number; blocked_tasks: number; outstanding_tasks: number; pct_done: number }>;
  nextPhase: number | null;
  orgId: string;
}) {
  const total = phases.reduce((s, p) => s + p.total_tasks, 0);
  const done  = phases.reduce((s, p) => s + p.done_tasks, 0);

  if (total === 0) {
    return (
      <Band title="Onboarding">
        <Empty
          headline="Onboarding has not been instantiated."
          body="This store has no task bank yet. Activating it creates the phase 1–3 checklist and unlocks the viability gate."
          action={<AccentLink href="/">Back to client list</AccentLink>}
        />
      </Band>
    );
  }

  const PHASE_NAME: Record<number, string> = {
    1: "Onboarding & audit", 2: "Market research", 3: "SEO architecture",
  };

  return (
    <Band
      title="Onboarding"
      sub="Phases 1 to 3. One-time work that gates everything downstream."
      right={
        nextPhase
          ? <AccentLink href={`/client/${orgId}/phase/${nextPhase}`}>Open phase {nextPhase}</AccentLink>
          : undefined
      }
    >
      <Panel className="px-6 py-5">
        <div className="flex items-baseline gap-3 mb-5">
          <Figure value={total > 0 ? Math.round((done / total) * 100) : null} size="lg" suffix="%" />
          <span className="o-num text-[length:var(--text-o-body)] text-o-ink-2">
            {done} of {total} tasks
          </span>
        </div>
        <div className="space-y-3">
          {phases.map((p) => (
            <div key={p.phase} className="grid grid-cols-[150px_minmax(0,1fr)_auto] gap-4 items-center">
              <div className="min-w-0">
                <span className="text-[length:var(--text-o-body)] text-o-ink">
                  {p.phase} · {PHASE_NAME[p.phase]}
                </span>
              </div>
              <div className="h-[5px] rounded-full bg-o-sunk overflow-hidden">
                <div className="h-full rounded-full bg-o-teal" style={{ width: `${Math.min(100, p.pct_done)}%` }} />
              </div>
              <div className="o-num text-[length:var(--text-o-body)] text-o-ink-2 w-40 text-right tabular-nums">
                {p.done_tasks}/{p.total_tasks}
                {p.skipped_tasks > 0 && <span className="text-o-ink-3"> · {p.skipped_tasks} skipped</span>}
                {p.blocked_tasks > 0 && <span className="text-o-clay"> · {p.blocked_tasks} blocked</span>}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </Band>
  );
}

/* ------------------------------------------------------------------ *
 * Cycles
 * ------------------------------------------------------------------ */

function CyclesBand({
  cycles, orgId, onboardingDone,
}: {
  cycles: Awaited<ReturnType<typeof loadCyclesForOrg>>;
  orgId: string;
  onboardingDone: boolean;
}) {
  if (cycles.length === 0) {
    return (
      <Band title="Production cycles">
        <Empty
          headline={onboardingDone ? "No cycle is running." : "Production has not started yet."}
          body={
            onboardingDone
              ? "Onboarding is complete, so this store is ready to run. A cycle takes one URL through design, copy and a sixteen-pin waterfall."
              : "Phase 4 opens once the SEO architecture is in place — a URL cannot enter production until its topic has five boards behind it."
          }
          action={
            onboardingDone
              ? <AccentLink href={`/client/${orgId}/phase/4`}>Start a cycle</AccentLink>
              : <AccentLink href={`/client/${orgId}/phase/3`}>Go to phase 3</AccentLink>
          }
        />
      </Band>
    );
  }

  return (
    <Band title="Production cycles"
          right={<AccentLink href={`/client/${orgId}/phase/4`}>All cycles</AccentLink>}>
      <Panel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-o-hairline bg-o-sunk/60">
              <th className="text-left px-5 py-2"><Label>URL</Label></th>
              <th className="text-left px-5 py-2"><Label>Reason</Label></th>
              <th className="text-left px-5 py-2"><Label>Waterfall</Label></th>
              <th className="text-right px-5 py-2"><Label>Progress</Label></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-o-hairline">
            {cycles.map((c) => (
              <tr key={c.cycle}>
                <td className="px-5 py-2.5 text-[length:var(--text-o-body)] text-o-ink truncate max-w-[300px]">
                  {c.url_name}
                </td>
                <td className="px-5 py-2.5 text-[length:var(--text-o-label)] text-o-ink-2 uppercase tracking-wide">
                  {c.reason}
                </td>
                <td className="px-5 py-2.5 text-[length:var(--text-o-body)] text-o-ink-2">
                  {c.waterfall ? c.waterfall.status : "—"}
                </td>
                <td className="px-5 py-2.5 text-right o-num text-[length:var(--text-o-body)] text-o-ink-2">
                  {c.progress.done}/{c.progress.total}
                  {c.progress.blocked > 0 && <span className="text-o-clay"> · {c.progress.blocked} blocked</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Band>
  );
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

function ResultsBand({
  rows, ok, reason, orgId,
}: {
  rows: P5.DeltaRow[];
  ok: boolean;
  reason?: string;
  orgId: string;
}) {
  if (!ok) {
    return (
      <Band title="Results" sub="Last 30 days against the phase-1 baseline.">
        <Empty
          headline="Pinterest could not be reached."
          body={`The analytics fetch failed: ${reason ?? "unknown error"}. Nothing is shown rather than a stale or partial figure.`}
        />
      </Band>
    );
  }

  const anyMeasured = rows.some((r) => r.current !== null);
  if (!anyMeasured) {
    return (
      <Band title="Results" sub="Last 30 days against the phase-1 baseline.">
        <Empty
          headline="Nothing has been measured yet."
          body="No pins have been published from this store, so there is no outbound click or save to report. Results appear once the first waterfall starts publishing."
          action={<AccentLink href={`/client/${orgId}/analytics`}>Open analytics</AccentLink>}
        />
      </Band>
    );
  }

  const lead = rows.slice(0, 4);
  const rest = rows.slice(4).filter((r) => r.current !== null);

  return (
    <Band
      title="Results"
      sub="Last 30 days against the phase-1 baseline. Distribution metrics live on the analytics tab."
      right={<AccentLink href={`/client/${orgId}/analytics`}>Full analytics</AccentLink>}
    >
      <Panel className="px-6 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-7">
          {lead.map((d) => (
            <Stat
              key={d.name}
              label={d.name}
              value={d.current}
              size="lg"
              movement={d.delta_pct}
              reason={PROVENANCE_REASON[(d.delta_suppressed_because ?? d.state) as ProvenanceState]}
              movementReason={`vs baseline ${d.baseline?.toLocaleString("en-US") ?? "—"}`}
              footnote={
                d.baseline != null
                  ? <>baseline {d.baseline.toLocaleString("en-US")}</>
                  : <span className="text-o-ink-3">no baseline</span>
              }
            />
          ))}
        </div>
        {rest.length > 0 && (
          <div className="mt-7 pt-5 border-t border-o-hairline">
            <BarList
              data={rest.map((d) => ({ label: d.name, value: d.current }))}
              color="slate"
            />
          </div>
        )}
      </Panel>
    </Band>
  );
}
