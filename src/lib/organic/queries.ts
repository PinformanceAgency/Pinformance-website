/**
 * Data loaders for the organic app UI. All reads go through the service_role
 * admin client (skips RLS for this internal tool).
 */
import { organicDb, publicDb } from "./db";
import { loadStatusContext, evaluateBlockReasons } from "./status";
import type {
  ClientHeader,
  ClientListRow,
  EngagementStatus,
  PhaseProgress,
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
}

interface ProgressRow {
  org_id: string;
  phase: number;
  total_tasks: number | string;
  done_tasks: number | string;
  blocked_tasks: number | string;
  pct_done: number | string | null;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

/** Scherm 1 — one row per organisation. */
export async function loadClientList(): Promise<ClientListRow[]> {
  const pub = publicDb();
  const org = organicDb();

  const [orgsRes, setRes, progRes] = await Promise.all([
    pub.from("organizations").select("id, name").order("name"),
    org.from("client_settings").select("*"),
    org.from("client_progress").select("*"),
  ]);
  if (orgsRes.error) throw new Error(orgsRes.error.message);
  if (setRes.error) throw new Error(setRes.error.message);
  if (progRes.error) throw new Error(progRes.error.message);

  const settingsByOrg = new Map<string, SettingsRow>(
    (setRes.data ?? []).map((s) => [s.org_id as string, s as SettingsRow])
  );
  const progressByOrg = new Map<string, ProgressRow[]>();
  for (const p of (progRes.data ?? []) as ProgressRow[]) {
    const arr = progressByOrg.get(p.org_id) ?? [];
    arr.push(p);
    progressByOrg.set(p.org_id, arr);
  }

  const rows: ClientListRow[] = [];
  for (const o of (orgsRes.data ?? []) as OrgRow[]) {
    const s = settingsByOrg.get(o.id);
    const phases = (progressByOrg.get(o.id) ?? []).sort((a, b) => a.phase - b.phase);

    const total = phases.reduce((sum, p) => sum + n(p.total_tasks), 0);
    const done = phases.reduce((sum, p) => sum + n(p.done_tasks), 0);
    const blocked = phases.reduce((sum, p) => sum + n(p.blocked_tasks), 0);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Huidige fase = laagste fase met pct_done < 100, of hoogste als alles klaar
    const inProgress = phases.find((p) => n(p.pct_done) < 100);
    const currentPhase = inProgress
      ? inProgress.phase
      : phases.length > 0
      ? phases[phases.length - 1].phase
      : null;

    rows.push({
      org_id: o.id,
      name: o.name,
      activated: !!s,
      niche: s?.niche ?? null,
      engagement_status: s?.engagement_status ?? null,
      account_class: s?.account_class ?? null,
      spacing_hours: s?.spacing_hours ?? null,
      daily_pin_target: s?.daily_pin_target ?? null,
      current_phase: currentPhase,
      pct_done: pct,
      blocked_tasks: blocked,
      total_tasks: total,
    });
  }

  return rows;
}

/** Scherm 2 header — client info + per-phase progress. */
export async function loadClientHeader(orgId: string): Promise<ClientHeader | null> {
  const pub = publicDb();
  const org = organicDb();

  const [orgRes, setRes, progRes] = await Promise.all([
    pub.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    org.from("client_settings").select("*").eq("org_id", orgId).maybeSingle(),
    org.from("client_progress").select("*").eq("org_id", orgId),
  ]);
  if (orgRes.error) throw new Error(orgRes.error.message);
  if (setRes.error) throw new Error(setRes.error.message);
  if (progRes.error) throw new Error(progRes.error.message);
  if (!orgRes.data) return null;

  const s = setRes.data as SettingsRow | null;
  const phases: PhaseProgress[] = ((progRes.data ?? []) as ProgressRow[])
    .map((p) => ({
      phase: p.phase,
      total_tasks: n(p.total_tasks),
      done_tasks: n(p.done_tasks),
      blocked_tasks: n(p.blocked_tasks),
      pct_done: Math.round(n(p.pct_done)),
    }))
    .sort((a, b) => a.phase - b.phase);

  return {
    org_id: orgId,
    name: (orgRes.data as OrgRow).name,
    activated: !!s,
    niche: s?.niche ?? null,
    engagement_status: s?.engagement_status ?? null,
    account_class: s?.account_class ?? null,
    spacing_hours: s?.spacing_hours ?? null,
    daily_pin_target: s?.daily_pin_target ?? null,
    onboarded_date: s?.onboarded_date ?? null,
    phases,
  };
}

interface RawTaskRow {
  id: string;
  task_id: string;
  status: TaskStatus;
  time_spent_min: number | null;
}
interface RawDefRow {
  id: string;
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

/** Scherm 2 list — every task for this client, joined with the definition
 *  and augmented with block-reasons when BLOCKED. */
export async function loadClientTasks(orgId: string): Promise<TaskRow[]> {
  const db = organicDb();

  const [tasksRes, defsRes, ctx] = await Promise.all([
    db.from("client_tasks").select("id, task_id, status, time_spent_min").eq("org_id", orgId),
    db
      .from("task_definitions")
      .select(
        "id, phase, step, name, description, task_type, sort_order, guidance, external_tool, external_url, is_recurring"
      ),
    loadStatusContext(orgId),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (defsRes.error) throw new Error(defsRes.error.message);

  const defById = new Map<string, RawDefRow>(
    ((defsRes.data ?? []) as RawDefRow[]).map((d) => [d.id, d])
  );

  const rows: TaskRow[] = [];
  for (const t of (tasksRes.data ?? []) as RawTaskRow[]) {
    const d = defById.get(t.task_id);
    if (!d) continue; // task definition removed since instantiation
    rows.push({
      client_task_id: t.id,
      task_id: t.task_id,
      phase: d.phase,
      step: d.step,
      name: d.name,
      description: d.description,
      task_type: d.task_type,
      sort_order: d.sort_order,
      guidance: d.guidance,
      external_tool: d.external_tool,
      external_url: d.external_url,
      is_recurring: d.is_recurring,
      status: t.status,
      time_spent_min: t.time_spent_min,
      block_reasons: t.status === "BLOCKED" ? evaluateBlockReasons(t.task_id, ctx) : [],
    });
  }

  rows.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase - b.phase;
    return a.sort_order - b.sort_order;
  });

  return rows;
}
