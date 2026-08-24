/**
 * Data loaders for the organic app UI. All reads go through the direct pg
 * pool — see src/lib/organic/db.ts for the reasoning.
 */
import { organicPool } from "./db";
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
              spacing_hours, daily_pin_target, onboarded_date, domain
         FROM organic.client_settings WHERE org_id = $1`,
      [orgId]
    ),
    pool.query<ProgressRow>(
      `SELECT org_id::text, phase, total_tasks, done_tasks, skipped_tasks,
              blocked_tasks, outstanding_tasks, pct_done
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
  is_recurring: boolean;
}

export async function loadClientTasks(orgId: string): Promise<TaskRow[]> {
  const pool = organicPool();

  const [rowsRes, ctx] = await Promise.all([
    pool.query<RawJoinedTaskRow>(
      // Exclude Phase-4 per-URL cycle tasks — they render in their own
      // Phase4Cycles panel, grouped by URL. Only cycle IS NULL (flat) and
      // any legacy non-URL cycle keys stay on the main board.
      `SELECT ct.id::text, ct.task_id, ct.status::text AS status, ct.time_spent_min,
              ct.skip_reason, ct.skip_note, ct.notes,
              td.phase, td.step, td.name, td.description,
              td.task_type::text AS task_type, td.sort_order,
              td.guidance, td.external_tool, td.external_url, td.is_recurring
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        WHERE ct.org_id = $1
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
    is_recurring: r.is_recurring,
    status: r.status,
    time_spent_min: r.time_spent_min,
    skip_reason: r.skip_reason,
    skip_note: r.skip_note,
    notes: r.notes,
    block_reasons: r.status === "BLOCKED" ? evaluateBlockReasons(r.task_id, ctx) : [],
  }));
}
