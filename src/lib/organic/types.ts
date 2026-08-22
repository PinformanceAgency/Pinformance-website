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

export type ViabilityVerdict = "STRONG_FIT" | "MODERATE_FIT" | "WEAK_FIT";

export type SkipReason =
  | "NOT_APPLICABLE"
  | "CLIENT_REFUSED"
  | "ALREADY_DONE"
  | "BLOCKED_EXTERNAL"
  | "OTHER";

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  NOT_APPLICABLE: "Not applicable to this client",
  CLIENT_REFUSED: "Client declined or refused",
  ALREADY_DONE: "Already handled elsewhere",
  BLOCKED_EXTERNAL: "Blocked by external party",
  OTHER: "Other (add note)",
};

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
  pct_done: number;
  blocked_tasks: number;
  total_tasks: number;
}

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
  domain: string | null;
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
  skip_reason: SkipReason | null;
  skip_note: string | null;
  notes: string | null;
  block_reasons: string[];
}

/** Everything for the viability gate — one row per org. */
export interface ViabilityRow {
  org_id: string;
  visual_first: boolean | null;
  more_than_5_products: boolean | null;
  url_volume: boolean | null;
  high_aov: boolean | null;
  existing_assets: boolean | null;
  longterm_mindset: boolean | null;
  rf_technical_b2b: boolean | null;
  rf_local_only: boolean | null;
  rf_single_landing: boolean | null;
  rf_needs_sales_now: boolean | null;
  rf_low_effort_ds: boolean | null;
  rf_restricted_niche: boolean | null;
  total_urls_found: number | null;
  verdict: ViabilityVerdict | null;
  rationale: string | null;
  assessed_at: string | null;
}

export interface AccessRow {
  org_id: string;
  pinterest_login: boolean;
  pinterest_login_until: string | null;
  ga4_access: boolean;
  gsc_access: boolean;
  cms_access: boolean;
  cms_platform: string | null;
  product_feed_url: string | null;
  notes: string | null;
}

export interface IntakeRow {
  org_id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_preference: string | null;
  business_story: string | null;
  products_services: string | null;
  value_proposition: string | null;
  geo_scale: string | null;
  target_markets: string[] | null;
  ideal_audience: string | null;
  client_named_competitors: string[] | null;
  current_marketing: string | null;
  traffic_sources: string | null;
  social_presence: string | null;
  available_content: string | null;
  best_performing_content: string | null;
  brand_personality: string | null;
  existing_pinterest: string | null;
  primary_goals: string[] | null;
  success_measure: string | null;
  campaigns_to_support: string | null;
  evergreen_topics: string[] | null;
  seasonal_promos: string[] | null;
  content_approach: string | null;
  open_to_ads: boolean | null;
  completed_at: string | null;
  account_created_date?: string | null;
  last_activity_date?: string | null;
  niche?: string | null;
  domain?: string | null;
}
