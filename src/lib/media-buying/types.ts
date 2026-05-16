/**
 * Shared types for the per-dimension breakdown view used by the Media Online
 * Campaign Level / Ad Group Level / Ad Level pages.
 */

export interface DailyRow {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

/**
 * Common metric + naming shape every entity (campaign / ad group / ad)
 * exposes to the dashboard. `parsed` is level-specific but always carries
 * an `unknown[]` array for naming-hygiene reporting.
 */
export interface EntityRow {
  id: string;
  name: string;
  status: string | null;
  parsed: { unknown: string[] } & Record<string, unknown>;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
  cpm: number;
  daily: DailyRow[];
  // Optional per-creative metadata. Ad-level rows populate these so the UI
  // can render thumbnails + clickable Pinterest links; campaign / ad-group
  // levels leave them undefined.
  pin_id?: string | null;
  creative_type?: string | null;
  created_time?: number | null;
  image_url?: string | null;
}

export type ChartMetric = "spend" | "revenue" | "roas" | "cpa";

/**
 * A naming-convention dimension to break performance down by. `key` is the
 * field on the entity's `parsed` object to read; if the value is null/empty
 * the entity is dropped from that dimension's breakdown.
 */
export interface Dimension {
  key: string;
  title: string;
  description: string;
  /** Optional fixed display order for values. */
  order?: string[];
  /** How to render a value in tables / tooltips. */
  label: (v: string) => string;
  /** Optional secondary label (the abbreviation, shown next to the full label). */
  hint?: (v: string) => string | null;
}

export interface LegendItem {
  abbr: string;
  desc: string;
}

/**
 * Pinterest's authoritative account-wide totals for the period (same shape
 * as Campaign Manager's headline numbers). Sometimes higher than the sum
 * of per-entity rows because Pinterest attributes part of conversions /
 * revenue at campaign or ad-group level rather than down to a specific ad.
 */
export interface AccountTotals {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
}

export interface BreakdownApiResponse {
  ok?: boolean;
  ad_account_name?: string;
  currency?: string;
  items?: EntityRow[];
  /** Pinterest account-level totals — only the ads route populates this. */
  account_totals?: AccountTotals;
  error?: string;
}
