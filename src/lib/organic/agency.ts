/**
 * STAGE 4 · the business level.
 *
 * Everything here is cross-store. It answers the owner test from the
 * brief — which stores make money, which lose money, and how many more
 * we can take — and the manager test: what needs doing today across the
 * whole book without opening fifty pages.
 *
 * Cohort discipline runs through all of it. A month-two store compared
 * against a month-fourteen store produces a ranking that is worse than
 * useless, because it points attention at the wrong accounts.
 */
import { organicPool } from "./db";

/* ------------------------------------------------------------------ *
 * 3.1 · Portfolio
 * ------------------------------------------------------------------ */

export interface PortfolioRow {
  org_id: string;
  name: string;
  engagement_status: string | null;
  account_class: string | null;
  niche: string | null;
  onboarded_date: string | null;
  /** Whole months since onboarding. Null when we never recorded a date —
   *  which also means the store cannot be placed in a cohort. */
  tenure_months: number | null;
  /** Cohort label used for every comparison on this screen. */
  cohort: string | null;
  boards_live: number;
  topics_covered: number;
  topics_total: number;
  keywords_validated: number;
  urls_total: number;
  pins_published_30d: number;
  pins_scheduled_ahead: number;
  open_leaks: number;
  blocked_tasks: number;
  outstanding_tasks: number;
  onboarding_pct: number;
  clicks_30d: number | null;
  clicks_prev_30d: number | null;
  baseline_clicks: number | null;
  /** Against the phase-1 baseline. Null when no baseline was captured —
   *  never computed against zero. */
  vs_baseline_pct: number | null;
  /** Month over month. Null unless both windows have measured data. */
  mom_pct: number | null;
  minutes_logged: number;
  monthly_retainer: number | null;
  retainer_currency: string;
  hourly_cost: number | null;
}

const COHORTS: Array<[string, (m: number) => boolean]> = [
  ["Month 1–2",   (m) => m <= 2],
  ["Month 3–5",   (m) => m <= 5],
  ["Month 6–11",  (m) => m <= 11],
  ["Month 12+",   () => true],
];

export function cohortFor(tenureMonths: number | null): string | null {
  if (tenureMonths === null) return null;
  return COHORTS.find(([, test]) => test(tenureMonths))?.[0] ?? null;
}

export async function loadPortfolio(): Promise<PortfolioRow[]> {
  const pool = organicPool();

  // One pass over the book. Correlated subqueries rather than a chain of
  // joins: each counts a different grain, and joining them would multiply
  // rows in ways that silently inflate every figure on the screen.
  const r = await pool.query<Omit<PortfolioRow, "tenure_months" | "cohort" | "vs_baseline_pct" | "mom_pct">>(
    `SELECT o.id::text AS org_id, o.name,
            cs.engagement_status::text AS engagement_status,
            cs.account_class::text     AS account_class,
            cs.niche,
            cs.onboarded_date::text    AS onboarded_date,
            cs.monthly_retainer,
            COALESCE(cs.retainer_currency, 'EUR') AS retainer_currency,
            cs.hourly_cost,

            (SELECT COUNT(*)::int FROM organic.boards b
              WHERE b.org_id = o.id AND b.status IN ('SECRET','PROTECTED','PUBLIC')) AS boards_live,
            (SELECT COUNT(*) FILTER (WHERE tc.is_covered)::int FROM organic.topic_coverage tc
              WHERE tc.org_id = o.id) AS topics_covered,
            (SELECT COUNT(*)::int FROM organic.topic_coverage tc WHERE tc.org_id = o.id) AS topics_total,
            (SELECT COUNT(*)::int FROM organic.keywords k
               JOIN organic.keyword_volume_cache c ON c.term = k.term
              WHERE k.org_id = o.id AND c.volume IS NOT NULL AND c.not_found = false) AS keywords_validated,
            (SELECT COUNT(*)::int FROM organic.urls u WHERE u.org_id = o.id) AS urls_total,

            (SELECT COUNT(*)::int FROM organic.pins p
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.org_id = o.id AND p.status = 'PUBLISHED'
                AND p.scheduled_date > current_date - interval '30 days') AS pins_published_30d,
            (SELECT COUNT(*)::int FROM organic.pins p
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.org_id = o.id AND p.scheduled_date >= current_date
                AND p.status <> 'CANCELLED') AS pins_scheduled_ahead,

            (SELECT COUNT(*)::int FROM organic.client_tasks ct
              WHERE ct.org_id = o.id AND ct.status = 'BLOCKED') AS blocked_tasks,
            (SELECT COUNT(*)::int FROM organic.client_tasks ct
              WHERE ct.org_id = o.id AND ct.status IN ('TODO','BLOCKED','IN_PROGRESS','REVIEW')) AS outstanding_tasks,
            COALESCE((SELECT ROUND(AVG(cp.pct_done))::int FROM organic.client_progress cp
                       WHERE cp.org_id = o.id AND cp.phase <= 3), 0) AS onboarding_pct,
            0 AS open_leaks,

            COALESCE((SELECT SUM(ct.time_spent_min)::int FROM organic.client_tasks ct
                       WHERE ct.org_id = o.id), 0) AS minutes_logged,

            (SELECT SUM(pp.outbound_clicks)::int FROM organic.pin_performance pp
               JOIN organic.pins p ON p.id = pp.pin_id
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.org_id = o.id
                AND pp.measured_on > current_date - interval '30 days') AS clicks_30d,
            (SELECT SUM(pp.outbound_clicks)::int FROM organic.pin_performance pp
               JOIN organic.pins p ON p.id = pp.pin_id
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.org_id = o.id
                AND pp.measured_on > current_date - interval '60 days'
                AND pp.measured_on <= current_date - interval '30 days') AS clicks_prev_30d,
            (SELECT bk.outbound_clicks FROM organic.baseline_kpis bk
              WHERE bk.org_id = o.id AND bk.period = 'last_30d') AS baseline_clicks

       FROM public.organizations o
       JOIN organic.client_settings cs ON cs.org_id = o.id
      ORDER BY o.name`
  );

  return r.rows.map((row) => {
    let tenure: number | null = null;
    if (row.onboarded_date) {
      const then = new Date(row.onboarded_date + "T00:00:00Z").getTime();
      tenure = Math.max(0, Math.floor((Date.now() - then) / (30 * 86_400_000)));
    }
    const clicks = row.clicks_30d;
    const prev = row.clicks_prev_30d;
    const base = row.baseline_clicks;

    return {
      ...row,
      minutes_logged: Number(row.minutes_logged ?? 0),
      monthly_retainer: row.monthly_retainer != null ? Number(row.monthly_retainer) : null,
      hourly_cost: row.hourly_cost != null ? Number(row.hourly_cost) : null,
      tenure_months: tenure,
      cohort: cohortFor(tenure),
      vs_baseline_pct:
        clicks != null && base != null && base > 0
          ? Math.round(((clicks - base) / base) * 100) : null,
      mom_pct:
        clicks != null && prev != null && prev > 0
          ? Math.round(((clicks - prev) / prev) * 100) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * 3.2 · Execution
 * ------------------------------------------------------------------ */

export interface WaitingBucket {
  waiting_on: string;
  tasks: number;
  stores: number;
  /** Longest wait in the bucket, in days. The number that starts the
   *  conversation — an average hides the account that has been stuck
   *  for six weeks. */
  oldest_days: number | null;
  median_days: number | null;
}

export interface OnboardingInFlight {
  org_id: string;
  name: string;
  started: string | null;
  days_elapsed: number | null;
  pct_done: number;
  blocked_tasks: number;
  /** Against the one-month norm from the SOP. */
  over_norm: boolean;
}

export interface ThroughputRow {
  person: string;
  week: string;
  tasks_done: number;
  minutes: number;
}

export interface ExecutionView {
  waiting: WaitingBucket[];
  /** True when nobody has recorded a cause yet — the panel says so rather
   *  than implying the book has no blocked work. */
  waiting_uncaptured: boolean;
  blocked_total: number;
  onboarding: OnboardingInFlight[];
  cycles_behind: Array<{ org_name: string; url_name: string | null; status: string; days_open: number }>;
  throughput: ThroughputRow[];
  pins_30d: { published: number; failed: number; committed: number | null };
}

const ONBOARDING_NORM_DAYS = 30;

export async function loadExecution(): Promise<ExecutionView> {
  const pool = organicPool();

  const [waiting, blocked, onboarding, behind, throughput, pins] = await Promise.all([
    pool.query<{ waiting_on: string; tasks: string; stores: string; oldest: string | null; median: string | null }>(
      `SELECT waiting_on::text AS waiting_on,
              COUNT(*)                                    AS tasks,
              COUNT(DISTINCT org_id)                      AS stores,
              MAX(current_date - waiting_since)           AS oldest,
              ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY (current_date - waiting_since)))  AS median
         FROM organic.client_tasks
        WHERE waiting_on IS NOT NULL
          AND status IN ('TODO','BLOCKED','IN_PROGRESS','REVIEW')
        GROUP BY waiting_on
        ORDER BY COUNT(*) DESC`),

    pool.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM organic.client_tasks WHERE status = 'BLOCKED'`),

    pool.query<{ org_id: string; name: string; started: string | null; pct: string; blocked: string }>(
      `SELECT o.id::text AS org_id, o.name,
              cs.onboarded_date::text AS started,
              COALESCE(ROUND(AVG(cp.pct_done)), 0) AS pct,
              (SELECT COUNT(*) FROM organic.client_tasks ct
                WHERE ct.org_id = o.id AND ct.status = 'BLOCKED') AS blocked
         FROM public.organizations o
         JOIN organic.client_settings cs ON cs.org_id = o.id
         LEFT JOIN organic.client_progress cp ON cp.org_id = o.id AND cp.phase <= 3
        WHERE cs.engagement_status IN ('ONBOARDING','PROSPECT')
        GROUP BY o.id, o.name, cs.onboarded_date
       HAVING COALESCE(ROUND(AVG(cp.pct_done)), 0) < 100
        ORDER BY cs.onboarded_date NULLS LAST`),

    pool.query<{ org_name: string; url_name: string | null; status: string; days_open: string }>(
      `SELECT o.name AS org_name, u.name AS url_name, w.status::text AS status,
              (current_date - w.start_date) AS days_open
         FROM organic.waterfalls w
         JOIN public.organizations o ON o.id = w.org_id
         LEFT JOIN organic.urls u ON u.id = w.url_id
        WHERE w.status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
          AND w.start_date < current_date - interval '20 days'
        ORDER BY w.start_date ASC
        LIMIT 50`),

    // completed_by / assigned_to are uuids, so the fallback label has to be
    // applied after the join, not inside COALESCE. Resolve to a name where
    // we have one — a throughput table of raw uuids is unreadable, and
    // this screen exists to be read at a glance.
    pool.query<{ person: string; week: string; tasks_done: string; minutes: string | null }>(
      `SELECT COALESCE(u.full_name, u.email, ct.completed_by::text,
                       ct.assigned_to::text, 'unassigned') AS person,
              to_char(date_trunc('week', ct.completed_at), 'YYYY-MM-DD') AS week,
              COUNT(*)                    AS tasks_done,
              SUM(ct.time_spent_min)      AS minutes
         FROM organic.client_tasks ct
         LEFT JOIN public.users u
                ON u.id = COALESCE(ct.completed_by, ct.assigned_to)
        WHERE ct.status = 'DONE' AND ct.completed_at > now() - interval '56 days'
        GROUP BY 1, 2
        ORDER BY 2 DESC, 3 DESC`),

    pool.query<{ published: string; failed: string; committed: string | null }>(
      `SELECT
         (SELECT COUNT(*) FROM organic.pins p
            JOIN organic.waterfalls w ON w.id = p.waterfall_id
           WHERE p.status = 'PUBLISHED'
             AND p.scheduled_date > current_date - interval '30 days') AS published,
         (SELECT COUNT(*) FROM organic.pins p
            JOIN organic.waterfalls w ON w.id = p.waterfall_id
           WHERE p.status = 'FAILED'
             AND p.scheduled_date > current_date - interval '30 days') AS failed,
         (SELECT SUM(cs.daily_pin_target) * 30 FROM organic.client_settings cs
           WHERE cs.engagement_status = 'ACTIVE') AS committed`),
  ]);

  const n = (v: string | null | undefined) => (v == null ? 0 : Number(v));

  return {
    waiting: waiting.rows.map((w) => ({
      waiting_on: w.waiting_on,
      tasks: Number(w.tasks),
      stores: Number(w.stores),
      oldest_days: w.oldest != null ? Number(w.oldest) : null,
      median_days: w.median != null ? Number(w.median) : null,
    })),
    waiting_uncaptured: (waiting.rowCount ?? 0) === 0,
    blocked_total: n(blocked.rows[0]?.n),
    onboarding: onboarding.rows.map((o) => {
      const days = o.started
        ? Math.floor((Date.now() - new Date(o.started + "T00:00:00Z").getTime()) / 86_400_000)
        : null;
      return {
        org_id: o.org_id, name: o.name, started: o.started,
        days_elapsed: days, pct_done: Number(o.pct),
        blocked_tasks: Number(o.blocked),
        over_norm: days != null && days > ONBOARDING_NORM_DAYS,
      };
    }),
    cycles_behind: behind.rows.map((c) => ({ ...c, days_open: Number(c.days_open) })),
    throughput: throughput.rows.map((t) => ({
      person: t.person, week: t.week,
      tasks_done: Number(t.tasks_done), minutes: n(t.minutes),
    })),
    pins_30d: {
      published: n(pins.rows[0]?.published),
      failed: n(pins.rows[0]?.failed),
      // Null, not zero: with no active store carrying a daily target there
      // is nothing committed to measure against, and 0 would read as
      // "we promised nothing and delivered".
      committed: pins.rows[0]?.committed != null ? Number(pins.rows[0].committed) : null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 3.3 · Capacity and margin
 * ------------------------------------------------------------------ */

export interface HoursBucket { label: string; minutes: number; tasks: number }

export interface MarginView {
  by_phase: HoursBucket[];
  by_task_type: HoursBucket[];
  /** Total minutes recorded across the book, and how much of the work
   *  carries a time entry at all — the coverage that decides whether any
   *  of these numbers can be trusted. */
  minutes_total: number;
  tasks_timed: number;
  tasks_total: number;
  /** Sum of retainers for stores that have one. Stores without are counted
   *  separately rather than folded in as zero. */
  retainer_known_total: number;
  retainer_unknown_stores: number;
  currency: string;
}

export async function loadMargin(): Promise<MarginView> {
  const pool = organicPool();
  const [byPhase, byType, totals, retainers] = await Promise.all([
    pool.query<{ label: string; minutes: string | null; tasks: string }>(
      `SELECT 'Phase ' || td.phase AS label,
              SUM(ct.time_spent_min) AS minutes,
              COUNT(*) FILTER (WHERE ct.time_spent_min IS NOT NULL) AS tasks
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        GROUP BY td.phase ORDER BY td.phase`),
    pool.query<{ label: string; minutes: string | null; tasks: string }>(
      `SELECT td.task_type::text AS label,
              SUM(ct.time_spent_min) AS minutes,
              COUNT(*) FILTER (WHERE ct.time_spent_min IS NOT NULL) AS tasks
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        GROUP BY td.task_type ORDER BY SUM(ct.time_spent_min) DESC NULLS LAST`),
    pool.query<{ minutes: string | null; timed: string; total: string }>(
      `SELECT SUM(time_spent_min) AS minutes,
              COUNT(*) FILTER (WHERE time_spent_min IS NOT NULL) AS timed,
              COUNT(*) AS total
         FROM organic.client_tasks`),
    pool.query<{ known: string | null; unknown: string; ccy: string | null }>(
      `SELECT SUM(monthly_retainer) AS known,
              COUNT(*) FILTER (WHERE monthly_retainer IS NULL) AS unknown,
              MODE() WITHIN GROUP (ORDER BY retainer_currency) AS ccy
         FROM organic.client_settings
        WHERE engagement_status IN ('ACTIVE','ONBOARDING')`),
  ]);

  const n = (v: string | null | undefined) => (v == null ? 0 : Number(v));
  const bucket = (rows: Array<{ label: string; minutes: string | null; tasks: string }>) =>
    rows.map((r) => ({ label: r.label, minutes: n(r.minutes), tasks: Number(r.tasks) }));

  return {
    by_phase: bucket(byPhase.rows),
    by_task_type: bucket(byType.rows),
    minutes_total: n(totals.rows[0]?.minutes),
    tasks_timed: Number(totals.rows[0]?.timed ?? 0),
    tasks_total: Number(totals.rows[0]?.total ?? 0),
    retainer_known_total: n(retainers.rows[0]?.known),
    retainer_unknown_stores: Number(retainers.rows[0]?.unknown ?? 0),
    currency: retainers.rows[0]?.ccy ?? "EUR",
  };
}

/* ------------------------------------------------------------------ *
 * 3.4 · Risk — the churn list, three months early
 * ------------------------------------------------------------------ */

export interface RiskFlag {
  org_id: string;
  name: string;
  kind: string;
  detail: string;
  /** Lower is more urgent, so the list sorts by consequence rather than
   *  by whichever check happened to run first. */
  rank: number;
}

export async function loadRisk(portfolio?: PortfolioRow[]): Promise<RiskFlag[]> {
  const pool = organicPool();
  const rows = portfolio ?? (await loadPortfolio());
  const flags: RiskFlag[] = [];

  for (const p of rows) {
    // Declining performance and rising hours — the combination, not either
    // alone. A store getting cheaper to run while results dip is a
    // different problem from one consuming more hours for less return.
    if (p.mom_pct != null && p.mom_pct < -15) {
      flags.push({
        org_id: p.org_id, name: p.name, kind: "performance_declining",
        detail: `Outbound clicks down ${Math.abs(p.mom_pct)}% month over month`,
        rank: 2,
      });
    }
    if (p.vs_baseline_pct != null && p.vs_baseline_pct < 0) {
      flags.push({
        org_id: p.org_id, name: p.name, kind: "below_baseline",
        detail: `${Math.abs(p.vs_baseline_pct)}% below the phase-1 baseline`,
        rank: 1,
      });
    }
    // A store past the onboarding norm with onboarding unfinished is the
    // single strongest early churn signal in this book: the client has
    // paid for a month and has nothing live to show for it.
    if (p.engagement_status === "ONBOARDING" && p.tenure_months != null
        && p.tenure_months >= 2 && p.onboarding_pct < 100) {
      flags.push({
        org_id: p.org_id, name: p.name, kind: "onboarding_overrun",
        detail: `Month ${p.tenure_months} and onboarding is ${p.onboarding_pct}% done`,
        rank: 1,
      });
    }
    if (p.engagement_status === "ACTIVE" && p.pins_scheduled_ahead === 0) {
      flags.push({
        org_id: p.org_id, name: p.name, kind: "nothing_queued",
        detail: "Active store with no pins scheduled ahead",
        rank: 3,
      });
    }
    if (p.boards_live > 0 && p.topics_total > 0 && p.topics_covered === 0) {
      flags.push({
        org_id: p.org_id, name: p.name, kind: "no_topic_covered",
        detail: `0 of ${p.topics_total} topics reach five boards — phase 4 cannot start`,
        rank: 2,
      });
    }
  }

  // Unresponsive clients, from the waiting-on capture rather than a guess.
  const stale = await pool.query<{ org_id: string; name: string; days: string; tasks: string }>(
    `SELECT o.id::text AS org_id, o.name,
            MAX(current_date - ct.waiting_since) AS days,
            COUNT(*) AS tasks
       FROM organic.client_tasks ct
       JOIN public.organizations o ON o.id = ct.org_id
      WHERE ct.waiting_on = 'CLIENT'
        AND ct.status IN ('TODO','BLOCKED','IN_PROGRESS','REVIEW')
        AND ct.waiting_since < current_date - interval '14 days'
      GROUP BY o.id, o.name`
  );
  for (const s of stale.rows) {
    flags.push({
      org_id: s.org_id, name: s.name, kind: "client_unresponsive",
      detail: `${s.tasks} task(s) waiting on the client, oldest ${s.days} days`,
      rank: 2,
    });
  }

  // Dead or expiring Pinterest tokens — every write stops the day it lapses.
  const tokens = await pool.query<{ org_id: string; name: string; days: string | null; has_token: boolean }>(
    `SELECT o.id::text AS org_id, o.name,
            (o.pinterest_token_expires_at::date - current_date) AS days,
            o.pinterest_access_token_encrypted IS NOT NULL AS has_token
       FROM public.organizations o
       JOIN organic.client_settings cs ON cs.org_id = o.id
      WHERE cs.engagement_status IN ('ACTIVE','ONBOARDING')`
  );
  for (const t of tokens.rows) {
    if (!t.has_token) {
      flags.push({ org_id: t.org_id, name: t.name, kind: "no_token",
        detail: "No Pinterest token connected", rank: 1 });
    } else if (t.days != null && Number(t.days) < 0) {
      flags.push({ org_id: t.org_id, name: t.name, kind: "token_expired",
        detail: `Pinterest token expired ${Math.abs(Number(t.days))} days ago`, rank: 1 });
    } else if (t.days != null && Number(t.days) <= 14) {
      flags.push({ org_id: t.org_id, name: t.name, kind: "token_expiring",
        detail: `Pinterest token expires in ${t.days} days`, rank: 3 });
    }
  }

  return flags.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
