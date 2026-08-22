export type TaskStatus =
  | "BLOCKED"
  | "TODO"
  | "IN_PROGRESS"
  | "REVIEW"
  | "DONE"
  | "SKIPPED";

export type TaskType = "AUTO" | "AI_DRAFT" | "IN_DASHBOARD" | "EXTERNAL";

export type EngagementStatus =
  | "PROSPECT"
  | "ONBOARDING"
  | "ACTIVE"
  | "PAUSED"
  | "CHURNED";

/** Row for scherm 1 — one per organization. Aggregated from client_progress. */
export interface ClientListRow {
  org_id: string;
  name: string;
  activated: boolean;
  niche: string | null;
  engagement_status: EngagementStatus | null;
  account_class: string | null;
  spacing_hours: number | null;
  daily_pin_target: number | null;
  current_phase: number | null;
  pct_done: number; // 0..100
  blocked_tasks: number;
  total_tasks: number;
}

/** Row for scherm 2 header — per-phase progress. */
export interface PhaseProgress {
  phase: number;
  total_tasks: number;
  done_tasks: number;
  blocked_tasks: number;
  pct_done: number;
}

export interface ClientHeader {
  org_id: string;
  name: string;
  activated: boolean;
  niche: string | null;
  engagement_status: EngagementStatus | null;
  account_class: string | null;
  spacing_hours: number | null;
  daily_pin_target: number | null;
  onboarded_date: string | null;
  phases: PhaseProgress[];
}

export interface TaskRow {
  client_task_id: string;
  task_id: string;
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
  status: TaskStatus;
  time_spent_min: number | null;
  block_reasons: string[]; // human-readable, empty when not BLOCKED
}
