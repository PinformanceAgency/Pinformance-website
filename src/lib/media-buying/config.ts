/**
 * Central configuration for the Media Buying Hub. Everything a media buyer or
 * head-of-media might want to tune later — zone thresholds, benchmark windows,
 * the allowed department / niche / country / buyer lists — lives here so we
 * never have magic numbers scattered across the codebase.
 *
 * Anything importable by both server and client code lives here (no
 * environment-specific imports).
 */

// ─── Zone thresholds (Task 2) ──────────────────────────────────────────────
// Zone is derived from ratio = live_roas / breakeven_roas.
//   ratio < ORANGE_RATIO             → red     (below breakeven)
//   ORANGE_RATIO ≤ ratio < GREEN_RATIO → orange (breakeven-ish)
//   ratio ≥ GREEN_RATIO              → green   (comfortably above breakeven)
export interface ZoneThresholds {
  orange_ratio: number;
  green_ratio: number;
}

export const DEFAULT_ZONE_THRESHOLDS: ZoneThresholds = {
  orange_ratio: 1.0,
  green_ratio: 1.3,
};

/** Time window used to compute the "live" ROAS that feeds the zone engine. */
export const ZONE_ROAS_WINDOW_DAYS = 7;

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
  "beauty",
  "fashion",
  "sports",
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
 * Zone classification for a single store or campaign. Uses per-store override
 * if provided, otherwise the global default. Returns null when data is
 * insufficient to decide (spend is 0, or ber missing).
 */
export type Zone = "red" | "orange" | "green";

export function classifyZone(
  liveRoas: number | null | undefined,
  breakevenRoas: number | null | undefined,
  spend: number,
  overrides?: Partial<ZoneThresholds> | null
): Zone | null {
  if (spend <= 0) return null; // no spend → no signal
  if (breakevenRoas == null || breakevenRoas <= 0) return null;
  if (liveRoas == null || !isFinite(liveRoas)) return null;
  const th: ZoneThresholds = {
    orange_ratio: overrides?.orange_ratio ?? DEFAULT_ZONE_THRESHOLDS.orange_ratio,
    green_ratio: overrides?.green_ratio ?? DEFAULT_ZONE_THRESHOLDS.green_ratio,
  };
  const ratio = liveRoas / breakevenRoas;
  if (ratio < th.orange_ratio) return "red";
  if (ratio < th.green_ratio) return "orange";
  return "green";
}
