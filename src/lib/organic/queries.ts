/**
 * Data loaders for the organic app UI. All reads go through the direct pg
 * pool — see src/lib/organic/db.ts for the reasoning.
 */
import { organicPool } from "./db";
import { automationKey, BOARDS_PER_RUN, SEEDS_PER_DAY_HINT, type AutomationWaits } from "./automation";
import { loadStatusContext, evaluateBlockReasons } from "./status";
import type {
  ClientHeader,
  ClientListRow,
  EngagementStatus,
  PhaseProgress,
  SkipReason,
  TaskRow,
  TaskStatus,
  TaskType,
} from "./types";

interface OrgRow {
  id: string;
  name: string;
}

interface SettingsRow {
  org_id: string;
  engagement_status: EngagementStatus;
  niche: string | null;
  account_class: string;
  spacing_hours: number;
  daily_pin_target: number;
  scale_up_eligible_date: string | null;
  onboarded_date: string | null;
  domain: string | null;
}

interface ProgressRow {
  org_id: string;
  phase: number;
  total_tasks: number | string;
  done_tasks: number | string;
  skipped_tasks: number | string;
  blocked_tasks: number | string;
  todo_tasks?: number | string;
  in_progress_tasks?: number | string;
  review_tasks?: number | string;
  outstanding_tasks: number | string;
  pct_done: number | string | null;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

export async function loadClientList(): Promise<ClientListRow[]> {
  const pool = organicPool();

  const [orgsRes, setRes, progRes, cycleRes] = await Promise.all([
    pool.query<OrgRow>(`SELECT id::text, name FROM public.organizations ORDER BY name`),
    pool.query<SettingsRow>(
      `SELECT org_id::text, engagement_status::text AS engagement_status,
              niche, account_class::text AS account_class,
              spacing_hours, daily_pin_target, onboarded_date, domain
         FROM organic.client_settings`
    ),
    pool.query<ProgressRow>(
      `SELECT org_id::text, phase, total_tasks, done_tasks, skipped_tasks,
              blocked_tasks, outstanding_tasks, pct_done
         FROM organic.client_progress`
    ),
    pool.query<{ org_id: string; n: number }>(
      `SELECT org_id::text, COUNT(DISTINCT cycle)::int AS n
         FROM organic.client_tasks
        WHERE cycle IS NOT NULL GROUP BY org_id`
    ),
  ]);

  const settingsByOrg = new Map<string, SettingsRow>(setRes.rows.map((s) => [s.org_id, s]));
  const progressByOrg = new Map<string, ProgressRow[]>();
  for (const p of progRes.rows) {
    const arr = progressByOrg.get(p.org_id) ?? [];
    arr.push(p);
    progressByOrg.set(p.org_id, arr);
  }
  const cyclesByOrg = new Map<string, number>(cycleRes.rows.map((r) => [r.org_id, r.n]));

  const rows: ClientListRow[] = [];
  for (const o of orgsRes.rows) {
    const s = settingsByOrg.get(o.id);
    const phases = (progressByOrg.get(o.id) ?? []).sort((a, b) => a.phase - b.phase);

    // Onboarding completion is phases 1–3 ONLY. The previous version summed
    // all five phases, mixing one-time onboarding with recurring cycle work
    // into an average that disagreed with the client detail page and told
    // the manager nothing on either surface.
    const onboarding = phases.filter((p) => p.phase <= 3);
    const total   = onboarding.reduce((sum, p) => sum + n(p.total_tasks), 0);
    const done    = onboarding.reduce((sum, p) => sum + n(p.done_tasks), 0);
    const skipped = onboarding.reduce((sum, p) => sum + n(p.skipped_tasks), 0);
    const blocked = onboarding.reduce((sum, p) => sum + n(p.blocked_tasks), 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const onboardingComplete = total > 0 && onboarding.every((p) => n(p.pct_done) >= 100);

    // The phase the manager should open next: the first of phases 1–3 that
    // still has outstanding work. Once onboarding is done there is no
    // "current phase" — the store is in recurring management.
    const nextOpen = onboarding.find((p) => n(p.outstanding_tasks) > 0);
    const currentPhase = nextOpen ? nextOpen.phase : onboardingComplete ? null : (onboarding[0]?.phase ?? null);

    rows.push({
      org_id: o.id,
      name: o.name,
      activated: !!s,
      niche: s?.niche ?? null,
      engagement_status: (s?.engagement_status ?? null) as EngagementStatus | null,
      account_class: s?.account_class ?? null,
      spacing_hours: s?.spacing_hours ?? null,
      daily_pin_target: s?.daily_pin_target ?? null,
      current_phase: currentPhase,
      pct_done: pct,
      blocked_tasks: blocked,
      total_tasks: total,
      done_tasks: done,
      skipped_tasks: skipped,
      onboarding_complete: onboardingComplete,
      active_cycles: cyclesByOrg.get(o.id) ?? 0,
    });
  }

  return rows;
}

export async function loadClientHeader(orgId: string): Promise<ClientHeader | null> {
  const pool = organicPool();

  const [orgRes, setRes, progRes] = await Promise.all([
    pool.query<OrgRow>(`SELECT id::text, name FROM public.organizations WHERE id = $1`, [orgId]),
    pool.query<SettingsRow>(
      `SELECT org_id::text, engagement_status::text AS engagement_status,
              niche, account_class::text AS account_class,
              spacing_hours, daily_pin_target,
              scale_up_eligible_date::text AS scale_up_eligible_date,
              onboarded_date, domain
         FROM organic.client_settings WHERE org_id = $1`,
      [orgId]
    ),
    pool.query<ProgressRow>(
      `SELECT org_id::text, phase, total_tasks, done_tasks, skipped_tasks,
              blocked_tasks, todo_tasks, in_progress_tasks, review_tasks,
              outstanding_tasks, pct_done
         FROM organic.client_progress WHERE org_id = $1`,
      [orgId]
    ),
  ]);

  if (orgRes.rowCount === 0) return null;
  const s = setRes.rows[0] as SettingsRow | undefined;
  const phases: PhaseProgress[] = progRes.rows
    .map((p) => ({
      phase: p.phase,
      total_tasks: n(p.total_tasks),
      done_tasks: n(p.done_tasks),
      skipped_tasks: n(p.skipped_tasks),
      blocked_tasks: n(p.blocked_tasks),
      todo_tasks: n(p.todo_tasks),
      in_progress_tasks: n(p.in_progress_tasks),
      review_tasks: n(p.review_tasks),
      outstanding_tasks: n(p.outstanding_tasks),
      pct_done: Math.round(n(p.pct_done)),
    }))
    .sort((a, b) => a.phase - b.phase);

  return {
    org_id: orgId,
    name: orgRes.rows[0].name,
    activated: !!s,
    niche: s?.niche ?? null,
    engagement_status: (s?.engagement_status ?? null) as EngagementStatus | null,
    account_class: s?.account_class ?? null,
    spacing_hours: s?.spacing_hours ?? null,
    daily_pin_target: s?.daily_pin_target ?? null,
    scale_up_eligible_date: s?.scale_up_eligible_date ?? null,
    onboarded_date: s?.onboarded_date ?? null,
    domain: s?.domain ?? null,
    phases,
  };
}

interface RawJoinedTaskRow {
  id: string;
  task_id: string;
  status: TaskStatus;
  time_spent_min: number | null;
  skip_reason: SkipReason | null;
  skip_note: string | null;
  notes: string | null;
  phase: number;
  step: string;
  name: string;
  description: string | null;
  task_type: TaskType;
  sort_order: number;
  guidance: string | null;
  external_tool: string | null;
  external_url: string | null;
  expected_output: string | null;
  is_recurring: boolean;
  cycle: string | null;
}

export async function loadClientTasks(orgId: string): Promise<TaskRow[]> {
  const pool = organicPool();

  const [rowsRes, ctx] = await Promise.all([
    pool.query<RawJoinedTaskRow>(
      // Exclude Phase-4 per-URL cycle tasks — they render in their own
      // Phase4Cycles panel, grouped by URL. Only cycle IS NULL (flat) and
      // any legacy non-URL cycle keys stay on the main board.
      `SELECT ct.id::text, ct.task_id, ct.status::text AS status, ct.time_spent_min,
              ct.skip_reason, ct.skip_note, ct.notes, ct.cycle,
              td.phase, td.step, td.name, td.description,
              td.task_type::text AS task_type, td.sort_order,
              td.guidance, td.external_tool, td.external_url, td.is_recurring,
              td.expected_output
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        WHERE ct.org_id = $1
          AND td.active
          AND (ct.cycle IS NULL OR ct.cycle NOT LIKE 'URL-%')
        ORDER BY td.phase, td.sort_order`,
      [orgId]
    ),
    loadStatusContext(orgId),
  ]);

  return rowsRes.rows.map((r) => ({
    client_task_id: r.id,
    task_id: r.task_id,
    phase: r.phase,
    step: r.step,
    name: r.name,
    description: r.description,
    task_type: r.task_type,
    sort_order: r.sort_order,
    guidance: r.guidance,
    external_tool: r.external_tool,
    external_url: r.external_url,
    expected_output: r.expected_output,
    is_recurring: r.is_recurring,
    status: r.status,
    time_spent_min: r.time_spent_min,
    skip_reason: r.skip_reason,
    skip_note: r.skip_note,
    notes: r.notes,
    block_reasons: r.status === "BLOCKED" ? evaluateBlockReasons(r.task_id, ctx, r.cycle ?? null) : [],
  }));
}

// ---------- waiting on automation -------------------------------------------

/**
 * What a cron is still working through, per task. See automation.ts for why
 * this is computed on read rather than a seventh task_status.
 */
export async function loadAutomationWaits(orgId: string): Promise<AutomationWaits> {
  const pool = organicPool();
  const out: AutomationWaits = new Map();

  const [boards, seeds, publishing] = await Promise.all([
    // P3.3.5 — the creation queue.
    pool.query<{ total: string; dated: string; overdue: string; next_due: string | null }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE planned_creation_date IS NOT NULL)::text AS dated,
              COUNT(*) FILTER (WHERE planned_creation_date <= current_date)::text AS overdue,
              MIN(planned_creation_date) FILTER (WHERE planned_creation_date > current_date)::text AS next_due
         FROM organic.boards
        WHERE org_id = $1
          AND status = 'PLANNED'::organic.board_status
          AND pinterest_board_id IS NULL
          AND origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin`, [orgId]),

    // P3.3.7 — board warming. Only pins a person has already approved, and
    // only onto boards that exist: an approved pin for a board that is still
    // being created is waiting on P3.3.5, not on the seeding cron.
    pool.query<{ approved: string; saved_today: string; boards: string }>(
      `SELECT COUNT(*) FILTER (WHERE sp.status = 'APPROVED')::text AS approved,
              COUNT(*) FILTER (WHERE sp.status = 'SAVED'
                               AND sp.saved_at >= date_trunc('day', now()))::text AS saved_today,
              COUNT(DISTINCT sp.board_id) FILTER (WHERE sp.status = 'APPROVED')::text AS boards
         FROM organic.seed_plan sp
         JOIN organic.boards b ON b.id = sp.board_id
        WHERE sp.org_id = $1 AND b.pinterest_board_id IS NOT NULL`, [orgId]),

    // P4.4.2 — pins queued and not yet out, per cycle. SCHEDULED only:
    // a PLANNED pin has a date and will never publish, which is the one
    // distinction this must not blur.
    pool.query<{ url_id: string; waiting: string; next_date: string | null; total: string }>(
      `SELECT w.url_id::text,
              COUNT(*) FILTER (WHERE p.status = 'SCHEDULED'::organic.pin_status)::text AS waiting,
              MIN(p.scheduled_date) FILTER (WHERE p.status = 'SCHEDULED'::organic.pin_status)::text AS next_date,
              COUNT(*)::text AS total
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1 AND w.status = 'RUNNING'::organic.waterfall_status
        GROUP BY w.url_id`, [orgId]),
  ]);

  const b = boards.rows[0];
  const bTotal = Number(b?.total ?? 0);
  const bDated = Number(b?.dated ?? 0);
  const bUndated = bTotal - bDated;
  if (bTotal > 0 && bDated > 0) {
    const batch = Math.min(BOARDS_PER_RUN, bDated);
    // Overdue boards are created on the next run, which is tonight. A future
    // date is the honest answer only when nothing is due yet.
    const when = Number(b?.overdue ?? 0) > 0 ? "tonight" : (b?.next_due ?? null);
    const days = Math.ceil(bDated / BOARDS_PER_RUN);
    out.set(automationKey(null, "P3.3.5"), {
      label: "Waiting on automation",
      detail:
        `${bDated} board${bDated === 1 ? "" : "s"} remaining · next batch: ${batch} · ` +
        `${when === "tonight" ? "tonight" : when ?? "no date"}` +
        (days > 1 ? ` · about ${days} night${days === 1 ? "" : "s"} to clear` : ""),
      runs: "organic-create-boards, 01:00 UTC daily — three per store per day (check_board_pace)",
      next_run: b?.overdue && Number(b.overdue) > 0 ? null : b?.next_due ?? null,
      operator_can_help: bUndated > 0
        ? `${bUndated} designed board${bUndated === 1 ? " has" : "s have"} no planned date, so ${bUndated === 1 ? "it is" : "they are"} outside the queue entirely — run P3.3.4.`
        : null,
    });
  }

  const s = seeds.rows[0];
  const approved = Number(s?.approved ?? 0);
  if (approved > 0) {
    const perDay = SEEDS_PER_DAY_HINT; // one save per hourly run, 06:20–17:20 UTC.
    const days = Math.ceil(approved / perDay);
    out.set(automationKey(null, "P3.3.7"), {
      label: "Waiting on automation",
      detail:
        `${approved} approved seed pin${approved === 1 ? "" : "s"} still to save ` +
        `across ${s?.boards ?? 0} board${Number(s?.boards ?? 0) === 1 ? "" : "s"} · ` +
        `${s?.saved_today ?? 0} of ${perDay} saved today` +
        (days > 1 ? ` · about ${days} days to clear` : ""),
      runs: "organic-seed-boards, hourly 06:20–17:20 UTC — one save per run, ten a day",
      next_run: null,
      operator_can_help: null,
    });
  }

  for (const p of publishing.rows) {
    const waiting = Number(p.waiting);
    if (waiting === 0) continue;
    out.set(automationKey(`URL-${p.url_id.slice(0, 8)}`, "P4.4.2"), {
      label: "Waiting on automation",
      detail:
        `${waiting} of ${p.total} pin${Number(p.total) === 1 ? "" : "s"} still queued · ` +
        `next goes out ${p.next_date ?? "—"}`,
      runs: "organic-post-pins, every 15 minutes — a pin publishes on the day it is dated",
      next_run: p.next_date,
      operator_can_help: null,
    });
  }

  return out;
}
