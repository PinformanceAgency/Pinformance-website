"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import { TaskWork } from "../../TaskWork";
import type { SkipReason, TaskRow, TaskStatus, TaskType, ViabilityRow } from "@/lib/organic/types";
import type { AssetRow } from "@/lib/organic/workspace";
import { OWNER_LABEL, phaseMeta } from "@/lib/organic/phase-meta";
import { TaskFormFor } from "../../TaskForms";
import { Phase2FormFor, type Phase2Snapshot } from "../../Phase2Forms";
import { Phase3FormFor, type Phase3Snapshot } from "../../Phase3Forms";
import { SkipDialog } from "../../SkipDialog";
import { cn } from "@/lib/utils";

const STATUS_CHOICES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];

const CUSTOM_FORM_TASKS = new Set([
  "P1.0.1","P1.0.2","P1.0.3","P1.0.4","P1.2.13",
  "P2.1.1","P2.1.3","P2.1.4","P2.1.5","P2.1.6","P2.2.1","P2.2.2","P2.3.1","P2.3.3","P2.4.1","P2.4.2",
  "P3.1.1","P3.1.2","P3.1.3","P3.1.4","P3.1.5","P3.1.6","P3.1.7","P3.1.8",
  "P3.1.9","P3.1.10","P3.1.11","P3.1.12","P3.1.13","P3.1.14","P3.2.1","P3.2.2",
  "P3.3.1","P3.3.2","P3.3.3","P3.3.4","P3.3.5","P3.3.6","P3.3.7","P3.3.8",
]);

export function PhaseBoard({
  orgId, phase, tasks, viability, phase2, phase3, assets,
}: {
  orgId: string;
  phase: number;
  tasks: TaskRow[];
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
  assets: AssetRow[];
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
          <section key={s.step} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Step header with what / where / who */}
            <div className="px-4 py-3 bg-muted/40 border-b border-border">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{sm?.title ?? `Step ${phase}.${s.step}`}</h3>
                <div className="flex items-center gap-2 text-[11px]">
                  {sm && (
                    <span className="px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground font-medium">
                      {OWNER_LABEL[sm.owner]}
                    </span>
                  )}
                  <span className="tabular-nums text-muted-foreground">{done}/{s.tasks.length} done</span>
                </div>
              </div>
              {sm && (
                <dl className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                  <div><dt className="text-muted-foreground">What</dt><dd className="text-foreground mt-0.5">{sm.what}</dd></div>
                  <div><dt className="text-muted-foreground">Where</dt><dd className="text-foreground mt-0.5">{sm.where}</dd></div>
                  <div><dt className="text-muted-foreground">Output</dt><dd className="text-foreground mt-0.5">{sm.output}</dd></div>
                </dl>
              )}
            </div>

            <div className="divide-y divide-border">
              {s.tasks.map((t) => (
                <TaskCard key={t.client_task_id} task={t} orgId={orgId}
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

function TaskCard({
  task, orgId, viability, phase2, phase3, assets,
}: {
  task: TaskRow;
  orgId: string;
  viability: ViabilityRow | null;
  phase2: Phase2Snapshot;
  phase3: Phase3Snapshot;
  assets: AssetRow[];
}) {
  const hasCustomForm = CUSTOM_FORM_TASKS.has(task.task_id);
  const [expanded, setExpanded] = useState(hasCustomForm && (task.status === "TODO" || task.status === "IN_PROGRESS"));
  const [showSkip, setShowSkip] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
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
    if (next === "DONE") {
      if (hasCustomForm) { setExpanded(true); return; }
      setShowComplete(true); return;
    }
    if (next === "SKIPPED") { setShowSkip(true); return; }
    await patch({ status: next });
  }

  const disabled = submitting || task.status === "BLOCKED";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <TaskTypeBadge type={task.task_type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground tabular-nums">{task.task_id}</span>
            <span className="text-sm font-medium text-foreground">{task.name}</span>
          </div>
          {task.guidance && (
            <div className="mt-1 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{task.guidance}</div>
          )}
          {task.task_type === "EXTERNAL" && task.external_tool && (
            <div className="mt-1.5 text-xs flex items-center gap-2">
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
            <div className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              <span className="font-medium">Blocked:</span> {task.block_reasons.join(" · ")}
            </div>
          )}
          {task.status === "DONE" && task.time_spent_min != null && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Logged {task.time_spent_min} min
              {task.notes && <span className="ml-2">· {task.notes.slice(0, 90)}</span>}
            </div>
          )}
          {task.status === "SKIPPED" && task.skip_reason && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Skipped: {task.skip_reason}{task.skip_note ? ` — ${task.skip_note}` : ""}
            </div>
          )}

        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <StatusSelect value={task.status} onChange={onStatusPick} disabled={disabled} submitting={submitting} />
          {/* Labelled, not a bare chevron. This button opens a structured
              form that writes real records, which is a different promise
              from "expand a row", and it should say so. */}
          {hasCustomForm && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {expanded ? "Hide form" : "Fill in details"}
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 break-words" role="alert">
          <span className="font-medium">Update failed:</span> {error}
        </div>
      )}

      {/* Always on screen. A note or a document is the point of most of
          these steps, and hiding both behind an icon meant the work got
          written down somewhere else. */}
      <TaskWork
        orgId={orgId}
        clientTaskId={task.client_task_id}
        taskId={task.task_id}
        taskName={task.name}
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

      {showComplete && (
        <CompleteDialog taskName={task.name} onCancel={() => setShowComplete(false)}
          onConfirm={async (minutes, link, notes) => {
            setShowComplete(false);
            await patch({ status: "DONE", time_spent_min: minutes, ...(link ? { link } : {}), ...(notes ? { notes } : {}) });
          }} />
      )}
    </div>
  );
}

function TaskTypeBadge({ type }: { type: TaskType }) {
  const config: Record<TaskType, { label: string; cls: string }> = {
    AUTO:         { label: "AUTO", cls: "bg-muted text-muted-foreground border-border" },
    AI_DRAFT:     { label: "AI",   cls: "bg-purple-50 text-purple-700 border-purple-200" },
    IN_DASHBOARD: { label: "DASH", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    EXTERNAL:     { label: "EXT",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const c = config[type];
  return (
    <span className={cn("shrink-0 mt-0.5 inline-flex items-center justify-center w-14 rounded border px-1 py-0.5 text-[9px] font-semibold tracking-wider", c.cls)} title={type}>
      {c.label}
    </span>
  );
}

function StatusSelect({ value, onChange, disabled, submitting }: {
  value: TaskStatus; onChange: (v: TaskStatus) => void; disabled: boolean; submitting: boolean;
}) {
  if (value === "BLOCKED") {
    return (
      <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
        Blocked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {submitting && <span className="text-[10px] text-muted-foreground" aria-live="polite">saving…</span>}
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as TaskStatus)}
        className={cn("text-xs rounded-md border px-2 py-1 font-medium disabled:opacity-50 disabled:cursor-wait", statusColor(value))}>
        {STATUS_CHOICES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
    </span>
  );
}

function statusColor(s: TaskStatus): string {
  switch (s) {
    case "DONE":        return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS": return "border-blue-200 bg-blue-50 text-blue-700";
    case "REVIEW":      return "border-purple-200 bg-purple-50 text-purple-700";
    case "SKIPPED":     return "border-border bg-muted text-muted-foreground";
    default:            return "border-border bg-card text-foreground";
  }
}

function CompleteDialog({ taskName, onCancel, onConfirm }: {
  taskName: string;
  onCancel: () => void;
  onConfirm: (minutes: number, link?: string, notes?: string) => void | Promise<void>;
}) {
  const [minutes, setMinutes] = useState("");
  const [link, setLink] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function confirm() {
    const n = Number(minutes);
    if (!isFinite(n) || n <= 0) { setErr("Enter a positive number of minutes."); return; }
    const l = link.trim();
    if (l && !/^https?:\/\//i.test(l)) { setErr("Link must start with http(s)://"); return; }
    await onConfirm(Math.round(n), l || undefined, notes.trim() || undefined);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">Complete &ldquo;{taskName}&rdquo;</h3>
        <label className="mt-3 block">
          <span className="text-xs text-muted-foreground">Time spent (minutes, required)</span>
          <input type="number" min={1} autoFocus value={minutes}
            onChange={(e) => { setMinutes(e.target.value); if (err) setErr(null); }}
            placeholder="15"
            className="mt-1 w-full rounded-md border border-border px-2.5 py-1.5 text-sm bg-card" />
        </label>
        <label className="mt-3 block">
          <span className="text-xs text-muted-foreground">Document / URL (optional — saved to Assets)</span>
          <input type="url" value={link}
            onChange={(e) => { setLink(e.target.value); if (err) setErr(null); }}
            placeholder="https://drive.google.com/…"
            className="mt-1 w-full rounded-md border border-border px-2.5 py-1.5 text-xs bg-card" />
        </label>
        <label className="mt-3 block">
          <span className="text-xs text-muted-foreground">Result / notes (optional)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="What did you find? Any URLs pasted here are also saved to Assets."
            className="mt-1 w-full rounded-md border border-border px-2.5 py-1.5 text-xs bg-card" />
        </label>
        {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted">Cancel</button>
          <button onClick={confirm} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:opacity-90">Mark done</button>
        </div>
      </div>
    </div>
  );
}
