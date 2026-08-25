/**
 * One SOP step, on its own route.
 *
 * The sidebar goes phase → step → task, so a step needs somewhere to
 * land. It renders the same task board as the phase page, filtered to
 * this step, with the operator context above it — what happens here,
 * where the work physically takes place, who owns it and what should
 * exist when it is done.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientHeader, loadClientTasks } from "@/lib/organic/queries";
import { loadViability } from "@/lib/organic/viability";
import { loadPhase2Snapshot } from "@/lib/organic/phase2";
import { loadPhase3Snapshot } from "@/lib/organic/phase3";
import { loadAssets, loadTaskAnswers } from "@/lib/organic/workspace";
import { phaseMeta, stepMeta, OWNER_LABEL } from "@/lib/organic/phase-meta";
import { PhaseBoard } from "../PhaseBoard";
import { Panel } from "@/components/organic/primitives";

export const dynamic = "force-dynamic";

export default async function StepPage({
  params,
}: {
  params: Promise<{ orgId: string; phase: string; step: string }>;
}) {
  const { orgId, phase: phaseStr, step } = await params;
  const phase = Number(phaseStr);
  if (!Number.isInteger(phase) || phase < 1 || phase > 5) notFound();

  const pMeta = phaseMeta(phase);
  if (!pMeta) notFound();
  const sMeta = stepMeta(phase, step);

  const [header, tasks, viability, p2, p3, assets, answers] = await Promise.all([
    loadClientHeader(orgId),
    loadClientTasks(orgId),
    loadViability(orgId),
    loadPhase2Snapshot(orgId),
    loadPhase3Snapshot(orgId),
    loadAssets(orgId),
    loadTaskAnswers(orgId),
  ]);
  if (!header) notFound();

  const stepTasks = tasks.filter((t) => t.phase === phase && t.step === step);
  // A step key that exists in the sidebar always has tasks, so an empty
  // list here means a hand-typed URL rather than a real state.
  if (stepTasks.length === 0 && !sMeta) notFound();

  const done = stepTasks.filter((t) => t.status === "DONE").length;
  const blocked = stepTasks.filter((t) => t.status === "BLOCKED").length;

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/client/${orgId}/phase/${phase}`}
              className="o-eyebrow hover:text-o-ink transition-colors">
          ← {pMeta.title}
        </Link>
        <div className="mt-2.5 flex items-baseline justify-between gap-6 flex-wrap">
          <h1 className="o-h1 text-o-ink">{sMeta?.title ?? `Step ${phase}.${step}`}</h1>
          <div className="flex items-center gap-3">
            <span className="o-figure text-[length:var(--text-o-body)] text-o-ink-2">
              {done}<span className="text-o-ink-3 font-normal"> / {stepTasks.length} done</span>
            </span>
            {blocked > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11px] font-semibold bg-o-accent/[0.08] text-o-accent ring-1 ring-inset ring-o-accent/25">
                <span className="w-1.5 h-1.5 rounded-full bg-o-accent" /> {blocked} blocked
              </span>
            )}
          </div>
        </div>
        {/* Completion as a hairline under the title — a bar you read
            without looking at it. */}
        <div className="mt-4 h-[3px] rounded-full bg-o-hairline overflow-hidden max-w-md">
          <div className="h-full rounded-full bg-o-accent transition-[width] duration-500"
               style={{ width: `${stepTasks.length ? (done / stepTasks.length) * 100 : 0}%` }} />
        </div>
      </header>

      {sMeta && (
        <Panel className="overflow-hidden">
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-o-hairline">
            {([["What happens", sMeta.what], ["Where", sMeta.where],
               ["Owner", OWNER_LABEL[sMeta.owner]], ["Done when", sMeta.output]] as const).map(([k, v]) => (
              <div key={k} className="bg-o-surface px-5 py-4">
                <dt className="o-eyebrow">{k}</dt>
                <dd className="mt-2 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}

      <PhaseBoard
        showStepHeaders={false}
        answers={answers}
        orgId={orgId}
        phase={phase}
        tasks={stepTasks}
        viability={viability}
        phase2={p2}
        phase3={p3}
        assets={assets}
      />
    </div>
  );
}
