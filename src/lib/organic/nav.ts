/**
 * The navigation tree, loaded server-side.
 *
 * The sidebar is the SOP made navigable, so its shape comes from the task
 * bank rather than from a hand-maintained list of links. Adding a task
 * definition puts it in the navigation; nothing has to be kept in sync by
 * hand.
 *
 * One query per store, three levels: phase → step → task. Counts ride
 * along at every level because a phase you cannot see the state of is
 * just a link.
 */
import { organicPool } from "./db";
import { PHASE_META } from "./phase-meta";

export interface NavTask {
  task_id: string;
  name: string;
  status: string;
}

export interface NavStep {
  step: string;
  /** From PHASE_META where we have prose for it; falls back to the raw
   *  key so a step added to the bank before its copy still navigates. */
  title: string;
  tasks: NavTask[];
  done: number;
  blocked: number;
  outstanding: number;
  /** Tasks that actually exist for this store. Zero means the step has
   *  not started, which is not the same as finished — and the difference
   *  decides whether the sidebar shows a completion dot. */
  instantiated: number;
}

export interface NavPhase {
  phase: number;
  title: string;
  steps: NavStep[];
  done: number;
  total: number;
  blocked: number;
  outstanding: number;
  pct: number;
}

export interface ClientNav {
  org_id: string;
  name: string;
  /** False for a store that exists but has no organic task bank yet. The
   *  switcher still names it — the URL is that store, and saying "All
   *  clients" while looking at one is just wrong — but the phase, library
   *  and report sections have nothing to point at. */
  activated: boolean;
  phases: NavPhase[];
  /** Everything actionable today, for the Today badge. */
  today_count: number;
}

/** Short labels for the sidebar. The long ones live in PHASE_META and are
 *  used on the phase pages, where there is room for them. */
const PHASE_LABEL: Record<number, string> = {
  1: "Onboarding & audit",
  2: "Market research",
  3: "SEO architecture",
  4: "Content engine",
  5: "Review & reporting",
};

export async function loadClientNav(orgId: string): Promise<ClientNav | null> {
  const pool = organicPool();

  const [org, tasks, today] = await Promise.all([
    pool.query<{ name: string; activated: boolean }>(
      `SELECT o.name, cs.org_id IS NOT NULL AS activated
         FROM public.organizations o
         LEFT JOIN organic.client_settings cs ON cs.org_id = o.id
        WHERE o.id = $1`, [orgId]),
    // Driven from task_definitions, not client_tasks.
    //
    // Phases 4 and 5 are recurring and their tasks are instantiated per
    // cycle, so a store that has never run one has no rows for them at
    // all. Joining from the instance side rendered "Monthly management"
    // as an empty group — the two phases that define the ongoing service
    // simply missing from the navigation. The SOP has five phases whether
    // or not this store has reached them, so the skeleton comes from the
    // definitions and status is attached where an instance exists.
    pool.query<{ task_id: string; phase: number; step: string; name: string; status: string | null }>(
      `SELECT td.id AS task_id, td.phase, td.step, td.name,
              ct.status::text AS status
         FROM organic.task_definitions td
         LEFT JOIN organic.client_tasks ct
                ON ct.task_id = td.id
               AND ct.org_id = $1
               AND (ct.cycle IS NULL OR ct.cycle NOT LIKE 'URL-%')
        WHERE td.active
        ORDER BY td.phase, td.sort_order`, [orgId]),
    // Actionable now: unblocked outstanding work, plus anything publishing
    // or failed today. This is the number on the Today badge, so it has to
    // mean "things I can act on", not "things that exist".
    pool.query<{ n: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM organic.client_tasks ct
            JOIN organic.task_definitions td ON td.id = ct.task_id
           WHERE ct.org_id = $1 AND td.active
             AND ct.status IN ('TODO','IN_PROGRESS','REVIEW'))
         +
         (SELECT COUNT(*) FROM organic.pins p
            JOIN organic.waterfalls w ON w.id = p.waterfall_id
           WHERE w.org_id = $1
             AND (p.scheduled_date = current_date OR p.status = 'FAILED')
             AND p.status <> 'CANCELLED')
       ) AS n`, [orgId]),
  ]);

  if (org.rowCount === 0) return null;

  const byPhase = new Map<number, Map<string, NavStep>>();
  for (const t of tasks.rows) {
    let steps = byPhase.get(t.phase);
    if (!steps) { steps = new Map(); byPhase.set(t.phase, steps); }

    let s = steps.get(t.step);
    if (!s) {
      s = {
        step: t.step,
        title: PHASE_META[t.phase]?.steps?.[t.step]?.title ?? `Step ${t.phase}.${t.step}`,
        tasks: [], done: 0, blocked: 0, outstanding: 0, instantiated: 0,
      };
      steps.set(t.step, s);
    }

    // No instance yet — the task exists in the SOP but this store has not
    // reached it. Shown as pending rather than counted as outstanding
    // work, so a never-started phase 4 does not read as a backlog.
    const status = t.status ?? "PENDING";
    s.tasks.push({ task_id: t.task_id, name: t.name, status });
    if (status !== "PENDING") s.instantiated++;
    if (status === "DONE") s.done++;
    else if (status === "BLOCKED") { s.blocked++; s.outstanding++; }
    else if (status !== "SKIPPED" && status !== "PENDING") s.outstanding++;
  }

  const phases: NavPhase[] = [];
  for (const [phase, steps] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
    const list = [...steps.values()].sort((a, b) => a.step.localeCompare(b.step, undefined, { numeric: true }));
    // Only instantiated tasks count toward progress. A phase whose tasks
    // do not exist for this store yet is "not started", not "0% of 22".
    const total = list.reduce((n, s) => n + s.tasks.filter((t) => t.status !== "PENDING").length, 0);
    const done = list.reduce((n, s) => n + s.done, 0);
    // Skipped tasks count as resolved for the bar — a step deliberately
    // skipped is finished business, not outstanding work.
    const skipped = list.reduce((n, s) => n + s.tasks.filter((t) => t.status === "SKIPPED").length, 0);
    phases.push({
      phase,
      title: PHASE_LABEL[phase] ?? `Phase ${phase}`,
      steps: list,
      done, total,
      blocked: list.reduce((n, s) => n + s.blocked, 0),
      outstanding: list.reduce((n, s) => n + s.outstanding, 0),
      pct: total > 0 ? Math.round(((done + skipped) / total) * 100) : 0,
    });
  }

  return {
    org_id: orgId,
    name: org.rows[0].name,
    activated: org.rows[0].activated,
    phases,
    today_count: Number(today.rows[0]?.n ?? 0),
  };
}

/* ------------------------------------------------------------------ *
 * The switcher list
 * ------------------------------------------------------------------ */

export interface SwitchableClient {
  org_id: string;
  name: string;
  activated: boolean;
  engagement_status: string | null;
}

/**
 * Every store a manager can switch to from the sidebar.
 *
 * Activated stores first, then the rest — a manager switching client is
 * almost always going to one that is running, and putting sixty
 * unactivated prospects above them makes the list useless.
 */
export async function loadSwitchableClients(): Promise<SwitchableClient[]> {
  const pool = organicPool();
  const r = await pool.query<SwitchableClient>(
    `SELECT o.id::text AS org_id, o.name,
            cs.org_id IS NOT NULL AS activated,
            cs.engagement_status::text AS engagement_status
       FROM public.organizations o
       LEFT JOIN organic.client_settings cs ON cs.org_id = o.id
      ORDER BY (cs.org_id IS NOT NULL) DESC, o.name`
  );
  return r.rows;
}
