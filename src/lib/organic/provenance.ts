/**
 * STAGE 0 · CORRECTNESS — provenance for every displayed figure.
 *
 * Governing principle 3: "A wrong number is worse than no number."
 *
 * Nothing in the client view renders a bare number. Every figure carries a
 * state saying where it came from and whether it can be trusted. Missing
 * renders as an em dash with a reason, never as zero — because zero is a
 * measurement and missing is not, and a client who sees "0 conversions"
 * when the tag was never installed has been told something false.
 *
 * Derived figures (deltas, percentage change, ratios) are structurally
 * impossible to render without their inputs. The "+466%" that appeared
 * during testing came from comparing live data against a seeded baseline;
 * suppression is enforced here rather than left to each call site.
 */

export type ProvenanceState =
  | "LIVE"              // measured this period, trustworthy
  | "NO_BASELINE"       // figure exists, but nothing to compare it against
  | "TAG_NOT_FIRING"    // Pinterest conversion tag not installed/firing
  | "GA4_NOT_CONNECTED" // GA4 access never granted
  | "PROCESSING"        // Pinterest still aggregating (last ~48h)
  | "PARTIAL_MONTH"     // period is incomplete, do not compare to full months
  | "NOT_MEASURED";     // no source has ever reported this

export const PROVENANCE_LABEL: Record<ProvenanceState, string> = {
  LIVE: "Live",
  NO_BASELINE: "No baseline",
  TAG_NOT_FIRING: "Tag not firing",
  GA4_NOT_CONNECTED: "GA4 not connected",
  PROCESSING: "Processing",
  PARTIAL_MONTH: "Partial month",
  NOT_MEASURED: "Not measured",
};

/** Why a figure is not shown. Surfaced on hover; never silently swallowed. */
export const PROVENANCE_REASON: Record<ProvenanceState, string> = {
  LIVE: "Measured for the selected period.",
  NO_BASELINE: "No phase-1 baseline was captured, so there is nothing to compare against. Complete P1.2.13 to enable comparison.",
  TAG_NOT_FIRING: "The Pinterest conversion tag is not installed or not firing, so conversion metrics cannot be measured. See P1.3.3.",
  GA4_NOT_CONNECTED: "GA4 Analyst access was never granted, so on-site quality metrics are unavailable. See P1.1.3.",
  PROCESSING: "Pinterest is still aggregating this period. Figures settle after roughly 48 hours.",
  PARTIAL_MONTH: "The selected period is incomplete. This figure is not comparable to a full month.",
  NOT_MEASURED: "No source has reported this figure.",
};

/** A figure that knows whether it can be trusted. */
export interface Figure {
  value: number | null;
  state: ProvenanceState;
  /** Set only when both this period and the baseline are measured. */
  delta: number | null;
  delta_pct: number | null;
  /** Why delta is absent, when it is. */
  delta_suppressed_because: ProvenanceState | null;
}

/** Build a figure and derive its comparison, refusing to invent one.
 *
 *  A delta requires BOTH sides measured. A percentage additionally requires
 *  a non-zero baseline — dividing by zero produced the "+466%" artefact and
 *  is blocked structurally here rather than by convention at each call site. */
export function figure(
  value: number | null | undefined,
  baseline: number | null | undefined,
  state: ProvenanceState = "LIVE"
): Figure {
  const v = value ?? null;
  const b = baseline ?? null;

  // A value we could not measure is never zero.
  if (v === null) {
    return {
      value: null,
      state: state === "LIVE" ? "NOT_MEASURED" : state,
      delta: null, delta_pct: null,
      delta_suppressed_because: state === "LIVE" ? "NOT_MEASURED" : state,
    };
  }

  // Value is real, but there is nothing to compare it against.
  if (b === null) {
    return {
      value: v, state,
      delta: null, delta_pct: null,
      delta_suppressed_because: "NO_BASELINE",
    };
  }

  const delta = v - b;
  // Percentage against a zero baseline is undefined, not infinite.
  const delta_pct = b === 0 ? null : Math.round((delta / b) * 100);

  return {
    value: v, state, delta,
    delta_pct,
    delta_suppressed_because: delta_pct === null ? "NO_BASELINE" : null,
  };
}

/** Render helper — the single place that decides what a missing value looks
 *  like. Returns an em dash, never "0", never "N/A". */
export function fmtFigure(f: Figure, opts: { currency?: string } = {}): string {
  if (f.value === null) return "—";
  const n = f.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return opts.currency ? `${opts.currency}${n}` : n;
}

/** Render helper for the comparison. Suppressed states return null so the
 *  caller renders nothing at all rather than an empty badge. */
export function fmtDelta(f: Figure): { text: string; direction: "up" | "down" | "flat" } | null {
  if (f.delta === null || f.delta_pct === null) return null;
  const direction = f.delta > 0 ? "up" : f.delta < 0 ? "down" : "flat";
  const sign = f.delta_pct > 0 ? "+" : "";
  return { text: `${sign}${f.delta_pct}%`, direction };
}

/** Decide the provenance of a whole metric family from the org's setup.
 *  Called once per report render so every figure in a family agrees. */
export interface SetupState {
  has_baseline: boolean;
  conversion_tag_firing: boolean;
  ga4_connected: boolean;
  period_is_partial: boolean;
  period_still_processing: boolean;
}

export function stateForPinterestMetric(s: SetupState): ProvenanceState {
  if (s.period_still_processing) return "PROCESSING";
  if (s.period_is_partial) return "PARTIAL_MONTH";
  return "LIVE";
}

export function stateForConversionMetric(s: SetupState): ProvenanceState {
  if (!s.conversion_tag_firing) return "TAG_NOT_FIRING";
  if (s.period_still_processing) return "PROCESSING";
  if (s.period_is_partial) return "PARTIAL_MONTH";
  return "LIVE";
}

export function stateForGa4Metric(s: SetupState): ProvenanceState {
  if (!s.ga4_connected) return "GA4_NOT_CONNECTED";
  return "LIVE";
}
