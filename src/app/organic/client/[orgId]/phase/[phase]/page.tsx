import { notFound } from "next/navigation";
import { loadClientHeader, loadClientTasks } from "@/lib/organic/queries";
import { loadViability } from "@/lib/organic/viability";
import { loadPhase2Snapshot } from "@/lib/organic/phase2";
import { loadPhase3Snapshot } from "@/lib/organic/phase3";
import { loadPhase4Snapshot, loadCyclesForOrg, loadOrgBoards, loadOrgKeywordsWithVolume } from "@/lib/organic/phase4";
import { loadAssets } from "@/lib/organic/workspace";
import { phaseMeta } from "@/lib/organic/phase-meta";
import { PhaseBoard } from "./PhaseBoard";
import { Phase4Cycles } from "../../Phase4Cycles";

export const dynamic = "force-dynamic";

export default async function PhasePage({ params }: { params: Promise<{ orgId: string; phase: string }> }) {
  const { orgId, phase: phaseStr } = await params;
  const phase = Number(phaseStr);
  if (!Number.isInteger(phase) || phase < 1 || phase > 5) notFound();
  const meta = phaseMeta(phase);
  if (!meta) notFound();

  // Phase 4 is cycle-based, so it renders the cycles panel instead of a
  // flat task list.
  if (phase === 4) {
    const [header, p4, cycles, orgBoards, orgKeywords, assets] = await Promise.all([
      loadClientHeader(orgId),
      loadPhase4Snapshot(orgId),
      loadCyclesForOrg(orgId),
      loadOrgBoards(orgId),
      loadOrgKeywordsWithVolume(orgId),
      loadAssets(orgId),
    ]);
    if (!header) notFound();
    return (
      <div className="space-y-5">
        <PhaseHeader meta={meta} />
        <Phase4Cycles
          orgId={orgId}
          cycles={cycles}
          selectableUrls={p4.selectable_urls as Parameters<typeof Phase4Cycles>[0]["selectableUrls"]}
          orgBoards={orgBoards}
          orgKeywords={orgKeywords}
        />
        <StepGuideGrid meta={meta} />
        <PhaseAssets assets={assets.filter((a) => a.linked_task_id?.startsWith("P4."))} />
      </div>
    );
  }

  const [header, tasks, viability, p2, p3, assets] = await Promise.all([
    loadClientHeader(orgId),
    loadClientTasks(orgId),
    loadViability(orgId),
    loadPhase2Snapshot(orgId),
    loadPhase3Snapshot(orgId),
    loadAssets(orgId),
  ]);
  if (!header) notFound();

  const phaseTasks = tasks.filter((t) => t.phase === phase);

  return (
    <div className="space-y-5">
      <PhaseHeader meta={meta} />
      <PhaseBoard
        orgId={orgId}
        phase={phase}
        tasks={phaseTasks}
        viability={viability}
        phase2={p2}
        phase3={p3}
        assets={assets}
      />
    </div>
  );
}

function PhaseHeader({ meta }: { meta: NonNullable<ReturnType<typeof phaseMeta>> }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">{meta.title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{meta.subtitle}</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Goal</div>
          <div className="text-xs text-foreground">{meta.goal}</div>
        </div>
        {meta.gate && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-amber-800 font-semibold mb-0.5">Gate</div>
            <div className="text-xs text-amber-900">{meta.gate}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function StepGuideGrid({ meta }: { meta: NonNullable<ReturnType<typeof phaseMeta>> }) {
  const steps = Object.entries(meta.steps);
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground mb-2">Steps in this phase</h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {steps.map(([k, s]) => (
          <div key={k} className="rounded-lg border border-border bg-card p-3">
            <div className="text-sm font-medium text-foreground">{s.title}</div>
            <dl className="mt-2 space-y-1 text-xs">
              <div><dt className="inline text-muted-foreground">What: </dt><dd className="inline text-foreground">{s.what}</dd></div>
              <div><dt className="inline text-muted-foreground">Where: </dt><dd className="inline text-foreground">{s.where}</dd></div>
              <div><dt className="inline text-muted-foreground">Output: </dt><dd className="inline text-foreground">{s.output}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function PhaseAssets({ assets }: { assets: Array<{ id: string; title: string; url: string; type: string; linked_task_id: string | null }> }) {
  if (assets.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground mb-2">Documents saved in this phase</h3>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {assets.map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
            className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-muted/40">
            <span className="text-foreground truncate">{a.title}</span>
            <span className="text-[10px] text-muted-foreground uppercase shrink-0">{a.linked_task_id ?? a.type}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
