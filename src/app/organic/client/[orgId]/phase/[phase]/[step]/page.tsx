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
import { loadPhase4StepTasks } from "@/lib/organic/phase4";
import { TaskCard } from "../PhaseBoard";
import type { TaskRow } from "@/lib/organic/types";
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

  const [header, tasks, viability, p2, p3, assets, answers, p4step] = await Promise.all([
    loadClientHeader(orgId),
    loadClientTasks(orgId),
    loadViability(orgId),
    loadPhase2Snapshot(orgId),
    loadPhase3Snapshot(orgId),
    loadAssets(orgId),
    loadTaskAnswers(orgId),
    // Phase-4 tasks are recurring, so they never exist flat and this route
    // read "No tasks in this phase yet" on every store without a live
    // cycle — which is every store before its first one. See
    // loadPhase4StepTasks.
    phase === 4 ? loadPhase4StepTasks(orgId, step) : Promise.resolve(null),
  ]);
  if (!header) notFound();

  const flatTasks = tasks.filter((t) => t.phase === phase && t.step === step);
  const cycleTasks = p4step?.instances.flatMap((i) => i.tasks) ?? [];
  const stepTasks = phase === 4 ? cycleTasks : flatTasks;

  // A step key that exists in the sidebar always has a definition, so an
  // empty list with no meta means a hand-typed URL rather than a real state.
  if (stepTasks.length === 0 && !sMeta && !(p4step?.template.length)) notFound();

  const done = stepTasks.filter((t) => t.status === "DONE").length;
  const blocked = stepTasks.filter((t) => t.status === "BLOCKED").length;
  const totalForBar = phase === 4 && stepTasks.length === 0
    ? (p4step?.template.length ?? 0)
    : stepTasks.length;

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
              {done}<span className="text-o-ink-3 font-normal"> / {totalForBar} done</span>
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
               style={{ width: `${totalForBar ? (done / totalForBar) * 100 : 0}%` }} />
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

      {phase === 4 ? (
        <Phase4Step
          orgId={orgId} step={step} data={p4step!}
          answers={answers} assets={assets}
          viability={viability} phase2={p2} phase3={p3}
        />
      ) : (
        <PhaseBoard
          showStepHeaders={false}
          answers={answers}
          orgId={orgId}
          phase={phase}
          tasks={flatTasks}
          viability={viability}
          phase2={p2}
          phase3={p3}
          assets={assets}
        />
      )}
    </div>
  );
}

/**
 * Phase 4's tasks on a step route.
 *
 * With cycles running, each cycle's tasks render as real cards under the
 * URL they belong to. With none running, the SOP definitions render read-
 * only, so a manager can find out what step 4.2 involves before starting
 * the cycle they are trying to understand. That was the gap: recurring
 * tasks exist only inside a cycle, so this route was blank on every store
 * that had not started one.
 */
function Phase4Step({
  orgId, step, data, answers, assets, viability, phase2, phase3,
}: {
  orgId: string;
  step: string;
  data: NonNullable<Awaited<ReturnType<typeof loadPhase4StepTasks>>>;
  answers: Awaited<ReturnType<typeof loadTaskAnswers>>;
  assets: Awaited<ReturnType<typeof loadAssets>>;
  viability: Awaited<ReturnType<typeof loadViability>>;
  phase2: Awaited<ReturnType<typeof loadPhase2Snapshot>>;
  phase3: Awaited<ReturnType<typeof loadPhase3Snapshot>>;
}) {
  if (data.instances.length > 0) {
    return (
      <div className="space-y-5">
        {data.instances.map((inst) => (
          <section key={inst.cycle} className="o-card overflow-hidden">
            <div className="o-card-head px-6 py-4">
              <span className="o-eyebrow">Cycle</span>
              <h2 className="mt-0.5 o-h3 text-foreground">{inst.url_name}</h2>
            </div>
            <div className="divide-y divide-o-hairline">
              {inst.tasks.map((t) => (
                <TaskCard
                  key={t.client_task_id}
                  orgId={orgId}
                  task={{ ...t, block_reasons: [] } as unknown as TaskRow}
                  viability={viability}
                  phase2={phase2}
                  phase3={phase3}
                  assets={assets.filter((a) => a.linked_task_id === t.task_id)}
                  answers={answers}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <section className="o-card overflow-hidden">
      <div className="o-card-head px-6 py-5">
        <h2 className="o-h3 text-foreground">
          What step 4.{step} involves — {data.template.length} task{data.template.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
          These run per cycle rather than once per store, so they appear as work the moment a cycle
          starts. Nothing here is actionable yet; it is what you will be doing.
        </p>
      </div>
      <ol className="divide-y divide-o-hairline">
        {data.template.map((t, i) => (
          <li key={t.task_id} className="px-6 py-5 flex gap-5">
            <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold tabular-nums
                             bg-o-surface text-o-ink-3 ring-1 ring-inset ring-o-hairline-firm">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide
                                 bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm">
                  {t.task_type.replace("_", " ")}
                </span>
                <span className="o-figure text-[11px] text-o-ink-3">{t.task_id}</span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-foreground">{t.name}</h3>
              {t.guidance && (
                <p className="mt-1 text-sm text-o-ink-2 leading-relaxed max-w-3xl">{t.guidance}</p>
              )}
              {t.external_tool && (
                <p className="mt-1.5 text-sm">
                  <span className="text-muted-foreground">Tool: </span>
                  <span className="font-medium text-foreground">{t.external_tool}</span>
                </p>
              )}
              {t.expected_output && (
                <div className="mt-3 rounded-lg bg-o-sunk/60 ring-1 ring-inset ring-o-hairline px-4 py-3 max-w-3xl">
                  <span className="o-eyebrow">Hands back</span>
                  <p className="mt-1 text-sm text-o-ink-2 leading-relaxed">{t.expected_output}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
