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
//                            revenue (or spend) above the floor for this
//                            bucket's period?
//
//   red    = live ROAS < breakeven ROAS                       (losing money)
//   green  = live ROAS ≥ invoice ROAS AND rev ≥ floor         (winning at scale)
//   orange = anything else                                    (profitable but sub-scale
//                                                              or between BER and invoice)
//
// The scale gate is period-aware (see `scaleBasis` on ClassifyInput). A 7-day
// bucket is held to the weekly floor; a calendar-month bucket is held to the
// monthly floor, pro-rata over the part of the month we have data for. Judging
// a month bucket by the weekly floor is what used to paint sub-scale stores
// green on the monthly view.
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
  /** Per-store override for the FULL-month revenue floor required for green.
   *  Independent of min_weekly_revenue — see the note at
   *  DEFAULT_GREEN_REVENUE_MONTHLY_FLOOR on why the two aren't derived from
   *  each other. */
  min_monthly_revenue?: number;
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

/** Full-month revenue required for a revenue-fee store to be green on the
 *  MONTHLY view — the agency invoices per month, so this is the number that
 *  actually decides whether a store pays for itself.
 *
 *  Deliberately NOT derived from the weekly floor. The weekly floors are a
 *  loose day-rate extrapolation (weekly / 7 * 30), which lands near but not
 *  exactly on the monthly target. Confirmed with Tristan on 14-08-2026: the
 *  weekly floors stay as they are, and the monthly view gets these hard
 *  numbers instead of a multiple of the weekly one. */
export const DEFAULT_GREEN_REVENUE_MONTHLY_FLOOR = 20000;

// ─── Invoicing model (billing basis for the agency) ────────────────────────
/** Two ways the agency invoices its clients — the zone engine flips its
 *  scale-gate depending on which one a store is on.
 *    revenue_fee — % of revenue. Green = above invoice ROAS + weekly revenue ≥ floor.
 *    spend_fee   — % of spend. Green = above invoice ROAS + weekly spend ≥ derived floor. */
export type InvoicingModel = "revenue_fee" | "spend_fee";

export const INVOICING_MODEL_LABELS: Record<InvoicingModel, string> = {
  revenue_fee: "Revenue fee",
  spend_fee: "Spend fee",
};

/** Default monthly-spend floor for spend-fee brands (in the store's
 *  currency). Divided by WEEKS_PER_MONTH at classify time so a partial week
 *  isn't punished. */
export const DEFAULT_MIN_MONTHLY_SPEND = 7500;

/** Average number of weeks per month (30.42 days / 7). */
export const WEEKS_PER_MONTH = 4.345;

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
  /** Billing basis for this store. Defaults to revenue_fee for backwards
   *  compatibility so stores that haven't set the field yet keep classifying
   *  the way they always did. */
  invoicingModel?: InvoicingModel | null;
  /** Only used when `invoicingModel === "spend_fee"`. */
  minMonthlySpend?: number | null;
  /**
   * Which scale floor the bucket is measured against.
   *   "week"  (default) — a 7-day bucket, judged on the weekly floor.
   *   "month"           — a calendar-month bucket, judged on the monthly
   *                       floor scaled by `monthProgress`.
   * Passing a month bucket with the default "week" is exactly the bug this
   * parameter was added to fix: a whole month of revenue would clear a floor
   * meant for a single week, painting sub-scale stores green.
   */
  scaleBasis?: "week" | "month";
  /**
   * How much of the month the bucket actually covers, as a fraction (0-1].
   * Only read when `scaleBasis === "month"`.
   *
   * A finished month passes 1 and is held to the full floor. A month in
   * progress passes daysWithData / daysInMonth, so the store is judged on
   * whether it is ON PACE rather than punished for the month not being over:
   * on 14 August with data through the 13th that is 13/31, and a revenue-fee
   * store needs 20000 * 13/31 = 8387 so far.
   */
  monthProgress?: number;
}

/** Which metric the scale gate looks at, and the number it has to reach. */
export interface ScaleFloor {
  /** revenue_fee stores are judged on revenue, spend_fee stores on spend. */
  metric: "revenue" | "spend";
  /** The amount that metric must reach, in the store's own currency. */
  floor: number;
}

/**
 * The scale-gate floor for one bucket. Split out of classifyZone() so the UI
 * can show a store what it is actually being measured against without
 * re-deriving the arithmetic — one source of truth, no drift between the
 * number we classify on and the number we display.
 *
 * `monthProgress` is only read when `scaleBasis === "month"`; see the field
 * docs on ClassifyInput.
 */
export function scaleFloorFor(opts: {
  invoicingModel?: InvoicingModel | null;
  minMonthlySpend?: number | null;
  overrides?: Partial<ZoneThresholds> | null;
  scaleBasis?: "week" | "month";
  monthProgress?: number;
}): ScaleFloor {
  const { invoicingModel, minMonthlySpend, overrides, scaleBasis } = opts;
  // Clamped: a caller that forgets to pass progress for a month bucket gets
  // the full floor (the strict end) rather than a floor of zero that would
  // wave everything through.
  const monthShare =
    scaleBasis === "month"
      ? Math.min(1, Math.max(0, opts.monthProgress ?? 1))
      : 1;

  if (invoicingModel === "spend_fee") {
    const monthly =
      minMonthlySpend != null && minMonthlySpend > 0
        ? minMonthlySpend
        : DEFAULT_MIN_MONTHLY_SPEND;
    // Month bucket: the monthly floor, pro-rata over the part of the month we
    // have data for. Week bucket: unchanged, the monthly floor spread over an
    // average month's worth of weeks.
    return {
      metric: "spend",
      floor:
        scaleBasis === "month" ? monthly * monthShare : monthly / WEEKS_PER_MONTH,
    };
  }
  // revenue_fee (default).
  return {
    metric: "revenue",
    floor:
      scaleBasis === "month"
        ? (overrides?.min_monthly_revenue ?? DEFAULT_GREEN_REVENUE_MONTHLY_FLOOR) *
          monthShare
        : (overrides?.min_weekly_revenue ?? DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR),
  };
}

export function classifyZone(input: ClassifyInput): Zone | null {
  const {
    liveRoas,
    breakevenRoas,
    invoiceRoas,
    spend,
    windowRevenue,
    overrides,
    invoicingModel,
    minMonthlySpend,
    scaleBasis,
    monthProgress,
  } = input;
  if (spend <= 0) return null; // no spend → no signal
  if (breakevenRoas == null || breakevenRoas <= 0) return null;
  if (liveRoas == null || !isFinite(liveRoas)) return null;

  const th: ZoneThresholds = {
    orange_ratio: overrides?.orange_ratio ?? DEFAULT_ZONE_THRESHOLDS.orange_ratio,
    green_ratio: overrides?.green_ratio ?? DEFAULT_ZONE_THRESHOLDS.green_ratio,
    min_weekly_revenue:
      overrides?.min_weekly_revenue ?? DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR,
    min_monthly_revenue:
      overrides?.min_monthly_revenue ?? DEFAULT_GREEN_REVENUE_MONTHLY_FLOOR,
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

  // Scale gate: is the store big enough for its billing model? Which metric
  // and which number that means depends on the model and on the bucket's
  // period — see scaleFloorFor().
  let scaleOK: boolean;
  if (input.requireRevenueFloor === false) {
    scaleOK = true;
  } else {
    const gate = scaleFloorFor({
      invoicingModel,
      minMonthlySpend,
      overrides: th,
      scaleBasis,
      monthProgress,
    });
    const actual = gate.metric === "spend" ? spend : (windowRevenue ?? 0);
    scaleOK = actual >= gate.floor;
  }

  if (beatsInvoice && scaleOK) return "green";
  return "orange";
}
