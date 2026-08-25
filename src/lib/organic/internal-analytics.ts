/**
 * STAGE 3d · store analytics, internal depth.
 *
 * Everything the client sees, plus what they should not. Five measures,
 * each answering a question the client report deliberately cannot:
 *
 *   attribution by decision   which choices produced results
 *   cost and margin           does this store make money
 *   cycle efficiency          does what we plan actually ship
 *   AI draft edit distance    where the prompts still need work
 *   cache contribution        what this store gave the other stores
 *
 * Same Stage-0 contract as everything else: unmeasurable is null, and a
 * ratio with no denominator is not computed.
 */
import { organicPool } from "./db";

/* ------------------------------------------------------------------ *
 * Cost and margin
 * ------------------------------------------------------------------ */

export interface StoreCost {
  minutes_logged: number;
  tasks_timed: number;
  tasks_total: number;
  /** Null when no retainer is recorded — never zero. A store we have not
   *  priced is not a store on nothing, and conflating them would sort a
   *  healthy account to the top of the loss-making list. */
  monthly_retainer: number | null;
  retainer_currency: string;
  hourly_cost: number | null;
  /** Delivery cost so far, hours x hourly_cost. Null if either is absent. */
  cost_to_date: number | null;
  /** Months since onboarding, floor 1. Null when no onboarded_date. */
  months_active: number | null;
  /** Retainer x months - cost. Null unless every input is present. */
  margin_to_date: number | null;
  /** Hours per €1000 of retainer per month — the number that says whether
   *  this store is worth the seat it occupies. */
  hours_per_1k_month: number | null;
}

export async function loadStoreCost(orgId: string): Promise<StoreCost> {
  const pool = organicPool();
  const r = await pool.query<{
    minutes: string | null; timed: string; total: string;
    monthly_retainer: string | null; retainer_currency: string;
    hourly_cost: string | null; onboarded_date: string | null;
  }>(
    `SELECT SUM(ct.time_spent_min)                                AS minutes,
            COUNT(*) FILTER (WHERE ct.time_spent_min IS NOT NULL) AS timed,
            COUNT(*)                                              AS total,
            MAX(cs.monthly_retainer)                              AS monthly_retainer,
            COALESCE(MAX(cs.retainer_currency), 'EUR')            AS retainer_currency,
            MAX(cs.hourly_cost)                                   AS hourly_cost,
            MAX(cs.onboarded_date)::text                          AS onboarded_date
       FROM organic.client_tasks ct
       LEFT JOIN organic.client_settings cs ON cs.org_id = ct.org_id
      WHERE ct.org_id = $1`,
    [orgId]
  );
  const row = r.rows[0];

  const minutes = row?.minutes ? Number(row.minutes) : 0;
  const retainer = row?.monthly_retainer != null ? Number(row.monthly_retainer) : null;
  const hourly = row?.hourly_cost != null ? Number(row.hourly_cost) : null;
  const hours = minutes / 60;

  let months: number | null = null;
  if (row?.onboarded_date) {
    const then = new Date(row.onboarded_date + "T00:00:00Z");
    const ms = Date.now() - then.getTime();
    months = Math.max(1, Math.floor(ms / (30 * 86_400_000)));
  }

  const cost = hourly != null ? Math.round(hours * hourly * 100) / 100 : null;
  const revenue = retainer != null && months != null ? retainer * months : null;

  return {
    minutes_logged: minutes,
    tasks_timed: Number(row?.timed ?? 0),
    tasks_total: Number(row?.total ?? 0),
    monthly_retainer: retainer,
    retainer_currency: row?.retainer_currency ?? "EUR",
    hourly_cost: hourly,
    cost_to_date: cost,
    months_active: months,
    margin_to_date: revenue != null && cost != null ? Math.round((revenue - cost) * 100) / 100 : null,
    hours_per_1k_month:
      retainer != null && retainer > 0 && months != null
        ? Math.round((hours / months / (retainer / 1000)) * 10) / 10
        : null,
  };
}

/* ------------------------------------------------------------------ *
 * Cycle efficiency
 * ------------------------------------------------------------------ */

export interface CycleEfficiency {
  waterfall_id: string;
  url_name: string | null;
  status: string;
  start_date: string | null;
  planned: number;
  published: number;
  failed: number;
  cancelled: number;
  /** published / (planned + published + failed). Null while nothing has
   *  been generated — a cycle with no pins has no efficiency, it has no
   *  data. */
  efficiency_pct: number | null;
}

export async function loadCycleEfficiency(orgId: string): Promise<CycleEfficiency[]> {
  const pool = organicPool();
  const r = await pool.query<Omit<CycleEfficiency, "efficiency_pct">>(
    `SELECT w.id::text AS waterfall_id, u.name AS url_name,
            w.status::text AS status, w.start_date::text AS start_date,
            COUNT(p.id) FILTER (WHERE p.status IN ('PLANNED','SCHEDULED'))::int AS planned,
            COUNT(p.id) FILTER (WHERE p.status = 'PUBLISHED')::int              AS published,
            COUNT(p.id) FILTER (WHERE p.status = 'FAILED')::int                 AS failed,
            COUNT(p.id) FILTER (WHERE p.status = 'CANCELLED')::int              AS cancelled
       FROM organic.waterfalls w
       LEFT JOIN organic.pins p ON p.waterfall_id = w.id
       LEFT JOIN organic.urls u ON u.id = w.url_id
      WHERE w.org_id = $1
      GROUP BY w.id, u.name, w.status, w.start_date
      ORDER BY w.start_date DESC NULLS LAST
      LIMIT 24`,
    [orgId]
  );
  return r.rows.map((c) => {
    // Cancelled pins are excluded from the denominator on purpose. A pin
    // pulled by a manager is a decision, not a delivery failure, and
    // counting it as one would punish exactly the judgement we want.
    const attempted = c.planned + c.published + c.failed;
    return {
      ...c,
      efficiency_pct: attempted > 0 ? Math.round((c.published / attempted) * 100) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * AI draft edit distance
 * ------------------------------------------------------------------ */

export interface DraftEditStat {
  kind: string;
  drafts: number;
  approved: number;
  /** Mean share of the draft that survived to approval, 0–100. Null when
   *  nothing of that kind has been approved yet. */
  kept_pct: number | null;
  untouched: number;
  rewritten: number;
}

/**
 * Levenshtein on the shorter axis, capped.
 *
 * Computed in JS rather than SQL because Postgres's levenshtein() lives in
 * fuzzystrmatch and caps at 255 characters — a pin description is longer
 * than that, and a silently truncated distance would understate rewriting
 * exactly where it matters most.
 */
export function editDistance(a: string, b: string, cap = 4000): number {
  const s = a.length > cap ? a.slice(0, cap) : a;
  const t = b.length > cap ? b.slice(0, cap) : b;
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let prev = new Array<number>(t.length + 1);
  let curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length];
}

export async function loadDraftEditStats(orgId: string): Promise<DraftEditStat[]> {
  const pool = organicPool();
  const r = await pool.query<{ kind: string; generated_text: string | null; approved_text: string | null }>(
    `SELECT kind::text AS kind, generated_text, approved_text
       FROM organic.ai_drafts
      WHERE org_id = $1`,
    [orgId]
  );

  const byKind = new Map<string, { drafts: number; kept: number[]; untouched: number; rewritten: number }>();
  for (const row of r.rows) {
    const e = byKind.get(row.kind) ?? { drafts: 0, kept: [], untouched: 0, rewritten: 0 };
    e.drafts++;
    if (row.generated_text && row.approved_text) {
      const d = editDistance(row.generated_text, row.approved_text);
      const longest = Math.max(row.generated_text.length, row.approved_text.length);
      const kept = longest > 0 ? Math.max(0, 100 - (d / longest) * 100) : 100;
      e.kept.push(kept);
      if (d === 0) e.untouched++;
      // Under half the draft surviving is not an edit, it is a rewrite —
      // and a surface that is routinely rewritten is a prompt problem,
      // not a manager problem.
      if (kept < 50) e.rewritten++;
    }
    byKind.set(row.kind, e);
  }

  return Array.from(byKind.entries())
    .map(([kind, e]) => ({
      kind,
      drafts: e.drafts,
      approved: e.kept.length,
      kept_pct: e.kept.length
        ? Math.round((e.kept.reduce((a, b) => a + b, 0) / e.kept.length) * 10) / 10
        : null,
      untouched: e.untouched,
      rewritten: e.rewritten,
    }))
    .sort((a, b) => (a.kept_pct ?? 101) - (b.kept_pct ?? 101));
}

/* ------------------------------------------------------------------ *
 * Cache contribution
 * ------------------------------------------------------------------ */

export interface CacheContribution {
  /** Volume lookups this store paid for. Attributed via
   *  looked_up_for_org — looked_up_by is the person, not the store, and
   *  comparing that against an org id is why this read 0 for everyone. */
  looked_up: number;
  /** Of those, how many other stores now hold in their own keyword bank —
   *  work this store did that the rest of the portfolio reused. */
  reused_by_others: number;
  /** Lookups this store consumed without paying for them. */
  received: number;
  /** Net: given minus taken. Positive means this store subsidises the
   *  portfolio's research. */
  net: number;
  top_shared: Array<{ term: string; volume: number | null; orgs: number }>;
}

export async function loadCacheContribution(orgId: string): Promise<CacheContribution> {
  const pool = organicPool();

  const [mine, reuse, received] = await Promise.all([
    pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM organic.keyword_volume_cache WHERE looked_up_for_org = $1`, [orgId]),
    pool.query<{ term: string; volume: number | null; orgs: string }>(
      `SELECT c.term, c.volume, COUNT(DISTINCT k.org_id) AS orgs
         FROM organic.keyword_volume_cache c
         JOIN organic.keywords k ON k.term = c.term AND k.org_id <> $1
        WHERE c.looked_up_for_org = $1
        GROUP BY c.term, c.volume
        ORDER BY COUNT(DISTINCT k.org_id) DESC, c.volume DESC NULLS LAST
        LIMIT 10`, [orgId]),
    pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n
         FROM organic.keywords k
         JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1
          AND c.looked_up_for_org IS DISTINCT FROM $1`, [orgId]),
  ]);

  const looked_up = Number(mine.rows[0]?.n ?? 0);
  const recv = Number(received.rows[0]?.n ?? 0);

  return {
    looked_up,
    reused_by_others: reuse.rowCount ?? 0,
    received: recv,
    net: looked_up - recv,
    top_shared: reuse.rows.map((r) => ({ term: r.term, volume: r.volume, orgs: Number(r.orgs) })),
  };
}
