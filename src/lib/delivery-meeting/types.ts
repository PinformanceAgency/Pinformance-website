import type { Stage, Stream } from "./constants";
import type { StoreRankingPeriods } from "@/lib/media-buying/store-ranking";

export interface Money {
  spend: number;
  revenue: number;
}

/** One row in a deck: a store, or a blend of stores (Viorita Group). */
export interface CollectedStore {
  /** org_id, or `blend:<name>` for a blended row. */
  key: string;
  name: string;
  org_ids: string[];
  /** lowercase, as in store_settings.media_buyer */
  buyer: string;
  /** which deck the store lands in: the buyer for branded, "dropship" otherwise */
  deck: string;
  /** "€", "$", "CHF ", "£" — the prefix the slides print */
  cur: string;
  currency: string | null;
  invoice: number;
  ber: number | null;
  spend_account: boolean;
  multiplier: number;
  /** figures already × multiplier on revenue */
  week: Money;
  prev: Money;
  month: Money;
  /** Store Ranking's floors — the same numbers as the pills on the page */
  week_floor: number;
  month_floor: number;
  source: "dashboard" | "monday" | "mixed";
  weekly_goal: boolean;
  /** every spelling monday may use, normalised */
  match_keys: string[];
  /** true when no week figures exist at all (not even a zero row) */
  week_missing: boolean;
}

export interface LogNotes {
  /** the log for the data week (deadline = Friday of the data week) */
  archived: string | null;
  /** section 1 of the live log (deadline = Friday of the meeting week) */
  live_section1: string | null;
}

export interface Todo {
  name: string;
  status: string;
  created_at: string;
  deadline: string | null;
}

export interface Target {
  spend_day?: number | string | null;
  spend_week?: number | null;
  revenue_week?: number | null;
  roas?: number | null;
  source?: "log" | "meeting";
  quote?: string | null;
}

export interface FathomQueueItem {
  recording_id: number;
  kind: "meeting" | "deep_dive";
  title: string;
  recorded_at: string;
  chunks_total: number | null;
  chunks_done: number;
}

export interface DeepDiveFinding {
  store_key: string | null;
  confidence: "high" | "medium" | "low";
  text: string;
  recording: string;
}

export interface Brief {
  did: string;
  result: string;
  ask: string;
  deep_dive: string | null;
}

export interface DeckRef {
  key: string;
  label: string;
  language: "EN" | "NL";
  buyers: string[];
  file: string;
}

export interface RunPayload {
  meeting_date: string;
  meeting_week: number;
  data_week: number;
  data_period: string;
  periods?: StoreRankingPeriods;
  decks?: DeckRef[];
  stores?: CollectedStore[];
  logs?: Record<string, LogNotes>;
  todos?: Record<string, Todo[]>;
  notices?: {
    missing_in_settings: string[];
    inactive_left_out: string[];
    not_on_clients: string[];
    no_deck: string[];
    monday_source: string[];
    week_data_missing: string[];
    unmatched_logs: string[];
    config_gaps: string[];
  };
  fathom?: {
    queue: FathomQueueItem[];
    meeting_found: string | null;
    meeting_notes: Record<string, { todos: string[]; target: Target | null }>;
    findings: DeepDiveFinding[];
    deep_dives_found: number;
    done: boolean;
  };
  targets?: Record<string, Target>;
  /** store keys whose log has been read for a target */
  targets_checked?: string[];
  deck_data?: Record<string, DeckData>;
  briefs?: Record<string, Brief>;
  brief_errors?: Record<string, string>;
  files?: { name: string; path: string; kind: "deck" | "prep" }[];
  delivered_files?: string[];
  /** the monday to-do the files went to */
  monday?: { item_id: string | null; update_id: string | null; uploaded: string[] };
  delivered_at?: string;
  issues?: string[];
}

export interface RunRow {
  id: string;
  meeting_date: string;
  stream: Stream;
  stage: Stage;
  status: "pending" | "running" | "error" | "done";
  error: string | null;
  attempts: number;
  locked_until: string | null;
  payload: RunPayload;
  updated_at: string;
}

/* ---------- deck data: the shape compute_delivery.py wrote ---------- */

export interface DeckStoreRow {
  key: string;
  name: string;
  buyer: string;
  spend_acct: boolean;
  roas_wk_prev: string;
  roas_wk_now: string;
  week_delta: number | null;
  wk_roas_ok: boolean;
  rev_wk_txt: string;
  rev_wk_tgt_txt: string;
  rev_wk_delta: number | null;
  wk_rev_ok: boolean;
  rev_tgt_hit: boolean | null;
  mtd_txt: string;
  mtd_ok: boolean;
  roas_mtd: string;
  roas_target: string;
  roas_mtd_ok: boolean;
  month_ok: boolean;
  week_ok: boolean;
  source: CollectedStore["source"];
}

export interface GoalSplit {
  name: string;
  now: number;
  target: number;
  prev: number | null;
  on_track: boolean;
}

export interface GoalCard {
  name: string;
  target: number;
  prev: number | null;
  now: number;
  on_track: boolean;
  note?: string;
  split: GoalSplit[] | null;
}

export interface DeckData {
  key: string;
  stream: string;
  language: "EN" | "NL";
  week: string;
  data_week: string;
  prev_week: string;
  data_period: string;
  week_data: {
    spend: { now: string; prev: string; delta: number | null; delta_txt: string };
    roas: { now: string; prev: string; delta: number | null; delta_txt: string };
    rev: { now: string; prev: string; delta: number | null; delta_txt: string };
    status: { on: { now: number; prev: number }; off: { now: number; prev: number } };
  };
  stores: DeckStoreRow[];
  goal: { cards: GoalCard[] };
  summary: {
    on_track: number;
    weekly_goal_stores: string[];
    green_this_week: string[];
    no_target: string[];
    issues: string[];
  };
}
