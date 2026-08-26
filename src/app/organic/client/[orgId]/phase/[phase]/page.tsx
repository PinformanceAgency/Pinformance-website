import { notFound } from "next/navigation";
import { loadClientHeader, loadClientTasks } from "@/lib/organic/queries";
import { loadViability } from "@/lib/organic/viability";
import { loadPhase2Snapshot } from "@/lib/organic/phase2";
import { loadPhase3Snapshot } from "@/lib/organic/phase3";
import { loadPhase4Snapshot, loadCyclesForOrg, loadOrgBoards, loadOrgKeywordsWithVolume } from "@/lib/organic/phase4";
import { loadAssets, loadCycleOps, loadTaskAnswers } from "@/lib/organic/workspace";
import { phaseMeta } from "@/lib/organic/phase-meta";
import { TASK_STATUS_SERIES } from "@/lib/organic/types";
import type { PhaseProgress } from "@/lib/organic/types";
import { cn } from "@/lib/utils";
import { PhaseBoard } from "./PhaseBoard";
import { Phase4Cycles } from "../../Phase4Cycles";
import { CycleOpsPanel } from "@/components/organic/CycleOps";

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
    const [header, p4, cycles, orgBoards, orgKeywords, assets, ops] = await Promise.all([
      loadClientHeader(orgId),
      loadPhase4Snapshot(orgId),
      loadCyclesForOrg(orgId),
      loadOrgBoards(orgId),
      loadOrgKeywordsWithVolume(orgId),
      loadAssets(orgId),
      loadCycleOps(orgId),
    ]);
    if (!header) notFound();
    // Resolved server-side so the calendar's "today" column and the pin
    // rows it is drawn from cannot disagree across a timezone boundary.
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div className="space-y-5">
        <PhaseHeader meta={meta} progress={header.phases.find((p) => p.phase === phase)} recurring />
        <CycleOpsPanel ops={ops} today={today} />
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

  const phaseTasks = tasks.filter((t) => t.phase === phase);

  return (
    <div className="space-y-5">
      <PhaseHeader meta={meta} progress={header.phases.find((p) => p.phase === phase)} />
      <PhaseBoard
        answers={answers}
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

function PhaseHeader({
  meta, progress, recurring,
}: {
  meta: NonNullable<ReturnType<typeof phaseMeta>>;
  progress?: PhaseProgress;
  /** Phases 4 and 5 repeat per cycle, so a completion bar there would be a
   *  category error — they get counts without a percentage. */
  recurring?: boolean;
}) {
  const p = progress;
  // Skipped work is resolved, not outstanding: a task deliberately skipped
  // is finished business and counting it as "left to do" would keep a
  // completed phase permanently short of the line.
  const settled = p ? p.done_tasks + p.skipped_tasks : 0;
  const left = p ? Math.max(0, p.total_tasks - settled) : 0;
  const pct = p && p.total_tasks > 0 ? Math.round((settled / p.total_tasks) * 100) : 0;

  return (
    <section className="o-card overflow-hidden">
      <div className="o-card-head px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h2 className="o-h2 text-foreground">{meta.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-2xl">{meta.subtitle}</p>
          </div>

          {p && p.total_tasks > 0 && (
            <PhaseDonut progress={p} settled={settled} pct={pct} recurring={recurring} />
          )}
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-px bg-o-hairline">
        <div className="bg-o-surface px-4 py-3.5 -mx-4 -my-3.5 md:m-0">
          <div className="o-eyebrow">Goal</div>
          <div className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{meta.goal}</div>
        </div>
        {meta.gate && (
          <div className="bg-o-surface px-4 py-3.5">
            <div className="o-eyebrow text-o-accent">Gate</div>
            <div className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{meta.gate}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Phase progress as a ring, with a legend that is also the tally.
 *
 * The four segments partition the phase — they add up to the total and
 * never overlap, which is the whole reason "left to do" is split. Blocked
 * work is a subset of outstanding work, so a chart drawing "45 left" and
 * "38 blocked" side by side would be summing 83 out of 45. What it draws
 * instead is: done, skipped, blocked, and ready — the 7 tasks somebody
 * could actually pick up this morning, which is the number the other three
 * were hiding.
 *
 * Colour carries the meaning rather than decorating it. Black is finished,
 * red is stuck, grey is waiting its turn. In a red-white-black brand there
 * is exactly one accent to spend and blocked work is what deserves it —
 * done work in red would put the eye on the part that needs nobody.
 */
function PhaseDonut({
  progress: p, settled, pct, recurring,
}: {
  progress: PhaseProgress;
  settled: number;
  pct: number;
  recurring?: boolean;
}) {
  const segments = TASK_STATUS_SERIES
    .map((s) => ({ ...s, value: p[s.field] }))
    .filter((s) => s.value > 0);

  const R = 40;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="shrink-0 flex items-center gap-7">
      <div className="relative w-[168px] h-[168px]">
        <svg viewBox="0 0 100 100" className="w-[168px] h-[168px] -rotate-90">
          {/* The track shows through when a segment is missing, and keeps
              the ring a ring on a phase that has not started. */}
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="13" stroke="var(--color-o-hairline)" />
          {segments.map((s) => {
            const len = (s.value / p.total_tasks) * C;
            const arc = <circle
              key={s.key} cx="50" cy="50" r={R} fill="none" strokeWidth="13"
              stroke={s.color}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              className="transition-[stroke-dasharray,stroke-dashoffset] duration-700"
            />;
            offset += len;
            return arc;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center leading-none">
          <span className="o-figure text-[40px] text-foreground">
            {recurring ? settled : `${pct}%`}
          </span>
          <span className="o-eyebrow mt-1.5 block">
            {recurring ? `of ${p.total_tasks}` : "done"}
          </span>
        </div>
      </div>

      <dl className="text-sm space-y-2 min-w-[148px]">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span aria-hidden className="w-3 h-3 rounded-[3px] shrink-0"
                  style={{ background: s.color }} />
            <dd className={cn("o-figure text-base w-8 text-right tabular-nums",
              "alarm" in s && s.alarm ? "text-o-accent"
                : "strong" in s && s.strong ? "text-foreground"
                : "text-muted-foreground")}>
              {s.value}
            </dd>
            <dt className="text-muted-foreground">{s.label}</dt>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2 mt-1 border-t border-o-hairline">
          <span aria-hidden className="w-3 h-3 shrink-0" />
          <dd className="o-figure text-base w-8 text-right tabular-nums text-foreground">{p.total_tasks}</dd>
          <dt className="text-muted-foreground">in total</dt>
        </div>
      </dl>
    </div>
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
