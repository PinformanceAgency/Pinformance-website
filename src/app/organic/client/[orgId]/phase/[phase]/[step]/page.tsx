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
import { Panel, Label } from "@/components/organic/primitives";

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
              className="text-[length:var(--text-o-label)] text-o-ink-3 hover:text-o-ink">
          ← {pMeta.title}
        </Link>
        <h1 className="o-display mt-2 text-[length:var(--text-o-figure-md)] font-semibold text-o-ink leading-snug">
          {sMeta?.title ?? `Step ${phase}.${step}`}
        </h1>
        <p className="mt-1.5 text-[length:var(--text-o-body)] text-o-ink-3">
          {done} of {stepTasks.length} done
          {blocked > 0 && <span className="text-o-clay"> · {blocked} blocked</span>}
        </p>
      </header>

      {sMeta && (
        <Panel className="px-5 py-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
            <div>
              <Label>What happens</Label>
              <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{sMeta.what}</p>
            </div>
            <div>
              <Label>Where</Label>
              <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{sMeta.where}</p>
            </div>
            <div>
              <Label>Owner</Label>
              <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">
                {OWNER_LABEL[sMeta.owner]}
              </p>
            </div>
            <div>
              <Label>Done when</Label>
              <p className="mt-1 text-[length:var(--text-o-body)] text-o-ink-2 leading-relaxed">{sMeta.output}</p>
            </div>
          </div>
        </Panel>
      )}

      <PhaseBoard
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
