/**
 * Task-status recompute — the heart of the organic app.
 *
 * For every client_task belonging to an org:
 *   • Manual statuses (IN_PROGRESS, REVIEW, DONE, SKIPPED) are respected —
 *     buyers keep control.
 *   • Auto statuses (BLOCKED, TODO) are recomputed from the task's
 *     preconditions:
 *       - requires_task_id  → satisfied when that task is DONE
 *       - requires_check='topic_coverage'  → every topic for this org has
 *         is_covered = true in the topic_coverage view
 *       - requires_check='urls_selectable' → at least one URL for this org
 *         has is_selectable = true in the urls_selectable view
 *   • With zero unmet preconditions → TODO. Otherwise → BLOCKED, and the
 *     unmet preconditions are surfaced as human-readable reasons for the UI.
 *
 * Call this after every status change so downstream tasks unlock immediately.
 */
import { organicDb } from "./db";

const MANUAL_STATUSES = new Set(["IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"]);

interface Precondition {
  task_id: string;
  requires_task_id: string | null;
  requires_check: string | null;
}

/** Recompute + persist auto-statuses for one org. Returns how many rows were updated. */
export async function recomputeStatuses(orgId: string): Promise<{ updated: number }> {
  const ctx = await loadStatusContext(orgId);

  const updates: { id: string; status: "TODO" | "BLOCKED" }[] = [];
  for (const t of ctx.tasks) {
    if (MANUAL_STATUSES.has(t.status)) continue;
    const reasons = evaluateBlockReasons(t.task_id, ctx);
    const next = reasons.length === 0 ? "TODO" : "BLOCKED";
    if (next !== t.status) updates.push({ id: t.id, status: next });
  }

  if (updates.length === 0) return { updated: 0 };

  const db = organicDb();
  // Update one at a time — batch upsert would require sending every column;
  // we typically toggle a handful of rows per recompute.
  for (const u of updates) {
    const { error } = await db.from("client_tasks").update({ status: u.status }).eq("id", u.id);
    if (error) throw new Error(`recompute update failed: ${error.message}`);
  }
  return { updated: updates.length };
}

/** Same context, but read-only — used to render "why is this blocked?" in the UI. */
export async function loadStatusContext(orgId: string) {
  const db = organicDb();

  const [tasksRes, precondsRes, topicsRes, urlsRes] = await Promise.all([
    db.from("client_tasks").select("id, task_id, status").eq("org_id", orgId),
    db.from("task_preconditions").select("task_id, requires_task_id, requires_check"),
    db.from("topic_coverage").select("is_covered").eq("org_id", orgId),
    db.from("urls_selectable").select("id").eq("org_id", orgId).eq("is_selectable", true).limit(1),
  ]);

  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (precondsRes.error) throw new Error(precondsRes.error.message);
  if (topicsRes.error) throw new Error(topicsRes.error.message);
  if (urlsRes.error) throw new Error(urlsRes.error.message);

  const tasks = (tasksRes.data ?? []) as { id: string; task_id: string; status: string }[];
  const preconditions = (precondsRes.data ?? []) as Precondition[];
  const topics = (topicsRes.data ?? []) as { is_covered: boolean | null }[];
  const urls = urlsRes.data ?? [];

  // "Every topic covered" — vacuously true when there are no topics yet, but
  // then any task that depends on topic_coverage is by definition unmet
  // (there's nothing covered). Treat empty as NOT covered.
  const topicsAllCovered = topics.length > 0 && topics.every((t) => t.is_covered === true);
  const hasSelectableUrl = urls.length > 0;

  const statusByTaskId = new Map(tasks.map((t) => [t.task_id, t.status]));
  const precondsByTaskId = new Map<string, Precondition[]>();
  for (const p of preconditions) {
    const arr = precondsByTaskId.get(p.task_id) ?? [];
    arr.push(p);
    precondsByTaskId.set(p.task_id, arr);
  }

  return {
    tasks,
    statusByTaskId,
    precondsByTaskId,
    topicsAllCovered,
    hasSelectableUrl,
    topicsCount: topics.length,
  };
}

export type StatusContext = Awaited<ReturnType<typeof loadStatusContext>>;

/**
 * Human-readable reasons why a task is currently blocked.
 * Empty array = all preconditions satisfied.
 */
export function evaluateBlockReasons(taskId: string, ctx: StatusContext): string[] {
  const conds = ctx.precondsByTaskId.get(taskId) ?? [];
  const reasons: string[] = [];
  for (const c of conds) {
    if (c.requires_task_id) {
      const depStatus = ctx.statusByTaskId.get(c.requires_task_id);
      if (depStatus !== "DONE") {
        reasons.push(`Waiting on task ${c.requires_task_id} (${depStatus ?? "not instantiated"})`);
      }
    } else if (c.requires_check === "topic_coverage") {
      if (!ctx.topicsAllCovered) {
        reasons.push(
          ctx.topicsCount === 0
            ? "No topics defined yet"
            : "Not every topic is covered yet"
        );
      }
    } else if (c.requires_check === "urls_selectable") {
      if (!ctx.hasSelectableUrl) {
        reasons.push("No selectable URLs available yet");
      }
    } else if (c.requires_check) {
      reasons.push(`Unknown precondition: ${c.requires_check}`);
    }
  }
  return reasons;
}
