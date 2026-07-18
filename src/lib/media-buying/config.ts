/**
 * Central configuration for the Media Buying Hub. Everything a media buyer or
 * head-of-media might want to tune later — zone thresholds, benchmark windows,
 * the allowed department / niche / country / buyer lists — lives here so we
 * never have magic numbers scattered across the codebase.
 *
 * Anything importable by both server and client code lives here (no
 * environment-specific imports).
 */

// ─── Zone thresholds (Task 2, per-head-of-media-buying rules) ─────────────
// Zone is decided by TWO gates rather than a single ratio band:
//   1. Profitability gate — is live ROAS above breakeven ROAS?
//   2. Scale gate         — is live ROAS above the invoice ROAS AND is the
//                            weekly revenue above the €5k floor?
//
//   red    = live ROAS < breakeven ROAS                       (losing money)
//   green  = live ROAS ≥ invoice ROAS AND weekly rev ≥ floor  (winning at scale)
//   orange = anything else                                    (profitable but sub-scale
//                                                              or between BER and invoice)
//
// zone_thresholds JSONB on store_settings can override the two knobs per
// store. `green_ratio` is only used as a fallback when a store has no
// invoice_roas configured yet (invoice_roas ≈ BER × green_ratio then).
export interface ZoneThresholds {
  /** Below this ratio (roas / ber) → red. Default 1.0 = BER itself. */
  orange_ratio: number;
  /** Fallback multiplier when invoice_roas is not set on the store. */
  green_ratio: number;
  /** Per-store override for the weekly revenue floor required for green. */
  min_weekly_revenue?: number;
}

export const DEFAULT_ZONE_THRESHOLDS: ZoneThresholds = {
  orange_ratio: 1.0,
  green_ratio: 1.3,
};

/** Time window used to compute the "live" ROAS that feeds the zone engine. */
export const ZONE_ROAS_WINDOW_DAYS = 7;

/** Weekly revenue (in the store's currency) required to be classified green.
 *  The 7-day window means the last-7-days revenue IS the weekly revenue. */
export const DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR = 5000;

// ─── Attribution (Pinterest reporting window per store) ────────────────────
/** Pinterest attribution window key used across the app. Mirrors the shape
 *  of ConversionWindow in components/shared/conversion-settings.tsx. */
export type AttributionWindow =
  | "30/1"
  | "30/7"
  | "30/30"
  | "7/7"
  | "7/1"
  | "1/1";

export const ATTRIBUTION_OPTIONS: {
  value: AttributionWindow;
  click: number;
  view: number;
  label: string;
}[] = [
  { value: "30/1", click: 30, view: 1, label: "30-day click / 1-day view (Pinterest default)" },
  { value: "30/7", click: 30, view: 7, label: "30-day click / 7-day view" },
  { value: "30/30", click: 30, view: 30, label: "30-day click / 30-day view" },
  { value: "7/7", click: 7, view: 7, label: "7-day click / 7-day view" },
  { value: "7/1", click: 7, view: 1, label: "7-day click / 1-day view" },
  { value: "1/1", click: 1, view: 1, label: "1-day click / 1-day view" },
];

export const DEFAULT_ATTRIBUTION_SETTING: AttributionWindow = "30/1";

/** Parse an attribution key back into (click, view) day counts for the
 *  Pinterest analytics endpoint. */
export function attributionToDays(
  a: AttributionWindow | string | null | undefined
): { click: 1 | 7 | 14 | 30 | 60; view: 1 | 7 | 14 | 30 | 60 } {
  const found = ATTRIBUTION_OPTIONS.find((o) => o.value === a);
  const click = (found?.click ?? 30) as 1 | 7 | 14 | 30 | 60;
  const view = (found?.view ?? 1) as 1 | 7 | 14 | 30 | 60;
  return { click, view };
}

// ─── Benchmark guardrails (Task 4) ─────────────────────────────────────────
export const BENCHMARK_WINDOW_DAYS_SHORT = 7;
export const BENCHMARK_WINDOW_DAYS_LONG = 28;
/** Minimum number of stores in a niche/country before we trust its benchmark
 *  average. Below this we render "insufficient data" instead of a noisy avg. */
export const BENCHMARK_MIN_STORES = 3;

// ─── Store-settings vocabulary (Task 1) ────────────────────────────────────
export const DEPARTMENTS = ["branding", "dropship"] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** Suggested niches — free text is also allowed. Keep the list small; add
 *  values as new verticals show up. */
export const NICHE_SUGGESTIONS = [
  "home",
  "home decor",
  "beauty",
  "fashion",
  "sports",
  "health",
  "wellness",
  "kids",
  "pets",
  "tech",
] as const;

/** Countries we currently run in. Two-letter ISO codes. Extend as needed. */
export const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "NL", label: "Netherlands" },
  { code: "BE", label: "Belgium" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
];

// ─── Human-friendly labels ─────────────────────────────────────────────────
export const DEPARTMENT_LABELS: Record<Department, string> = {
  branding: "Branding",
  dropship: "Dropshipping",
};

// ─── Helpers ───────────────────────────────────────────────────────────────
/**
 * Zone classification for a single store (and by extension a single campaign,
 * where the revenue floor is ignored — a small campaign inside a healthy
 * store still deserves credit for beating its invoice ROAS).
 *
 * Returns null when we can't decide: no spend, or the store hasn't got a
 * breakeven ROAS filled in yet.
 */
export type Zone = "red" | "orange" | "green";

export interface ClassifyInput {
  liveRoas: number | null | undefined;
  breakevenRoas: number | null | undefined;
  invoiceRoas?: number | null;
  spend: number;
  /** Revenue in the ROAS window (7d for stores; the "weekly revenue"). */
  windowRevenue?: number;
  /** Set false for per-campaign classification: skip the revenue-floor gate. */
  requireRevenueFloor?: boolean;
  overrides?: Partial<ZoneThresholds> | null;
}

export function classifyZone(input: ClassifyInput): Zone | null {
  const { liveRoas, breakevenRoas, invoiceRoas, spend, windowRevenue, overrides } = input;
  if (spend <= 0) return null; // no spend → no signal
  if (breakevenRoas == null || breakevenRoas <= 0) return null;
  if (liveRoas == null || !isFinite(liveRoas)) return null;

  const th: ZoneThresholds = {
    orange_ratio: overrides?.orange_ratio ?? DEFAULT_ZONE_THRESHOLDS.orange_ratio,
    green_ratio: overrides?.green_ratio ?? DEFAULT_ZONE_THRESHOLDS.green_ratio,
    min_weekly_revenue:
      overrides?.min_weekly_revenue ?? DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR,
  };
  const berFloor = breakevenRoas * th.orange_ratio;
  // Red — below breakeven. Costs > revenue in ad terms.
  if (liveRoas < berFloor) return "red";

  // Effective invoice ROAS: prefer the explicit value, else fall back to
  // BER × green_ratio so stores that haven't set invoice_roas yet still
  // classify sensibly.
  const effectiveInvoiceRoas = invoiceRoas != null && invoiceRoas > 0
    ? invoiceRoas
    : breakevenRoas * th.green_ratio;

  const beatsInvoice = liveRoas >= effectiveInvoiceRoas;
  const scaleOK = input.requireRevenueFloor === false
    ? true
    : (windowRevenue ?? 0) >= (th.min_weekly_revenue ?? DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR);

  if (beatsInvoice && scaleOK) return "green";
  return "orange";
}
