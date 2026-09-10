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
import { organicPool } from "./db";

const MANUAL_STATUSES = new Set(["IN_PROGRESS", "REVIEW", "DONE", "SKIPPED"]);

interface Precondition {
  task_id: string;
  requires_task_id: string | null;
  requires_check: string | null;
}

interface TaskRow {
  id: string;
  task_id: string;
  status: string;
  /** Phase-4 tasks exist once per cycle ("URL-42125807"); everything else
   *  carries null. A precondition has to be read inside its own cycle — see
   *  statusOf(). */
  cycle: string | null;
}

/** Recompute + persist auto-statuses for one org. Returns how many rows were updated. */
export async function recomputeStatuses(orgId: string): Promise<{ updated: number }> {
  const pool = organicPool();
  const ctx = await loadStatusContext(orgId);

  const updates: { id: string; status: "TODO" | "BLOCKED" }[] = [];
  for (const t of ctx.tasks) {
    if (MANUAL_STATUSES.has(t.status)) continue;
    const reasons = evaluateBlockReasons(t.task_id, ctx, t.cycle);
    const next = reasons.length === 0 ? "TODO" : "BLOCKED";
    if (next !== t.status) updates.push({ id: t.id, status: next });
  }

  if (updates.length === 0) return { updated: 0 };

  // Single UPDATE via a VALUES join — one round-trip regardless of size.
  const values: string[] = [];
  const params: unknown[] = [];
  for (const u of updates) {
    values.push(`($${params.length + 1}::uuid, $${params.length + 2}::organic.task_status)`);
    params.push(u.id, u.status);
  }
  await pool.query(
    `UPDATE organic.client_tasks t
        SET status = v.status
       FROM (VALUES ${values.join(",")}) AS v(id, status)
      WHERE t.id = v.id`,
    params
  );
  return { updated: updates.length };
}

/** Same context, but read-only — used to render "why is this blocked?" in the UI. */
export async function loadStatusContext(orgId: string) {
  const pool = organicPool();

  const [tasksRes, precondsRes, topicsRes, urlsRes] = await Promise.all([
    pool.query<TaskRow>(
      `SELECT id::text, task_id, status::text, cycle FROM organic.client_tasks WHERE org_id = $1`,
      [orgId]
    ),
    pool.query<Precondition>(
      `SELECT task_id, requires_task_id, requires_check FROM organic.task_preconditions`
    ),
    pool.query<{ topic_name: string; active_boards: number; planned_boards: number; is_covered: boolean | null }>(
      `SELECT topic_name, active_boards, planned_boards, is_covered
         FROM organic.topic_coverage WHERE org_id = $1`,
      [orgId]
    ),
    pool.query<{ id: string }>(
      `SELECT id::text FROM organic.urls_selectable
        WHERE org_id = $1 AND is_selectable = true LIMIT 1`,
      [orgId]
    ),
  ]);

  const tasks = tasksRes.rows;
  const preconditions = precondsRes.rows;
  const topics = topicsRes.rows;
  const urls = urlsRes.rows;

  // ONE covered topic is enough to start selecting URLs, not all of them.
  //
  // It used to demand every topic, and that is a rule the method does not
  // have: coverage gates phase 4 *for what sits under that topic*, which the
  // per-URL gate in organic.urls_selectable already enforces. Store-wide it
  // means one leftover topic holds up everything — Fit Cherries, 10-09-2026,
  // had six topics of which "Fashion" (no boards at all) and "Lingerie" (one)
  // are strays from the keyword work with no URLs under them. Even after
  // building out the three topics she actually works on, step 4.1 would have
  // stayed blocked on two topics nobody was ever going to use.
  const coveredTopics = topics.filter((t) => t.is_covered === true);
  const hasCoveredTopic = coveredTopics.length > 0;
  // What is actually missing, so the reason can say it. A topic whose boards
  // are designed but not created on Pinterest is a different job from a topic
  // that is short of boards on paper — see checkUrlReadiness(), same split.
  const boardsPlanned = topics.reduce((n, t) => n + Number(t.planned_boards ?? 0), 0);
  const boardsLive = topics.reduce((n, t) => n + Number(t.active_boards ?? 0), 0);
  const hasSelectableUrl = urls.length > 0;

  // Keyed on cycle AND task, because a phase-4 task exists once per cycle and
  // a flat Map keyed on task_id alone keeps whichever row happened to come
  // last. With two cycles open on one store — Fit Cherries has exactly that —
  // that means one cycle's progress decides whether the OTHER cycle's tasks
  // unblock. Nothing on any screen shows it: the task simply is, or is not,
  // waiting on something.
  const statusByKey = new Map(tasks.map((t) => [`${t.cycle ?? ""}::${t.task_id}`, t.status]));
  const precondsByTaskId = new Map<string, Precondition[]>();
  for (const p of preconditions) {
    const arr = precondsByTaskId.get(p.task_id) ?? [];
    arr.push(p);
    precondsByTaskId.set(p.task_id, arr);
  }

  return {
    tasks,
    statusByKey,
    precondsByTaskId,
    hasCoveredTopic,
    coveredTopicsCount: coveredTopics.length,
    hasSelectableUrl,
    topicsCount: topics.length,
    boardsPlanned,
    boardsLive,
  };
}

export type StatusContext = Awaited<ReturnType<typeof loadStatusContext>>;

/**
 * Human-readable reasons why a task is currently blocked.
 * Empty array = all preconditions satisfied.
 */
export function evaluateBlockReasons(
  taskId: string,
  ctx: StatusContext,
  cycle: string | null = null,
): string[] {
  const conds = ctx.precondsByTaskId.get(taskId) ?? [];
  const reasons: string[] = [];
  /** The dependency as it stands in THIS cycle, falling back to the
   *  cycle-less row — a phase-4 task may depend on a phase-3 one, and those
   *  exist once for the store. */
  const statusOf = (dep: string) =>
    (cycle ? ctx.statusByKey.get(`${cycle}::${dep}`) : undefined) ??
    ctx.statusByKey.get(`::${dep}`);
  for (const c of conds) {
    // A `requires_check` asks whether this STORE is ready to start phase 4:
    // is any topic covered, is any URL selectable. Inside a cycle those
    // questions are already answered by the cycle existing — P4.1.4 is
    // "select this month's URLs", and it lives in a cycle that was created
    // BECAUSE a URL was selected. Evaluating them there gates work that
    // logically precedes the task's own existence, which is how Fit Cherries
    // ended up with "Select URLs · BLOCKED" on two cycles it had already
    // selected the URLs for. The dependency-on-another-task conditions still
    // apply in full: those are about this cycle's own order of work.
    if (cycle && c.requires_check) continue;
    if (c.requires_task_id) {
      const depStatus = statusOf(c.requires_task_id);
      if (depStatus !== "DONE") {
        reasons.push(`Waiting on task ${c.requires_task_id} (${depStatus ?? "not instantiated"})`);
      }
    } else if (c.requires_check === "topic_coverage") {
      if (!ctx.hasCoveredTopic) {
        // "Not covered" is three different jobs and naming the wrong one
        // sends somebody to a screen where there is nothing to do. Same
        // split as checkUrlReadiness().
        reasons.push(
          ctx.topicsCount === 0
            ? "No topics defined yet — a URL is covered by the topic it sits under"
            : ctx.boardsLive === 0 && ctx.boardsPlanned > 0
              ? `${ctx.boardsPlanned} boards are designed and none created on Pinterest yet — create them (P3.3.4). Coverage counts boards that exist on the account, not boards on paper.`
              : "No topic has five boards live on Pinterest yet — build them out (P3.3.2)"
        );
      }
    } else if (c.requires_check === "urls_selectable") {
      if (!ctx.hasSelectableUrl) {
        reasons.push(
          "No URL passes the gate yet — a URL needs a topic with five live boards and four boards of its own. " +
          "A URL that cannot reach that can still be started from the cycle panel with a reason."
        );
      }
    } else if (c.requires_check) {
      reasons.push(`Unknown precondition: ${c.requires_check}`);
    }
  }
  return reasons;
}
