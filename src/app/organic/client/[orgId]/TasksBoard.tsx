"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SkipReason, TaskRow, TaskStatus, TaskType, ViabilityRow } from "@/lib/organic/types";
import { TaskFormFor } from "./TaskForms";
import { SkipDialog } from "./SkipDialog";

const STATUS_CHOICES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];

// Tasks that render a dedicated form. DONE for these is only reachable via
// the form submit — the plain dropdown-to-DONE path is disabled so the
// domain data always gets written.
const CUSTOM_FORM_TASKS = new Set(["P1.0.1", "P1.0.2", "P1.0.3", "P1.0.4", "P1.2.13"]);

export function TasksBoard({
  orgId, tasks, viability,
}: {
  orgId: string;
  tasks: TaskRow[];
  viability: ViabilityRow | null;
  initialDomain: string | null;
}) {
  const phases = useMemo(() => {
    const byPhase = new Map<number, TaskRow[]>();
    for (const t of tasks) {
      const arr = byPhase.get(t.phase) ?? [];
      arr.push(t);
      byPhase.set(t.phase, arr);
    }
    return Array.from(byPhase.entries())
      .map(([phase, ts]) => ({ phase, tasks: ts }))
      .sort((a, b) => a.phase - b.phase);
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-sm text-neutral-500 text-center">
        No tasks instantiated yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {phases.map((p) => (
        <PhaseSection key={p.phase} phase={p.phase} tasks={p.tasks} orgId={orgId} viability={viability} />
      ))}
    </div>
  );
}

function PhaseSection({
  phase, tasks, orgId, viability,
}: {
  phase: number;
  tasks: TaskRow[];
  orgId: string;
  viability: ViabilityRow | null;
}) {
  // Group by step within a phase so operators see the SOP structure.
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

  return (
    <section>
      <h2 className="text-sm font-semibold mb-2 text-neutral-800">
        Phase {phase} <span className="text-neutral-400 font-normal">({tasks.length})</span>
      </h2>
      <div className="space-y-3">
        {steps.map((s) => (
          <div key={s.step} className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
            <div className="px-3 py-1.5 text-[11px] font-medium text-neutral-500 bg-neutral-50 border-b border-neutral-100">
              Step {phase}.{s.step}
            </div>
            <div className="divide-y divide-neutral-100">
              {s.tasks.map((t) => (
                <TaskCard key={t.client_task_id} task={t} orgId={orgId} viability={viability} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskCard({
  task, orgId, viability,
}: {
  task: TaskRow;
  orgId: string;
  viability: ViabilityRow | null;
}) {
  const hasCustomForm = CUSTOM_FORM_TASKS.has(task.task_id);
  const [expanded, setExpanded] = useState(
    // Auto-expand actionable custom-form tasks so operators can act without an extra click.
    hasCustomForm && (task.status === "TODO" || task.status === "IN_PROGRESS")
  );
  const [showSkip, setShowSkip] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function patch(body: Record<string, unknown>) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/organic/tasks/${task.client_task_id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      });
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = JSON.parse(text); } catch { /* keep raw */ }
      if (!res.ok) {
        const snippet = text ? text.replace(/\s+/g, " ").slice(0, 140) : "";
        throw new Error(data.error ?? `HTTP ${res.status}${snippet ? ` — ${snippet}` : ""}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onStatusPick(next: TaskStatus) {
    if (next === task.status) return;
    if (next === "DONE") {
      if (hasCustomForm) { setExpanded(true); return; }
      setShowComplete(true);
      return;
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
            <span className="text-[11px] text-neutral-400 tabular-nums">{task.task_id}</span>
            <span className="text-sm font-medium text-neutral-900">{task.name}</span>
          </div>
          {task.description && (
            <div className="mt-0.5 text-xs text-neutral-500">{task.description}</div>
          )}
          {task.guidance && (
            <div className="mt-1 text-xs text-neutral-600 leading-relaxed">
              <span className="text-neutral-400">Guidance: </span>
              {task.guidance}
            </div>
          )}
          {task.task_type === "EXTERNAL" && task.external_tool && (
            <div className="mt-1 text-xs text-neutral-600 flex items-center gap-2">
              <span className="text-neutral-500">Tool:</span>
              <span className="font-medium">{task.external_tool}</span>
              {task.external_url && (
                <a href={task.external_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Open ↗
                </a>
              )}
            </div>
          )}
          {task.status === "BLOCKED" && task.block_reasons.length > 0 && (
            <div className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
              <span className="font-medium">Blocked:</span> {task.block_reasons.join(" · ")}
            </div>
          )}
          {task.status === "DONE" && task.time_spent_min != null && (
            <div className="mt-1 text-[11px] text-neutral-400">
              Logged {task.time_spent_min} min
              {task.notes && <span className="ml-2 text-neutral-500">· {task.notes.slice(0, 100)}</span>}
            </div>
          )}
          {task.status === "SKIPPED" && task.skip_reason && (
            <div className="mt-1 text-[11px] text-neutral-500">
              Skipped: {task.skip_reason}{task.skip_note ? ` — ${task.skip_note}` : ""}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusSelect value={task.status} onChange={onStatusPick} disabled={disabled} submitting={submitting} />
          {hasCustomForm && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
            >
              {expanded ? "Close" : "Open"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 break-words" role="alert">
          <span className="font-medium">Update failed:</span> {error}
        </div>
      )}

      {expanded && hasCustomForm && (
        <div className="mt-3">
          <TaskFormFor
            orgId={orgId}
            task={task}
            viability={viability}
            onDone={() => {
              setExpanded(false);
              startTransition(() => router.refresh());
            }}
          />
        </div>
      )}

      {showSkip && (
        <SkipDialog
          taskName={task.name}
          onCancel={() => setShowSkip(false)}
          onConfirm={async (skip_reason: SkipReason, note: string) => {
            await patch({ status: "SKIPPED", skip_reason, skip_note: note || null });
            setShowSkip(false);
          }}
        />
      )}

      {showComplete && (
        <CompleteDialog
          taskName={task.name}
          onCancel={() => setShowComplete(false)}
          onConfirm={async (minutes) => {
            setShowComplete(false);
            await patch({ status: "DONE", time_spent_min: minutes });
          }}
        />
      )}
    </div>
  );
}

function TaskTypeBadge({ type }: { type: TaskType }) {
  const config: Record<TaskType, { label: string; cls: string }> = {
    AUTO: { label: "AUTO", cls: "bg-neutral-100 text-neutral-600 border-neutral-200" },
    AI_DRAFT: { label: "AI", cls: "bg-purple-50 text-purple-700 border-purple-200" },
    IN_DASHBOARD: { label: "DASH", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    EXTERNAL: { label: "EXT", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  };
  const c = config[type];
  return (
    <span className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-14 rounded border px-1 py-0.5 text-[9px] font-semibold tracking-wider ${c.cls}`} title={type}>
      {c.label}
    </span>
  );
}

function StatusSelect({
  value, onChange, disabled, submitting,
}: {
  value: TaskStatus;
  onChange: (v: TaskStatus) => void;
  disabled: boolean;
  submitting: boolean;
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
      {submitting && <span className="text-[10px] text-neutral-400" aria-live="polite">saving…</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        className={`text-xs rounded-md border px-2 py-1 font-medium ${statusColor(value)} disabled:opacity-50 disabled:cursor-wait`}
      >
        {STATUS_CHOICES.map((s) => (
          <option key={s} value={s}>{s.replace("_", " ")}</option>
        ))}
      </select>
    </span>
  );
}

function statusColor(s: TaskStatus): string {
  switch (s) {
    case "DONE": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS": return "border-blue-200 bg-blue-50 text-blue-700";
    case "REVIEW": return "border-purple-200 bg-purple-50 text-purple-700";
    case "SKIPPED": return "border-neutral-200 bg-neutral-100 text-neutral-500";
    case "TODO":
    default: return "border-neutral-200 bg-white text-neutral-700";
  }
}

function CompleteDialog({
  taskName, onCancel, onConfirm,
}: {
  taskName: string;
  onCancel: () => void;
  onConfirm: (minutes: number) => void | Promise<void>;
}) {
  const [minutes, setMinutes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function confirm() {
    const n = Number(minutes);
    if (!isFinite(n) || n <= 0) { setErr("Enter a positive number of minutes."); return; }
    await onConfirm(Math.round(n));
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-neutral-900">Log time spent</h3>
        <p className="mt-1 text-xs text-neutral-500">
          How many minutes did &ldquo;{taskName}&rdquo; take? (required)
        </p>
        <input
          type="number"
          min={1}
          autoFocus
          value={minutes}
          onChange={(e) => { setMinutes(e.target.value); if (err) setErr(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
          placeholder="e.g. 15"
          className="mt-3 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 hover:bg-neutral-50">Cancel</button>
          <button onClick={confirm} className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700">Mark done</button>
        </div>
      </div>
    </div>
  );
}
