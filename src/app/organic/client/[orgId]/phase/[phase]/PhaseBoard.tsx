"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { TaskWork } from "../../TaskWork";
import { TaskChecklist } from "../../TaskChecklist";
import { fieldsFor } from "@/lib/organic/task-fields";
import type { TaskAnswer } from "@/lib/organic/workspace";
import type { SkipReason, TaskRow, TaskStatus, TaskType, ViabilityRow } from "@/lib/organic/types";
import type { AssetRow } from "@/lib/organic/workspace";
import { OWNER_LABEL, phaseMeta } from "@/lib/organic/phase-meta";
import { TaskFormFor } from "../../TaskForms";
import { Phase2FormFor, type Phase2Snapshot } from "../../Phase2Forms";
import { Phase3FormFor, type Phase3Snapshot } from "../../Phase3Forms";
import { SkipDialog } from "../../SkipDialog";
import { Phase4Action } from "../../Phase4Action";
import type { CycleView } from "@/lib/organic/phase4";
import { cn } from "@/lib/utils";

const STATUS_CHOICES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];

// Tasks whose old bespoke form still does work the new question set does
// not — running a crawl, writing a related table, importing a CSV.
//
// P1.0.1, P1.0.2 and P1.0.4 are deliberately absent: they were nothing but
// tick grids, the question set replaces them outright, and leaving both on
// screen meant the same six signals appeared twice with only one of them
// recording why. Their answers are mirrored into client_viability by the
// answers endpoint so the phase gate still opens.
const CUSTOM_FORM_TASKS = new Set([
  "P1.0.3","P1.2.13",
  "P2.1.1","P2.1.3","P2.1.4","P2.1.5","P2.1.6","P2.2.1","P2.2.2","P2.3.1","P2.3.3","P2.4.1","P2.4.2",
  "P3.1.1","P3.1.2","P3.1.3","P3.1.4","P3.1.5","P3.1.6","P3.1.7","P3.1.8",
  "P3.1.9","P3.1.10","P3.1.11","P3.1.12","P3.1.13","P3.1.14","P3.2.1","P3.2.2",
  "P3.3.1","P3.3.2","P3.3.3","P3.3.4","P3.3.5","P3.3.6","P3.3.7","P3.3.8",
]);

export function PhaseBoard({
  orgId, phase, tasks, viability, phase2, phase3, assets, answers, showStepHeaders = true,
}: {
  orgId: string;
  phase: number;
  tasks: TaskRow[];
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
  assets: AssetRow[];
  answers: TaskAnswer[];
  /** The step route renders the step's own title and context panel above
   *  the board, so it turns this off — two headers for one step is the
   *  kind of duplication that makes a screen look unconsidered. */
  showStepHeaders?: boolean;
}) {
  const meta = phaseMeta(phase);
  const steps = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const arr = m.get(t.step) ?? [];
      arr.push(t);
      m.set(t.step, arr);
    }
    return Array.from(m.entries())
      .map(([step, ts]) => ({ step, tasks: ts.sort((a, b) => a.sort_order - b.sort_order) }))
      .sort((a, b) => a.step.localeCompare(b.step));
  }, [tasks]);

  const assetsByTask = useMemo(() => {
    const m = new Map<string, AssetRow[]>();
    for (const a of assets) {
      if (!a.linked_task_id) continue;
      const arr = m.get(a.linked_task_id) ?? [];
      arr.push(a);
      m.set(a.linked_task_id, arr);
    }
    return m;
  }, [assets]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground text-center">
        No tasks in this phase yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {steps.map((s) => {
        const sm = meta?.steps[s.step] ?? null;
        const done = s.tasks.filter((t) => t.status === "DONE").length;
        return (
          <section key={s.step} className={cn(showStepHeaders && "o-card overflow-hidden")}>
            {showStepHeaders && (
              <div className="o-card-head px-6 py-5">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <h3 className="o-h3 text-foreground">{sm?.title ?? `Step ${phase}.${s.step}`}</h3>
                  <div className="flex items-center gap-2.5">
                    {sm && (
                      <span className="inline-flex items-center rounded-md px-2 py-[3px] text-[11px] font-semibold bg-o-sunk text-o-ink-2 ring-1 ring-inset ring-o-hairline-firm/60">
                        {OWNER_LABEL[sm.owner]}
                      </span>
                    )}
                    <span className="o-figure text-[11px] text-o-ink-3">{done}/{s.tasks.length} done</span>
                  </div>
                </div>
                {sm && (
                  <dl className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-px bg-o-hairline rounded-lg overflow-hidden">
                    {([["What", sm.what], ["Where", sm.where], ["Output", sm.output]] as const).map(([k, v]) => (
                      <div key={k} className="bg-o-surface px-4 py-3">
                        <dt className="o-eyebrow">{k}</dt>
                        <dd className="mt-1.5 text-sm text-o-ink-2 leading-relaxed">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}

            <div className={cn(showStepHeaders ? "divide-y divide-o-hairline" : "space-y-4")}>
              {s.tasks.map((t) => (
                <TaskCard answers={answers} standalone={!showStepHeaders} key={t.client_task_id} task={t} orgId={orgId}
                  viability={viability} phase2={phase2} phase3={phase3}
                  assets={assetsByTask.get(t.task_id) ?? []} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Exported so phase 4's cycle panel renders the same card.
 *
 * Cycle tasks used to be a read-only list of id, name and a status pill,
 * which made the twenty-two tasks the SOP defines for phase 4 unworkable:
 * you could see P4.2.4 existed and was TODO, and nowhere could you read
 * what it asks, what it hands back, record it, attach the designs or close
 * it. There is no reason for a cycle task to work differently from any
 * other task, and every reason for it not to.
 */
export function TaskCard({
  task, orgId, viability, phase2, phase3, assets, answers, standalone, cycle,
}: {
  /** Set on phase-4 tasks. Its presence is what switches the card from the
   *  research treatment to the execution one. */
  cycle?: CycleView;
  task: TaskRow;
  orgId: string;
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
  assets: AssetRow[];
  answers: TaskAnswer[];
  /** On the step route there is no step card wrapping the list, so each
   *  task carries its own surface instead of being a divider-separated
   *  row inside one. */
  standalone?: boolean;
}) {
  const hasCustomForm = CUSTOM_FORM_TASKS.has(task.task_id);
  const fields = fieldsFor(task.task_id);
  const [expanded, setExpanded] = useState(hasCustomForm && (task.status === "TODO" || task.status === "IN_PROGRESS"));
  const [showSkip, setShowSkip] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function patch(body: Record<string, unknown>) {
    setError(null); setSubmitting(true);
    try {
      const res = await fetch(`/api/organic/tasks/${task.client_task_id}/status`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(body), redirect: "error",
      });
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(text); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status} — ${text.replace(/\s+/g, " ").slice(0, 140)}`);
      startTransition(() => router.refresh());
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }

  async function onStatusPick(next: TaskStatus) {
    if (next === task.status) return;
    // DONE used to open a dialog asking for a result and a document, both
    // optional, on a task that already carries a work panel and — where it
    // has a checklist — closes itself. That is a modal in the way of a
    // decision already made. Skipping still asks, because a skip needs a
    // reason to be worth anything later.
    if (next === "DONE" && hasCustomForm) { setExpanded(true); return; }
    if (next === "SKIPPED") { setShowSkip(true); return; }
    await patch({ status: next });
  }

  const disabled = submitting || task.status === "BLOCKED";

  return (
    <div className={cn("px-6 py-6", standalone && "o-card")}>
      {/* The task heading runs the full width. It used to sit in a narrow
          column beside the controls, which squeezed the one piece of text
          that tells you what to do into two cramped lines. */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <TaskTypeBadge type={task.task_type} />
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{task.task_id}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 order-3 sm:order-2 ml-auto">
          <StatusSelect value={task.status} onChange={onStatusPick} disabled={disabled} submitting={submitting} />
          {hasCustomForm && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="o-btn">
              <SlidersHorizontal className="w-4 h-4" />
              {expanded ? "Hide form" : "Open form"}
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}
        </div>
        <div className="w-full order-2 sm:order-3">
          <h3 className="text-lg font-semibold text-foreground leading-snug">{task.name}</h3>
          {task.guidance && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap max-w-4xl">{task.guidance}</p>
          )}
          {task.task_type === "EXTERNAL" && task.external_tool && (
            <div className="mt-2.5 text-sm flex items-center gap-2">
              <span className="text-muted-foreground">Tool:</span>
              <span className="font-medium text-foreground">{task.external_tool}</span>
              {task.external_url && (
                <a href={task.external_url} target="_blank" rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1">
                  Open <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
          {task.status === "BLOCKED" && task.block_reasons.length > 0 && (
            <div className="mt-3 flex gap-2.5 rounded-lg bg-o-accent/[0.05] ring-1 ring-inset ring-o-accent/15 px-3.5 py-2.5">
              <span aria-hidden className="w-[3px] rounded-full bg-o-accent shrink-0" />
              <p className="text-sm text-o-ink-2">
                <span className="font-semibold text-o-accent">Blocked</span> · {task.block_reasons.join(" · ")}
              </p>
            </div>
          )}

          {task.status === "SKIPPED" && task.skip_reason && (
            <div className="mt-2 text-sm text-muted-foreground">
              Skipped: {task.skip_reason}{task.skip_note ? ` — ${task.skip_note}` : ""}
            </div>
          )}

        </div>

      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-o-neg/[0.06] ring-1 ring-inset ring-o-neg/20 px-3.5 py-2.5 text-sm text-o-neg break-words" role="alert">
          <span className="font-semibold">Update failed.</span> {error}
        </div>
      )}

      {/* The questions, where a task has any. Most do not: "collect brand
          book" wants the brand book, not three paragraphs about fetching
          it, and the work panel below already takes both the writing and
          the file. */}
      {fields && (
        <TaskChecklist
          orgId={orgId}
          taskId={task.task_id}
          set={fields}
          answers={answers}
          readOnly={task.status === "BLOCKED"}
        />
      )}

      {/* Phase 4 is execution, so its tasks get the control that does the
          work rather than a box to describe it in. The work panel still
          renders underneath — a designer's export or a client's reply is
          still worth attaching — but it is no longer the whole answer. */}
      {cycle && <Phase4Action orgId={orgId} taskId={task.task_id} cycle={cycle} />}

      <TaskWork
        orgId={orgId}
        clientTaskId={task.client_task_id}
        taskId={task.task_id}
        taskName={task.name}
        expectedOutput={cycle ? null : task.expected_output}
        notes={task.notes ?? null}
        assets={assets}
        readOnly={task.status === "BLOCKED"}
      />

      {expanded && hasCustomForm && (
        <div className="mt-3">
          {task.task_id.startsWith("P3.") ? (
            <Phase3FormFor orgId={orgId} task={task} snapshot={phase3}
              onDone={() => { setExpanded(false); startTransition(() => router.refresh()); }} />
          ) : task.task_id.startsWith("P2.") ? (
            <Phase2FormFor orgId={orgId} task={task} snapshot={phase2}
              onDone={() => { setExpanded(false); startTransition(() => router.refresh()); }} />
          ) : (
            <TaskFormFor orgId={orgId} task={task} viability={viability}
              onDone={() => { setExpanded(false); startTransition(() => router.refresh()); }} />
          )}
        </div>
      )}

      {showSkip && (
        <SkipDialog taskName={task.name} onCancel={() => setShowSkip(false)}
          onConfirm={async (skip_reason: SkipReason, note: string) => {
            await patch({ status: "SKIPPED", skip_reason, skip_note: note || null });
            setShowSkip(false);
          }} />
      )}

    </div>
  );
}

function TaskTypeBadge({ type }: { type: TaskType }) {
  // Red, white and black. The palette used to run purple / blue / amber
  // per type, which is four brand colours the brand does not have —
  // difference is carried by fill and weight instead.
  const config: Record<TaskType, { label: string; cls: string; title: string }> = {
    AUTO:         { label: "AUTO", cls: "bg-o-sunk text-o-ink-3 ring-o-hairline-firm/60",
                    title: "Runs automatically" },
    AI_DRAFT:     { label: "AI",   cls: "bg-o-ink text-white ring-o-ink",
                    title: "AI drafts it, you approve" },
    IN_DASHBOARD: { label: "HERE", cls: "bg-o-accent text-white ring-o-accent",
                    title: "Done in this dashboard" },
    EXTERNAL:     { label: "EXT",  cls: "bg-o-surface text-o-ink ring-o-ink/35",
                    title: "Done in an external tool" },
  };
  const c = config[type];
  return (
    <span className={cn(
      "shrink-0 inline-flex items-center justify-center w-[3.25rem] rounded-md px-1 py-1",
      "text-[10px] font-bold tracking-[0.08em] ring-1 ring-inset", c.cls
    )} title={c.title}>
      {c.label}
    </span>
  );
}

function StatusSelect({ value, onChange, disabled, submitting }: {
  value: TaskStatus; onChange: (v: TaskStatus) => void; disabled: boolean; submitting: boolean;
}) {
  if (value === "BLOCKED") {
    return (
      <span className="inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary">
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {submitting && <span className="text-xs text-muted-foreground" aria-live="polite">saving…</span>}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as TaskStatus)}
        className={cn("o-input w-auto font-medium pr-8 disabled:cursor-wait", statusColor(value))}>
        {STATUS_CHOICES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
    </span>
  );
}

function statusColor(s: TaskStatus): string {
  // Done is the settled state and reads black-on-white; anything the
  // manager still owns carries the accent. Green and purple were doing a
  // job the brand's own two colours can do.
  switch (s) {
    case "DONE":        return "!bg-o-ink !border-o-ink !text-white";
    case "IN_PROGRESS": return "!bg-o-accent/[0.08] !border-o-accent/40 !text-o-accent";
    case "REVIEW":      return "!bg-o-accent !border-o-accent !text-white";
    case "SKIPPED":     return "!bg-o-sunk !text-o-ink-3";
    default:            return "";
  }
}

