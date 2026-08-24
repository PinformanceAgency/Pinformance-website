/**
 * Store health score — a composite figure with its components exposed,
 * never a black box.
 *
 *   Execution      30%   pins published vs target, cycles on schedule
 *   Foundation     25%   board coverage, keyword depth, boards over 10 pins
 *   Performance    25%   clicks and saves vs baseline
 *   Account health 20%   open leaks, token status
 *
 * Stage-0 rule applies here hardest: a component with nothing to measure
 * returns null rather than zero, and the composite is re-weighted across
 * whatever IS measurable. A score of "22" on a store that has not started
 * is a wrong number, and a wrong number is worse than no number.
 */
import { organicPool } from "./db";

export interface HealthComponent {
  key: "execution" | "foundation" | "performance" | "account";
  label: string;
  weight: number;
  /** 0–100, or null when there is nothing to measure yet. */
  score: number | null;
  /** What the score is made of, for the tooltip and the detail row. */
  detail: string;
}

export interface HealthScore {
  /** null until enough components are measurable to mean anything. */
  composite: number | null;
  components: HealthComponent[];
  /** Share of the weighting that could actually be measured, 0–1. */
  measured_weight: number;
  /** Why the composite is withheld, when it is. */
  withheld_reason: string | null;
}

export interface CohortContext {
  /** Whole months since onboarding started. null when never onboarded. */
  tenure_months: number | null;
  /** Other activated stores within ±1 month of this one. */
  cohort_size: number;
  /** Per component: this store vs the cohort median. Empty when the
   *  cohort is too small to have a median worth quoting. */
  comparisons: Array<{ key: HealthComponent["key"]; label: string; verdict: "above" | "at" | "below" }>;
  note: string;
}

const CLAMP = (n: number) => Math.max(0, Math.min(100, n));

/* ------------------------------------------------------------------ */

async function executionScore(orgId: string): Promise<HealthComponent> {
  const pool = organicPool();
  const [target, published, stalled] = await Promise.all([
    pool.query<{ t: number }>(
      `SELECT daily_pin_target AS t FROM organic.client_settings WHERE org_id = $1`, [orgId]),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1 AND p.scheduled_date > current_date - interval '30 days'
          AND p.status <> 'CANCELLED'`, [orgId]),
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.waterfalls
        WHERE org_id = $1 AND status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
          AND start_date < current_date - interval '20 days'`, [orgId]),
  ]);

  const dailyTarget = target.rows[0]?.t ?? null;
  const scheduled = published.rows[0].n;

  // Nothing scheduled and no cycle ever run: execution is not yet a
  // measurable dimension rather than a failed one.
  if (scheduled === 0) {
    return {
      key: "execution", label: "Execution", weight: 0.30, score: null,
      detail: "No pins scheduled in the last 30 days — nothing to measure yet.",
    };
  }

  const expected = (dailyTarget ?? 1) * 30;
  const delivery = CLAMP((scheduled / expected) * 100);
  const stallPenalty = stalled.rows[0].n * 15;
  return {
    key: "execution", label: "Execution", weight: 0.30,
    score: CLAMP(delivery - stallPenalty),
    detail: `${scheduled} pin(s) scheduled in 30d against a target of ${expected}` +
            (stalled.rows[0].n ? ` · ${stalled.rows[0].n} stalled cycle(s)` : ""),
  };
}

async function foundationScore(orgId: string): Promise<HealthComponent> {
  const pool = organicPool();
  const [cov, kw, boards] = await Promise.all([
    pool.query<{ total: number; covered: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_covered)::int AS covered
         FROM organic.topic_coverage WHERE org_id = $1`, [orgId]),
    pool.query<{ validated: number }>(
      `SELECT COUNT(*)::int AS validated
         FROM organic.keywords k
         JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1 AND c.volume IS NOT NULL AND c.not_found = false`, [orgId]),
    pool.query<{ total: number; seeded: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE pin_count >= 10)::int AS seeded
         FROM organic.boards
        WHERE org_id = $1 AND status IN ('SECRET','PROTECTED','PUBLIC')`, [orgId]),
  ]);

  const topics = cov.rows[0], kws = kw.rows[0].validated, bd = boards.rows[0];

  // No topics and no boards means the architecture has not been built.
  // That is a stage of the work, not a bad score.
  if (topics.total === 0 && bd.total === 0 && kws === 0) {
    return {
      key: "foundation", label: "Foundation", weight: 0.25, score: null,
      detail: "No topics, boards or validated keywords yet — foundation not started.",
    };
  }

  // Three equal parts: topic coverage, keyword depth (40 is a full bank),
  // and the share of live boards that clear ten pins.
  const covPart = topics.total > 0 ? (topics.covered / topics.total) * 100 : 0;
  const kwPart = CLAMP((kws / 40) * 100);
  const boardPart = bd.total > 0 ? (bd.seeded / bd.total) * 100 : 0;

  return {
    key: "foundation", label: "Foundation", weight: 0.25,
    score: CLAMP((covPart + kwPart + boardPart) / 3),
    detail: `${topics.covered}/${topics.total} topics covered · ${kws} validated keyword(s) · ${bd.seeded}/${bd.total} boards over 10 pins`,
  };
}

async function performanceScore(orgId: string): Promise<HealthComponent> {
  const pool = organicPool();
  const [perf, base] = await Promise.all([
    pool.query<{ clicks: number; saves: number }>(
      `SELECT COALESCE(SUM(pp.outbound_clicks),0)::int AS clicks,
              COALESCE(SUM(pp.saves),0)::int AS saves
         FROM organic.pin_performance pp
         JOIN organic.pins p ON p.id = pp.pin_id
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1 AND pp.measured_on > current_date - interval '30 days'`, [orgId]),
    pool.query<{ clicks: number | null; saves: number | null }>(
      `SELECT outbound_clicks AS clicks, pin_saves AS saves
         FROM organic.baseline_kpis WHERE org_id = $1 AND period = 'last_30d'`, [orgId]),
  ]);

  const b = base.rows[0];
  // Performance without a baseline is a number with no meaning — this is
  // exactly the comparison Stage 0 forbids inventing.
  if (!b || b.clicks == null) {
    return {
      key: "performance", label: "Performance", weight: 0.25, score: null,
      detail: "No phase-1 baseline captured, so there is nothing to measure performance against.",
    };
  }
  const cur = perf.rows[0];
  if (cur.clicks === 0 && cur.saves === 0) {
    return {
      key: "performance", label: "Performance", weight: 0.25, score: null,
      detail: "No measured pin performance in the last 30 days yet.",
    };
  }

  // 100 = matching baseline. Above baseline scores above 100, clamped.
  const clickRatio = b.clicks > 0 ? cur.clicks / b.clicks : 1;
  const saveRatio = (b.saves ?? 0) > 0 ? cur.saves / (b.saves ?? 1) : 1;
  return {
    key: "performance", label: "Performance", weight: 0.25,
    score: CLAMP(((clickRatio + saveRatio) / 2) * 100),
    detail: `${cur.clicks} clicks / ${cur.saves} saves in 30d against a baseline of ${b.clicks} / ${b.saves ?? "—"}`,
  };
}

async function accountScore(orgId: string, leakCount: number): Promise<HealthComponent> {
  const pool = organicPool();
  const tok = await pool.query<{ expires: string | null; has: boolean }>(
    `SELECT pinterest_token_expires_at::text AS expires,
            pinterest_access_token_encrypted IS NOT NULL AS has
       FROM public.organizations WHERE id = $1`, [orgId]);
  const t = tok.rows[0];

  let score = 100;
  const notes: string[] = [];

  if (!t?.has) { score -= 60; notes.push("no Pinterest token"); }
  else if (t.expires) {
    const days = Math.floor((new Date(t.expires).getTime() - Date.now()) / 86_400_000);
    if (days < 0)       { score -= 60; notes.push("token expired"); }
    else if (days <= 14){ score -= 20; notes.push(`token expires in ${days}d`); }
  }
  score -= leakCount * 6;

  return {
    key: "account", label: "Account health", weight: 0.20,
    score: CLAMP(score),
    detail: notes.length
      ? `${notes.join(" · ")} · ${leakCount} open leak(s)`
      : `Token valid · ${leakCount} open leak(s)`,
  };
}

/* ------------------------------------------------------------------ */

export async function computeHealthScore(orgId: string, leakCount: number): Promise<HealthScore> {
  const components = await Promise.all([
    executionScore(orgId),
    foundationScore(orgId),
    performanceScore(orgId),
    accountScore(orgId, leakCount),
  ]);

  const measurable = components.filter((c) => c.score !== null);
  const measuredWeight = measurable.reduce((s, c) => s + c.weight, 0);

  // Below half the weighting there is not enough signal for a composite
  // to mean anything, so we withhold it rather than publish a figure the
  // manager would act on.
  if (measuredWeight < 0.5) {
    const missing = components.filter((c) => c.score === null).map((c) => c.label.toLowerCase());
    return {
      composite: null, components, measured_weight: measuredWeight,
      withheld_reason: `Only ${Math.round(measuredWeight * 100)}% of the score is measurable so far — ${missing.join(", ")} have nothing to measure yet. A composite would be a guess.`,
    };
  }

  // Re-weight across what is measurable so an unstarted component does
  // not silently drag the score down as if it had scored zero.
  const composite = measurable.reduce((s, c) => s + c.score! * c.weight, 0) / measuredWeight;
  return {
    composite: Math.round(composite), components,
    measured_weight: measuredWeight, withheld_reason: null,
  };
}

/* ------------------------------------------------------------------ */

/** Tenure and cohort. A score is meaningless without tenure: a month-two
 *  store compared against a mature account produces a ranking that drives
 *  attention to the wrong place. */
export async function loadCohortContext(orgId: string, own: HealthScore): Promise<CohortContext> {
  const pool = organicPool();
  const me = await pool.query<{ onboarded: string | null }>(
    `SELECT onboarded_date::text AS onboarded FROM organic.client_settings WHERE org_id = $1`, [orgId]);
  const onboarded = me.rows[0]?.onboarded ?? null;
  const tenure = onboarded
    ? Math.max(0, Math.floor((Date.now() - new Date(onboarded).getTime()) / (30 * 86_400_000)))
    : null;

  if (tenure === null) {
    return {
      tenure_months: null, cohort_size: 0, comparisons: [],
      note: "No onboarding date recorded, so this store cannot be placed in a cohort yet.",
    };
  }

  const peers = await pool.query<{ org_id: string }>(
    `SELECT org_id::text FROM organic.client_settings
      WHERE org_id <> $1 AND onboarded_date IS NOT NULL
        AND ABS(EXTRACT(EPOCH FROM (current_date - onboarded_date)) / 2592000 - $2) <= 1`,
    [orgId, tenure]);

  // Fewer than three peers has no median worth quoting. Saying so is
  // better than inventing a comparison.
  if (peers.rowCount !== null && peers.rowCount < 3) {
    return {
      tenure_months: tenure, cohort_size: peers.rowCount, comparisons: [],
      note: `Month ${tenure} · only ${peers.rowCount} comparable store(s) at this tenure, too few for a median.`,
    };
  }

  const peerScores = await Promise.all(
    peers.rows.map((p) => computeHealthScore(p.org_id, 0))
  );
  const comparisons: CohortContext["comparisons"] = [];
  for (const c of own.components) {
    if (c.score === null) continue;
    const vals = peerScores
      .map((ps) => ps.components.find((x) => x.key === c.key)?.score)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (vals.length < 3) continue;
    const median = vals[Math.floor(vals.length / 2)];
    const diff = c.score - median;
    comparisons.push({
      key: c.key, label: c.label,
      verdict: Math.abs(diff) < 5 ? "at" : diff > 0 ? "above" : "below",
    });
  }

  const above = comparisons.filter((x) => x.verdict === "above").map((x) => x.label.toLowerCase());
  const below = comparisons.filter((x) => x.verdict === "below").map((x) => x.label.toLowerCase());
  const parts: string[] = [];
  if (above.length) parts.push(`above cohort median on ${above.join(", ")}`);
  if (below.length) parts.push(`below on ${below.join(", ")}`);

  return {
    tenure_months: tenure, cohort_size: peers.rowCount ?? 0, comparisons,
    note: `Month ${tenure} · ${parts.length ? parts.join(", ") : "in line with the cohort"}`,
  };
}
