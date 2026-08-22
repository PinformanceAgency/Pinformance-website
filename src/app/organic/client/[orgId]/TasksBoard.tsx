"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaskRow, TaskStatus, TaskType } from "@/lib/organic/types";

const STATUS_CHOICES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"];

export function TasksBoard({ tasks }: { tasks: TaskRow[] }) {
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
        <PhaseSection key={p.phase} phase={p.phase} tasks={p.tasks} />
      ))}
    </div>
  );
}

function PhaseSection({ phase, tasks }: { phase: number; tasks: TaskRow[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold mb-2 text-neutral-800">
        Phase {phase}{" "}
        <span className="text-neutral-400 font-normal">({tasks.length})</span>
      </h2>
      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden divide-y divide-neutral-100">
        {tasks.map((t) => (
          <TaskCard key={t.client_task_id} task={t} />
        ))}
      </div>
    </section>
  );
}

function TaskCard({ task }: { task: TaskRow }) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function commitStatus(status: TaskStatus, timeSpentMin?: number) {
    setError(null);
    const res = await fetch(`/api/organic/tasks/${task.client_task_id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, time_spent_min: timeSpentMin }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Update failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function onStatusPick(next: TaskStatus) {
    if (next === "DONE") {
      setDialogOpen(true);
      return;
    }
    await commitStatus(next);
  }

  const disabled = pending || task.status === "BLOCKED";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <TaskTypeBadge type={task.task_type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-400 tabular-nums">{task.step}</span>
            <span className="text-sm font-medium text-neutral-900">{task.name}</span>
          </div>
          {task.description && (
            <div className="mt-0.5 text-xs text-neutral-500">{task.description}</div>
          )}
          {task.task_type === "EXTERNAL" && task.external_tool && (
            <div className="mt-1 text-xs text-neutral-600 flex items-center gap-2">
              <span className="text-neutral-500">Tool:</span>
              <span className="font-medium">{task.external_tool}</span>
              {task.external_url && (
                <a
                  href={task.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Open ↗
                </a>
              )}
            </div>
          )}
          {task.status === "BLOCKED" && task.block_reasons.length > 0 && (
            <div className="mt-1.5 text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
              <span className="font-medium">Blocked:</span>{" "}
              {task.block_reasons.join(" · ")}
            </div>
          )}
          {task.time_spent_min != null && task.status === "DONE" && (
            <div className="mt-1 text-[11px] text-neutral-400">
              Logged {task.time_spent_min} min
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusSelect
            value={task.status}
            onChange={onStatusPick}
            disabled={disabled}
          />
          {task.guidance && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-neutral-500 hover:text-neutral-900 px-1"
              aria-label="Toggle guidance"
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      )}

      {expanded && task.guidance && (
        <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 whitespace-pre-wrap">
          {task.guidance}
        </div>
      )}

      {dialogOpen && (
        <CompleteDialog
          taskName={task.name}
          onCancel={() => setDialogOpen(false)}
          onConfirm={async (minutes) => {
            setDialogOpen(false);
            await commitStatus("DONE", minutes);
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
    <span
      className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-14 rounded border px-1 py-0.5 text-[9px] font-semibold tracking-wider ${c.cls}`}
      title={type}
    >
      {c.label}
    </span>
  );
}

function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (v: TaskStatus) => void;
  disabled: boolean;
}) {
  if (value === "BLOCKED") {
    return (
      <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
        Blocked
      </span>
    );
  }
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      className={`text-xs rounded-md border px-2 py-1 font-medium ${statusColor(value)} disabled:opacity-50`}
    >
      {STATUS_CHOICES.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}

function statusColor(s: TaskStatus): string {
  switch (s) {
    case "DONE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "REVIEW":
      return "border-purple-200 bg-purple-50 text-purple-700";
    case "SKIPPED":
      return "border-neutral-200 bg-neutral-100 text-neutral-500";
    case "TODO":
    default:
      return "border-neutral-200 bg-white text-neutral-700";
  }
}

function CompleteDialog({
  taskName,
  onCancel,
  onConfirm,
}: {
  taskName: string;
  onCancel: () => void;
  onConfirm: (minutes: number) => void | Promise<void>;
}) {
  const [minutes, setMinutes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    const n = Number(minutes);
    if (!isFinite(n) || n <= 0) {
      setErr("Enter a positive number of minutes.");
      return;
    }
    await onConfirm(Math.round(n));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-neutral-900">Log time spent</h3>
        <p className="mt-1 text-xs text-neutral-500">
          How many minutes did &ldquo;{taskName}&rdquo; take? (required)
        </p>
        <input
          type="number"
          min={1}
          autoFocus
          value={minutes}
          onChange={(e) => {
            setMinutes(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
          placeholder="e.g. 15"
          className="mt-3 w-full rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm"
        />
        {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          >
            Mark done
          </button>
        </div>
      </div>
    </div>
  );
}
