/**
 * Workspace data loaders — one query bundle per tab of the redesigned
 * client workspace. Everything is org-scoped and read-only. Writes still
 * live in phase[1-5].ts.
 */
import { organicPool } from "./db";
import { fieldsFor, visibleFields, completionHolds } from "./task-fields";

// ---------- LEAKS (Overview leak panel) -------------------------------------

export interface Leak {
  kind: string;               // machine-readable category
  label: string;              // one-line human summary
  count: number;              // how many items in this leak
  detail: string[];           // up to 5 examples, human-readable
  fix_href: string;           // deep-link to where it gets fixed
  /** The SOP task that resolves this leak, when there is one. A leak
   *  that cannot be clicked into a fix is a complaint, not a tool. */
  fix_task: string | null;
  severity: "high" | "medium" | "low";
  /** Ranked by what the leak COSTS, not by when it appeared. Lower is
   *  more expensive. Production-blocking beats cosmetic, always. */
  cost_rank: number;
  /** What it actually costs, in one clause. */
  cost: string;
}

export async function loadLeaks(orgId: string): Promise<Leak[]> {
  const pool = organicPool();
  const leaks: Leak[] = [];

  // 1. Boards under 10 pins (PROTECTED or PUBLIC → i.e. "live" but under-seeded)
  const under10 = await pool.query<{ name: string; pin_count: number }>(
    `SELECT name, pin_count FROM organic.boards
      WHERE org_id = $1 AND status IN ('SECRET','PROTECTED') AND pin_count < 10
      ORDER BY pin_count ASC LIMIT 20`, [orgId]);
  if (under10.rowCount ?? 0 > 0) {
    leaks.push({
      kind: "boards_under_10_pins",
      label: `${under10.rowCount} board(s) under 10 pins`,
      count: under10.rowCount ?? 0,
      detail: under10.rows.slice(0, 5).map((r) => `${r.name} (${r.pin_count} pins)`),
      fix_href: `boards`,
      fix_task: "P3.3.6",
      severity: "medium",
      cost_rank: 6,
      cost: "Boards under ten pins give the algorithm no context, so everything pinned there under-distributes.",
    });
  }

  // 2. Topics under 5 boards — from the topic_coverage view
  const uncovered = await pool.query<{ topic_name: string; active_boards: string }>(
    `SELECT topic_name, active_boards::text
       FROM organic.topic_coverage
      WHERE org_id = $1 AND is_covered = false
      ORDER BY active_boards ASC`, [orgId]);
  if ((uncovered.rowCount ?? 0) > 0) {
    leaks.push({
      kind: "topics_under_covered",
      label: `${uncovered.rowCount} topic(s) under 5 boards`,
      count: uncovered.rowCount ?? 0,
      detail: uncovered.rows.slice(0, 5).map((r) => `${r.topic_name} (${r.active_boards}/5)`),
      fix_href: `boards`,
      fix_task: "P3.3.1",
      severity: "high",
      cost_rank: 2,
      cost: "Blocks phase 4 for that topic entirely — no URL under it can enter production.",
    });
  }

  // 3. URLs out of cooldown that nobody has picked up (selectable + no active waterfall)
  const idleUrls = await pool.query<{ name: string; last_waterfall_end: string | null }>(
    `SELECT u.name, u.last_waterfall_end::text
       FROM organic.urls_selectable u
       LEFT JOIN organic.waterfalls w ON w.url_id = u.id AND w.status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
      WHERE u.org_id = $1 AND u.is_selectable = true AND w.id IS NULL
      ORDER BY COALESCE(u.last_waterfall_end, '2020-01-01') ASC LIMIT 20`, [orgId]);
  if ((idleUrls.rowCount ?? 0) > 0) {
    leaks.push({
      kind: "urls_idle",
      label: `${idleUrls.rowCount} URL(s) out of cooldown, no cycle running`,
      count: idleUrls.rowCount ?? 0,
      detail: idleUrls.rows.slice(0, 5).map((r) => `${r.name}${r.last_waterfall_end ? ` (last ran ${r.last_waterfall_end})` : " (never run)"}`),
      fix_href: `urls`,
      fix_task: "P4.1.4",
      severity: "medium",
      cost_rank: 7,
      cost: "Idle inventory — URLs that are cleared to run and earning nothing.",
    });
  }

  // 4. Keywords with volume never used
  const unusedKws = await pool.query<{ term: string; volume: number }>(
    `SELECT k.term, c.volume
       FROM organic.keywords k
       JOIN organic.keyword_volume_cache c ON c.term = k.term
       LEFT JOIN organic.url_keywords uk ON uk.keyword_id = k.id
      WHERE k.org_id = $1 AND c.not_found = false AND c.volume IS NOT NULL AND c.volume > 0
        AND uk.keyword_id IS NULL
      ORDER BY c.volume DESC LIMIT 20`, [orgId]);
  if ((unusedKws.rowCount ?? 0) > 0) {
    leaks.push({
      kind: "keywords_unused",
      label: `${unusedKws.rowCount} volume-cached keyword(s) never used on a URL`,
      count: unusedKws.rowCount ?? 0,
      detail: unusedKws.rows.slice(0, 5).map((r) => `${r.term} (vol ${r.volume})`),
      fix_href: `keywords`,
      fix_task: "P4.1.6",
      severity: "medium",
      cost_rank: 8,
      cost: "Reach already paid for in research hours and never deployed on a pin.",
    });
  }

  // 5. Boards with no activity in 30d (live boards where seeded_count hasn't
  //    grown and no recent pins on them via public.pins)
  const staleBoards = await pool.query<{ name: string; pin_count: number }>(
    `SELECT b.name, b.pin_count
       FROM organic.boards b
      WHERE b.org_id = $1
        AND b.status IN ('PROTECTED','PUBLIC')
        AND b.pinterest_board_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM organic.pins p
           JOIN organic.waterfalls w ON w.id = p.waterfall_id
          WHERE p.board_id = b.id
            AND p.scheduled_date > current_date - interval '30 days'
        )
      ORDER BY b.name LIMIT 20`, [orgId]);
  if ((staleBoards.rowCount ?? 0) > 0) {
    leaks.push({
      kind: "boards_no_activity_30d",
      label: `${staleBoards.rowCount} live board(s) with no pins scheduled in 30d`,
      count: staleBoards.rowCount ?? 0,
      detail: staleBoards.rows.slice(0, 5).map((r) => `${r.name} (${r.pin_count} pins)`),
      fix_href: `boards`,
      fix_task: null,
      severity: "low",
      cost_rank: 9,
      cost: "Dormant boards slowly lose their standing with the algorithm.",
    });
  }

  // 6. Expiring/expired Pinterest token
  const tok = await pool.query<{ expires_at: string | null; has_token: boolean }>(
    `SELECT pinterest_token_expires_at::text AS expires_at,
            pinterest_access_token_encrypted IS NOT NULL AS has_token
       FROM public.organizations WHERE id = $1`, [orgId]);
  if (tok.rowCount ?? 0 > 0) {
    const t = tok.rows[0];
    if (!t.has_token) {
      leaks.push({ kind: "no_token", label: "No Pinterest token connected", count: 1,
        detail: ["Reconnect Pinterest to enable API writes"], fix_href: `../../integrations`,
        fix_task: null, severity: "high", cost_rank: 1,
        cost: "Every write stops — no boards, no pins, no publishing." });
    } else if (t.expires_at) {
      const daysLeft = Math.floor((new Date(t.expires_at).getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        leaks.push({ kind: "token_expired", label: "Pinterest token EXPIRED", count: 1,
          detail: [`Expired ${-daysLeft} days ago on ${t.expires_at.slice(0, 10)}`],
          fix_href: `../../integrations`, fix_task: null, severity: "high", cost_rank: 1,
          cost: "Every write stops — no boards, no pins, no publishing." });
      } else if (daysLeft <= 14) {
        leaks.push({ kind: "token_expiring", label: `Pinterest token expires in ${daysLeft} day(s)`, count: 1,
          detail: [`Expires ${t.expires_at.slice(0, 10)}`], fix_href: `../../integrations`,
          fix_task: null, severity: "high", cost_rank: 5,
          cost: "Publishing stops the day it lapses, mid-cycle." });
      }
    }
  }

  // 7. Cycles stalled mid-waterfall
  const stalled = await pool.query<{ url_name: string | null; status: string; start_date: string }>(
    `SELECT u.name AS url_name, w.status::text, w.start_date::text
       FROM organic.waterfalls w LEFT JOIN organic.urls u ON u.id = w.url_id
      WHERE w.org_id = $1
        AND w.status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
        AND w.start_date < current_date - interval '20 days'
      ORDER BY w.start_date ASC LIMIT 20`, [orgId]);
  if ((stalled.rowCount ?? 0) > 0) {
    leaks.push({
      kind: "waterfalls_stalled",
      label: `${stalled.rowCount} cycle(s) stalled mid-waterfall`,
      count: stalled.rowCount ?? 0,
      detail: stalled.rows.slice(0, 5).map((r) => `${r.url_name ?? "(url gone)"} — status ${r.status} since ${r.start_date}`),
      fix_href: `phase/4`,
      fix_task: "P4.3.2",
      severity: "high",
      cost_rank: 3,
      cost: "Work already paid for that is not shipping — designs and copy sitting idle.",
    });
  }

  // 8. Performance below baseline for two consecutive months.
  const decline = await pool.query<{ m: string; clicks: number }>(
    `SELECT to_char(pp.measured_on, 'YYYY-MM') AS m,
            COALESCE(SUM(pp.outbound_clicks), 0)::int AS clicks
       FROM organic.pin_performance pp
       JOIN organic.pins p ON p.id = pp.pin_id
       JOIN organic.waterfalls w ON w.id = p.waterfall_id
      WHERE w.org_id = $1 AND pp.measured_on > current_date - interval '3 months'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 2`, [orgId]);
  const baseClicks = await pool.query<{ c: number | null }>(
    `SELECT outbound_clicks AS c FROM organic.baseline_kpis
      WHERE org_id = $1 AND period = 'last_30d'`, [orgId]);
  const bc = baseClicks.rows[0]?.c ?? null;
  if (bc != null && bc > 0 && decline.rowCount === 2 && decline.rows.every((r) => r.clicks < bc)) {
    leaks.push({
      kind: "performance_below_baseline",
      label: "Outbound clicks below baseline two months running",
      count: 2,
      detail: decline.rows.map((r) => `${r.m}: ${r.clicks} clicks vs baseline ${bc}`),
      fix_href: `analytics`,
      fix_task: "P5.2.2",
      severity: "high",
      cost_rank: 4,
      cost: "Two months of decline is the point where a client starts questioning the retainer.",
    });
  }

  // Ranked by cost, not recency. A production-blocking leak outranks a
  // cosmetic one regardless of which was noticed first.
  return leaks.sort((a, b) => a.cost_rank - b.cost_rank);
}

// ---------- BOARDS TAB ------------------------------------------------------

export interface BoardRow {
  id: string;
  name: string;
  topic_name: string | null;
  topic_covered: boolean;
  status: string;
  pin_count: number;
  seeded_count: number;
  breadth: string;
  primary_keyword: string | null;
  planned_creation_date: string | null;
  pinterest_board_id: string | null;
  last_pin_scheduled_date: string | null;
  urls_pinned_count: number;
  urls_pinned_names: string[];
}

export async function loadBoards(orgId: string): Promise<{ boards: BoardRow[]; coverage: Array<{ topic_name: string; active_boards: number; is_covered: boolean }> }> {
  const pool = organicPool();
  const [boards, coverage] = await Promise.all([
    pool.query<BoardRow>(
      `SELECT b.id::text, b.name,
              t.name AS topic_name,
              COALESCE(tc.is_covered, false) AS topic_covered,
              b.status::text, b.pin_count, b.seeded_count, b.breadth::text,
              b.primary_keyword, b.planned_creation_date::text, b.pinterest_board_id,
              (SELECT MAX(p.scheduled_date)::text FROM organic.pins p WHERE p.board_id = b.id) AS last_pin_scheduled_date,
              (SELECT COUNT(DISTINCT w.url_id)::int FROM organic.pins p
                 JOIN organic.waterfalls w ON w.id = p.waterfall_id
                WHERE p.board_id = b.id) AS urls_pinned_count,
              (SELECT COALESCE(array_agg(DISTINCT u.name) FILTER (WHERE u.name IS NOT NULL), ARRAY[]::text[])
                 FROM organic.pins p
                 JOIN organic.waterfalls w ON w.id = p.waterfall_id
                 JOIN organic.urls u ON u.id = w.url_id
                WHERE p.board_id = b.id) AS urls_pinned_names
         FROM organic.boards b
         LEFT JOIN organic.topics t ON t.id = b.topic_id
         LEFT JOIN organic.topic_coverage tc ON tc.topic_id = b.topic_id
        WHERE b.org_id = $1
        ORDER BY t.name NULLS LAST, b.name`, [orgId]
    ),
    pool.query<{ topic_name: string; active_boards: number; is_covered: boolean }>(
      `SELECT topic_name, active_boards::int, is_covered FROM organic.topic_coverage
        WHERE org_id = $1 ORDER BY is_covered, topic_name`, [orgId]
    ),
  ]);
  return { boards: boards.rows, coverage: coverage.rows };
}

// ---------- KEYWORDS TAB ----------------------------------------------------

export interface KeywordRow {
  id: string;
  term: string;
  type: string;
  source: string;
  seasonal_type: string | null;
  cluster_name: string | null;
  volume: number | null;
  volume_looked_up_at: string | null;
  volume_days_old: number | null;
  volume_stale: boolean;
  used_on_urls: number;
  parent_interest: boolean;
  client_forbidden: boolean;
}

export async function loadKeywords(orgId: string): Promise<KeywordRow[]> {
  const pool = organicPool();
  const r = await pool.query<KeywordRow>(
    `SELECT k.id::text, k.term, k.type::text, k.source::text,
            k.seasonal_type::text, kc.name AS cluster_name,
            c.volume,
            c.looked_up_at::text AS volume_looked_up_at,
            CASE WHEN c.looked_up_at IS NOT NULL
                 THEN EXTRACT(DAY FROM now() - c.looked_up_at)::int ELSE NULL END AS volume_days_old,
            CASE WHEN c.looked_up_at IS NOT NULL
                 THEN EXTRACT(DAY FROM now() - c.looked_up_at)::int > 180 ELSE false END AS volume_stale,
            (SELECT COUNT(*)::int FROM organic.url_keywords uk WHERE uk.keyword_id = k.id) AS used_on_urls,
            (k.type = 'PARENT_INTEREST') AS parent_interest,
            k.client_forbidden
       FROM organic.keywords k
       LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
       LEFT JOIN organic.keyword_clusters kc ON kc.id = k.cluster_id
      WHERE k.org_id = $1
      ORDER BY c.volume DESC NULLS LAST, k.term`, [orgId]
  );
  return r.rows;
}

// ---------- URLs TAB --------------------------------------------------------

export interface UrlRow {
  id: string;
  url: string;
  name: string;
  type: string;
  reason: string;
  reason_note: string | null;
  funnel_stage: string | null;
  is_seasonal: boolean;
  peak_window_start: string | null;
  peak_window_end: string | null;
  last_waterfall_end: string | null;
  cooldown_until: string | null;
  cooldown_clear: boolean;
  next_available_date: string | null;   // effectively = cooldown_until or today
  assigned_boards: number;
  topic_covered: boolean;
  is_selectable: boolean;
  waterfalls_run: number;
  active_waterfall_status: string | null;
  total_impressions: number;
  total_saves: number;
  total_outbound_clicks: number;
}

export async function loadUrls(orgId: string): Promise<UrlRow[]> {
  const pool = organicPool();
  const r = await pool.query<UrlRow>(
    `SELECT u.id::text, u.url, u.name, u.type::text, u.reason::text, u.reason_note,
            u.funnel_stage::text, u.is_seasonal,
            u.peak_window_start::text, u.peak_window_end::text,
            u.last_waterfall_end::text, u.cooldown_until::text,
            (u.cooldown_until IS NULL OR u.cooldown_until <= current_date) AS cooldown_clear,
            (CASE WHEN u.cooldown_until IS NULL OR u.cooldown_until <= current_date
                  THEN current_date::text ELSE u.cooldown_until::text END) AS next_available_date,
            (SELECT COUNT(*)::int FROM organic.url_boards ub WHERE ub.url_id = u.id) AS assigned_boards,
            COALESCE(tc.is_covered, false) AS topic_covered,
            (
              (u.cooldown_until IS NULL OR u.cooldown_until <= current_date)
              AND COALESCE(tc.is_covered, false)
              AND (SELECT COUNT(*) FROM organic.url_boards ub WHERE ub.url_id = u.id) >= 5
            ) AS is_selectable,
            (SELECT COUNT(*)::int FROM organic.waterfalls w WHERE w.url_id = u.id) AS waterfalls_run,
            (SELECT status::text FROM organic.waterfalls w WHERE w.url_id = u.id
              AND w.status IN ('PLANNING','PRODUCTION','SCHEDULED','RUNNING')
              ORDER BY created_at DESC LIMIT 1) AS active_waterfall_status,
            (SELECT COALESCE(SUM(pp.impressions), 0)::int
               FROM organic.pin_performance pp
               JOIN organic.pins p ON p.id = pp.pin_id
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.url_id = u.id) AS total_impressions,
            (SELECT COALESCE(SUM(pp.saves), 0)::int
               FROM organic.pin_performance pp
               JOIN organic.pins p ON p.id = pp.pin_id
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.url_id = u.id) AS total_saves,
            (SELECT COALESCE(SUM(pp.outbound_clicks), 0)::int
               FROM organic.pin_performance pp
               JOIN organic.pins p ON p.id = pp.pin_id
               JOIN organic.waterfalls w ON w.id = p.waterfall_id
              WHERE w.url_id = u.id) AS total_outbound_clicks
       FROM organic.urls u
       LEFT JOIN organic.topic_coverage tc ON tc.topic_id = u.topic_id
      WHERE u.org_id = $1
      ORDER BY u.created_at DESC`, [orgId]
  );
  return r.rows;
}

// ---------- ASSETS TAB ------------------------------------------------------

export interface AssetRow {
  id: string;
  title: string;
  url: string;
  type: string;
  source_tool: string | null;
  linked_task_id: string | null;
  linked_task_name: string | null;
  uploaded_at: string;
  notes: string | null;
}

export async function loadAssets(orgId: string): Promise<AssetRow[]> {
  const pool = organicPool();
  const r = await pool.query<AssetRow>(
    `SELECT a.id::text, a.title, a.url, a.type, a.source_tool,
            a.linked_task_id, td.name AS linked_task_name,
            a.uploaded_at::text, a.notes
       FROM organic.assets a
       LEFT JOIN organic.task_definitions td ON td.id = a.linked_task_id
      WHERE a.org_id = $1
      ORDER BY a.uploaded_at DESC`, [orgId]
  );
  return r.rows;
}

export interface AssetInput {
  title: string;
  url: string;
  type: string;
  source_tool?: string | null;
  linked_task_id?: string | null;
  notes?: string | null;
}

export async function createAsset(orgId: string, p: AssetInput): Promise<string> {
  if (!p.title.trim() || !p.url.trim()) throw new Error("title and url are required");
  if (!/^https?:\/\//i.test(p.url)) throw new Error("url must start with http(s)://");
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO organic.assets (org_id, title, url, type, source_tool, linked_task_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id::text`,
    [orgId, p.title.trim(), p.url.trim(), p.type, p.source_tool ?? null, p.linked_task_id ?? null, p.notes ?? null]
  );
  return r.rows[0].id;
}

export async function deleteAsset(orgId: string, assetId: string): Promise<void> {
  await organicPool().query(`DELETE FROM organic.assets WHERE id = $1 AND org_id = $2`, [assetId, orgId]);
}

// ---------- PHASE DETAIL (phase strip) --------------------------------------

export interface PhaseDetail {
  phase: number;
  /** Minutes logged against tasks in this phase. Null when nobody has
   *  recorded any — which is different from having spent zero. */
  time_spent_min: number | null;
  /** How many tasks in the phase carry a time entry, so a manager can see
   *  whether the total is the whole picture or a fifth of it. */
  tasks_timed: number;
  tasks_done: number;
  /** The one task to open next: the first outstanding, unblocked task in
   *  SOP order. A phase card that shows a percentage tells you where you
   *  are; this tells you what to do, which is the only reason to open it. */
  next_task_id: string | null;
  next_task_name: string | null;
  /** Set when every outstanding task in the phase is blocked — the phase
   *  is stuck rather than merely unfinished, and that is a different
   *  conversation with a different fix. */
  all_blocked: boolean;
}

export async function loadPhaseDetail(orgId: string): Promise<PhaseDetail[]> {
  const pool = organicPool();

  const [times, next, blocked] = await Promise.all([
    pool.query<{ phase: number; mins: string | null; timed: string; done: string }>(
      `SELECT td.phase,
              SUM(ct.time_spent_min)                                    AS mins,
              COUNT(*) FILTER (WHERE ct.time_spent_min IS NOT NULL)     AS timed,
              COUNT(*) FILTER (WHERE ct.status = 'DONE')                AS done
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        WHERE ct.org_id = $1 AND td.active
        GROUP BY td.phase`, [orgId]),
    // DISTINCT ON gives the first row per phase in SOP order — the next
    // action — in one pass rather than a query per phase.
    pool.query<{ phase: number; task_id: string; name: string }>(
      `SELECT DISTINCT ON (td.phase) td.phase, ct.task_id, td.name
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        WHERE ct.org_id = $1 AND td.active AND ct.status = 'TODO'
        ORDER BY td.phase, td.sort_order`, [orgId]),
    pool.query<{ phase: number; outstanding: string; blocked: string }>(
      `SELECT td.phase,
              COUNT(*) FILTER (WHERE ct.status IN ('TODO','BLOCKED')) AS outstanding,
              COUNT(*) FILTER (WHERE ct.status = 'BLOCKED')           AS blocked
         FROM organic.client_tasks ct
         JOIN organic.task_definitions td ON td.id = ct.task_id
        WHERE ct.org_id = $1 AND td.active
        GROUP BY td.phase`, [orgId]),
  ]);

  const byPhase = new Map<number, PhaseDetail>();
  const get = (p: number): PhaseDetail => {
    let e = byPhase.get(p);
    if (!e) {
      e = { phase: p, time_spent_min: null, tasks_timed: 0, tasks_done: 0,
            next_task_id: null, next_task_name: null, all_blocked: false };
      byPhase.set(p, e);
    }
    return e;
  };

  for (const r of times.rows) {
    const e = get(r.phase);
    e.time_spent_min = r.mins === null ? null : Number(r.mins);
    e.tasks_timed = Number(r.timed);
    e.tasks_done = Number(r.done);
  }
  for (const r of next.rows) {
    const e = get(r.phase);
    e.next_task_id = r.task_id;
    e.next_task_name = r.name;
  }
  for (const r of blocked.rows) {
    const e = get(r.phase);
    const outstanding = Number(r.outstanding), b = Number(r.blocked);
    e.all_blocked = outstanding > 0 && b === outstanding;
  }

  return Array.from(byPhase.values()).sort((a, b) => a.phase - b.phase);
}

// ---------- CYCLE OPERATIONS (phase 4) --------------------------------------

export interface QueuedPin {
  id: string;
  content_code: string | null;
  scheduled_time: string | null;
  status: string;
  board_name: string | null;
  url_name: string | null;
  design_number: number | null;
  copy_variant: string | null;
  failure_reason: string | null;
}

export interface DesignBoardCell {
  design_number: number;
  intent: string | null;
  board_name: string;
  pins: number;
  published: number;
  failed: number;
}

export interface CycleOps {
  /** Pins due today. The one list a manager checks before lunch. */
  today: QueuedPin[];
  /** Failures across the last 14 days, newest first. Surfaced on their own
   *  rather than mixed into the queue: a failure is not a slower success,
   *  it needs a decision. */
  failures: QueuedPin[];
  /** Scheduled volume per day for the fortnight ahead — the shape of the
   *  publishing plan, and where the gaps are. */
  calendar: Array<{ day: string; planned: number; published: number; failed: number }>;
  /** Design x board coverage for every running waterfall. */
  matrix: Array<{ waterfall_id: string; url_name: string | null; cells: DesignBoardCell[] }>;
}

const PIN_SELECT = `
  p.id::text, p.content_code, p.scheduled_time::text, p.status::text,
  b.name AS board_name, u.name AS url_name,
  d.design_number, p.copy_variant, p.failure_reason`;

export async function loadCycleOps(orgId: string): Promise<CycleOps> {
  const pool = organicPool();

  const [today, failures, calendar, matrix] = await Promise.all([
    pool.query<QueuedPin>(
      `SELECT ${PIN_SELECT}
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         LEFT JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.urls u   ON u.id = w.url_id
         LEFT JOIN organic.designs d ON d.id = p.design_id
        WHERE w.org_id = $1 AND p.scheduled_date = current_date
          AND p.status <> 'CANCELLED'
        ORDER BY p.scheduled_time NULLS LAST`, [orgId]),

    pool.query<QueuedPin>(
      `SELECT ${PIN_SELECT}
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
         LEFT JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.urls u   ON u.id = w.url_id
         LEFT JOIN organic.designs d ON d.id = p.design_id
        WHERE w.org_id = $1 AND p.status = 'FAILED'
          AND p.scheduled_date > current_date - interval '14 days'
        ORDER BY p.scheduled_date DESC, p.scheduled_time DESC NULLS LAST
        LIMIT 50`, [orgId]),

    // generate_series so days with nothing scheduled appear as gaps rather
    // than vanishing — an empty Tuesday is the point of looking.
    pool.query<{ day: string; planned: number; published: number; failed: number }>(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
              COUNT(p.id) FILTER (WHERE p.status IN ('PLANNED','SCHEDULED'))::int AS planned,
              COUNT(p.id) FILTER (WHERE p.status = 'PUBLISHED')::int              AS published,
              COUNT(p.id) FILTER (WHERE p.status = 'FAILED')::int                 AS failed
         FROM generate_series(current_date - interval '3 days',
                              current_date + interval '13 days',
                              interval '1 day') AS g(day)
         LEFT JOIN organic.pins p ON p.scheduled_date = g.day::date
                                 AND p.status <> 'CANCELLED'
         LEFT JOIN organic.waterfalls w ON w.id = p.waterfall_id AND w.org_id = $1
        WHERE p.id IS NULL OR w.org_id = $1
        GROUP BY g.day ORDER BY g.day`, [orgId]),

    pool.query<DesignBoardCell & { waterfall_id: string; url_name: string | null }>(
      `SELECT w.id::text AS waterfall_id, u.name AS url_name,
              d.design_number, d.intent::text AS intent,
              COALESCE(b.name, '(no board)') AS board_name,
              COUNT(p.id)::int                                        AS pins,
              COUNT(p.id) FILTER (WHERE p.status = 'PUBLISHED')::int  AS published,
              COUNT(p.id) FILTER (WHERE p.status = 'FAILED')::int     AS failed
         FROM organic.waterfalls w
         JOIN organic.pins p     ON p.waterfall_id = w.id AND p.status <> 'CANCELLED'
         JOIN organic.designs d  ON d.id = p.design_id
         LEFT JOIN organic.boards b ON b.id = p.board_id
         LEFT JOIN organic.urls u   ON u.id = w.url_id
        WHERE w.org_id = $1
          AND w.status IN ('PRODUCTION','SCHEDULED','RUNNING')
        GROUP BY w.id, u.name, d.design_number, d.intent, b.name
        ORDER BY u.name, d.design_number, b.name`, [orgId]),
  ]);

  const byWaterfall = new Map<string, { waterfall_id: string; url_name: string | null; cells: DesignBoardCell[] }>();
  for (const r of matrix.rows) {
    const e = byWaterfall.get(r.waterfall_id)
      ?? { waterfall_id: r.waterfall_id, url_name: r.url_name, cells: [] };
    e.cells.push({
      design_number: r.design_number, intent: r.intent, board_name: r.board_name,
      pins: r.pins, published: r.published, failed: r.failed,
    });
    byWaterfall.set(r.waterfall_id, e);
  }

  return {
    today: today.rows,
    failures: failures.rows,
    calendar: calendar.rows,
    matrix: Array.from(byWaterfall.values()),
  };
}

// ---------- TODAY -----------------------------------------------------------

export interface TodayTask {
  task_id: string;
  phase: number;
  step: string;
  name: string;
  status: string;
  task_type: string;
  guidance: string | null;
}

export interface TodayView {
  /** Unblocked work, in SOP order. Blocked tasks are excluded on purpose:
   *  this screen answers "what can I do now", and a list that mixes in
   *  work you cannot start is a list nobody trusts twice. */
  actionable: TodayTask[];
  in_progress: TodayTask[];
  in_review: TodayTask[];
  blocked_count: number;
  /** The store's own next step, for when everything else is clear. */
  next_phase: number | null;
}

export async function loadToday(orgId: string): Promise<TodayView> {
  const pool = organicPool();
  const r = await pool.query<TodayTask>(
    `SELECT ct.task_id, td.phase, td.step, td.name,
            ct.status::text AS status, td.task_type::text AS task_type, td.guidance
       FROM organic.client_tasks ct
       JOIN organic.task_definitions td ON td.id = ct.task_id
      WHERE ct.org_id = $1
        AND td.active
        AND ct.status IN ('TODO','IN_PROGRESS','REVIEW')
        AND (ct.cycle IS NULL OR ct.cycle NOT LIKE 'URL-%')
      ORDER BY td.phase, td.sort_order`,
    [orgId]
  );
  const blocked = await pool.query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM organic.client_tasks ct
       JOIN organic.task_definitions td ON td.id = ct.task_id
      WHERE ct.org_id = $1 AND td.active AND ct.status = 'BLOCKED'`, [orgId]);

  const rows = r.rows;
  const actionable = rows.filter((t) => t.status === "TODO");
  return {
    actionable,
    in_progress: rows.filter((t) => t.status === "IN_PROGRESS"),
    in_review: rows.filter((t) => t.status === "REVIEW"),
    blocked_count: Number(blocked.rows[0]?.n ?? 0),
    next_phase: actionable[0]?.phase ?? null,
  };
}

// ---------- STORE SETTINGS --------------------------------------------------

export interface StoreSettings {
  org_id: string;
  name: string;
  engagement_status: string | null;
  niche: string | null;
  account_class: string | null;
  spacing_hours: number | null;
  daily_pin_target: number | null;
  onboarded_date: string | null;
  domain: string | null;
  display_name: string | null;
  bio: string | null;
  urls_per_month: number | null;
  url_cooldown_days: number | null;
  monthly_retainer: number | null;
  retainer_currency: string | null;
  hourly_cost: number | null;
}

export async function loadStoreSettings(orgId: string): Promise<StoreSettings | null> {
  const pool = organicPool();
  const r = await pool.query<StoreSettings>(
    `SELECT cs.org_id::text, o.name,
            cs.engagement_status::text AS engagement_status,
            cs.niche, cs.account_class::text AS account_class,
            cs.spacing_hours, cs.daily_pin_target,
            cs.onboarded_date::text AS onboarded_date,
            cs.domain, cs.display_name, cs.bio,
            cs.urls_per_month, cs.url_cooldown_days,
            cs.monthly_retainer, cs.retainer_currency, cs.hourly_cost
       FROM organic.client_settings cs
       JOIN public.organizations o ON o.id = cs.org_id
      WHERE cs.org_id = $1`,
    [orgId]
  );
  const row = r.rows[0];
  if (!row) return null;
  // pg returns numeric as string; the form needs numbers.
  return {
    ...row,
    monthly_retainer: row.monthly_retainer == null ? null : Number(row.monthly_retainer),
    hourly_cost: row.hourly_cost == null ? null : Number(row.hourly_cost),
  };
}

/** Only these columns may be written from the settings screen. Anything
 *  else is either derived, owned by the SOP engine, or a foot-gun. */
const SETTABLE = [
  "engagement_status", "niche", "account_class", "spacing_hours",
  "daily_pin_target", "onboarded_date", "domain", "display_name", "bio",
  "urls_per_month", "url_cooldown_days",
  "monthly_retainer", "retainer_currency", "hourly_cost",
] as const;

const ENUM_COLUMN: Record<string, string> = {
  engagement_status: "organic.engagement_status",
  account_class: "organic.account_class",
};

export async function updateStoreSettings(
  orgId: string, patch: Record<string, unknown>
): Promise<StoreSettings | null> {
  const pool = organicPool();

  const sets: string[] = [];
  const values: unknown[] = [orgId];
  for (const col of SETTABLE) {
    if (!(col in patch)) continue;
    const raw = patch[col];
    // "" from an empty input means "clear this", not "set empty string" —
    // and for a numeric or date column an empty string is a cast error.
    const value = raw === "" || raw === undefined ? null : raw;
    values.push(value);
    const cast = ENUM_COLUMN[col] ? `::${ENUM_COLUMN[col]}` : "";
    sets.push(`${col} = $${values.length}${cast}`);
  }
  if (sets.length === 0) return loadStoreSettings(orgId);

  await pool.query(
    `UPDATE organic.client_settings
        SET ${sets.join(", ")}, updated_at = now()
      WHERE org_id = $1`,
    values
  );
  return loadStoreSettings(orgId);
}

// ---------- TASK ANSWERS (per checklist item) -------------------------------

export interface TaskAnswer {
  task_id: string;
  field_key: string;
  answer_bool: boolean | null;
  answer_text: string | null;
  answer_number: number | null;
  evidence: string | null;
  /** The file this specific answer rests on. Per field, not per task — a
   *  task with six checks used to share one attachment between them, which
   *  left the reader with a document and no idea which check it proved. */
  file_url: string | null;
  file_title: string | null;
  answered_at: string;
}

export async function loadTaskAnswers(orgId: string): Promise<TaskAnswer[]> {
  const pool = organicPool();
  const r = await pool.query<TaskAnswer>(
    `SELECT task_id, field_key, answer_bool, answer_text,
            answer_number, evidence, file_url, file_title, answered_at::text
       FROM organic.task_answers
      WHERE org_id = $1`,
    [orgId]
  );
  return r.rows.map((a) => ({
    ...a,
    // pg hands numeric back as a string; the form needs a number.
    answer_number: a.answer_number == null ? null : Number(a.answer_number),
  }));
}

export interface AnswerInput {
  task_id: string;
  field_key: string;
  answer_bool?: boolean | null;
  answer_text?: string | null;
  answer_number?: number | null;
  evidence?: string | null;
  file_url?: string | null;
  file_title?: string | null;
}

export async function saveTaskAnswer(orgId: string, a: AnswerInput): Promise<void> {
  const pool = organicPool();
  // Upsert on the natural key. COALESCE on update so a form that only
  // sends the evidence does not blank the answer it belongs to, and vice
  // versa — the two halves are edited independently in the UI.
  await pool.query(
    `INSERT INTO organic.task_answers
       (org_id, task_id, field_key, answer_bool, answer_text, answer_number,
        evidence, file_url, file_title, answered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (org_id, task_id, field_key) DO UPDATE SET
       answer_bool   = COALESCE(EXCLUDED.answer_bool,   organic.task_answers.answer_bool),
       answer_text   = COALESCE(EXCLUDED.answer_text,   organic.task_answers.answer_text),
       answer_number = COALESCE(EXCLUDED.answer_number, organic.task_answers.answer_number),
       evidence      = COALESCE(EXCLUDED.evidence,      organic.task_answers.evidence),
       file_url      = COALESCE(EXCLUDED.file_url,      organic.task_answers.file_url),
       file_title    = COALESCE(EXCLUDED.file_title,    organic.task_answers.file_title),
       answered_at   = now()`,
    [orgId, a.task_id, a.field_key,
     a.answer_bool ?? null, a.answer_text ?? null,
     a.answer_number ?? null, a.evidence ?? null,
     a.file_url ?? null, a.file_title ?? null]
  );
}

/** Clearing a field has to be explicit, because COALESCE on save means an
 *  omitted value keeps the old one. */
export async function clearTaskAnswerField(
  orgId: string, taskId: string, fieldKey: string,
  part: "answer" | "evidence" | "file" | "all"
): Promise<void> {
  const pool = organicPool();
  const sets =
    part === "evidence" ? "evidence = NULL"
    : part === "file" ? "file_url = NULL, file_title = NULL"
    : part === "answer" ? "answer_bool = NULL, answer_text = NULL, answer_number = NULL"
    : "answer_bool = NULL, answer_text = NULL, answer_number = NULL, evidence = NULL, file_url = NULL, file_title = NULL";
  await pool.query(
    `UPDATE organic.task_answers SET ${sets}, answered_at = now()
      WHERE org_id = $1 AND task_id = $2 AND field_key = $3`,
    [orgId, taskId, fieldKey]
  );
}

// ---------- TREND SERIES (KPI sparklines) -----------------------------------

export interface TrendSeries {
  /** Oldest first, one entry per day over the window. Days with no
   *  measurement are null rather than 0 — a gap in reporting is not a day
   *  of zero clicks, and a sparkline that dips to the floor on missing
   *  data tells the opposite of the truth. */
  days: string[];
  outbound_clicks: Array<number | null>;
  saves: Array<number | null>;
  impressions: Array<number | null>;
  pins_published: Array<number | null>;
  /** Sum over the window and over the window before it, for the delta. */
  totals: { clicks: number | null; saves: number | null; impressions: number | null; pins: number };
  previous: { clicks: number | null; saves: number | null; impressions: number | null; pins: number };
}

export async function loadTrendSeries(orgId: string, windowDays = 30): Promise<TrendSeries> {
  const pool = organicPool();

  const [daily, prev] = await Promise.all([
    pool.query<{ day: string; clicks: string | null; saves: string | null; impressions: string | null; pins: string }>(
      `SELECT to_char(g.day, 'YYYY-MM-DD') AS day,
              SUM(pp.outbound_clicks)      AS clicks,
              SUM(pp.saves)                AS saves,
              SUM(pp.impressions)          AS impressions,
              COUNT(DISTINCT pub.id)       AS pins
         FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') AS g(day)
         LEFT JOIN organic.pin_performance pp ON pp.measured_on = g.day::date
              AND pp.pin_id IN (SELECT p.id FROM organic.pins p
                                  JOIN organic.waterfalls w ON w.id = p.waterfall_id
                                 WHERE w.org_id = $1)
         LEFT JOIN organic.pins pub ON pub.scheduled_date = g.day::date
              AND pub.status = 'PUBLISHED'
              AND pub.waterfall_id IN (SELECT id FROM organic.waterfalls WHERE org_id = $1)
        GROUP BY g.day ORDER BY g.day`,
      [orgId, windowDays]),
    pool.query<{ clicks: string | null; saves: string | null; impressions: string | null; pins: string }>(
      `SELECT SUM(pp.outbound_clicks) AS clicks, SUM(pp.saves) AS saves,
              SUM(pp.impressions) AS impressions,
              (SELECT COUNT(*) FROM organic.pins p
                 JOIN organic.waterfalls w ON w.id = p.waterfall_id
                WHERE w.org_id = $1 AND p.status = 'PUBLISHED'
                  AND p.scheduled_date >  current_date - ($2::int * 2)
                  AND p.scheduled_date <= current_date - $2::int) AS pins
         FROM organic.pin_performance pp
         JOIN organic.pins p ON p.id = pp.pin_id
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1
          AND pp.measured_on >  current_date - ($2::int * 2)
          AND pp.measured_on <= current_date - $2::int`,
      [orgId, windowDays]),
  ]);

  const n = (v: string | null) => (v == null ? null : Number(v));
  const sum = (a: Array<number | null>) =>
    a.some((x) => x !== null) ? a.reduce<number>((t, x) => t + (x ?? 0), 0) : null;

  const clicks = daily.rows.map((r) => n(r.clicks));
  const saves = daily.rows.map((r) => n(r.saves));
  const impressions = daily.rows.map((r) => n(r.impressions));
  const pins = daily.rows.map((r) => Number(r.pins));
  const p = prev.rows[0];

  return {
    days: daily.rows.map((r) => r.day),
    outbound_clicks: clicks, saves, impressions, pins_published: pins,
    totals: {
      clicks: sum(clicks), saves: sum(saves), impressions: sum(impressions),
      pins: pins.reduce<number>((t, x) => t + (x ?? 0), 0),
    },
    previous: {
      clicks: n(p?.clicks ?? null), saves: n(p?.saves ?? null),
      impressions: n(p?.impressions ?? null), pins: Number(p?.pins ?? 0),
    },
  };
}

/** Percentage movement, or null when there is nothing honest to compare. */
export function pctChange(now: number | null, before: number | null): number | null {
  if (now == null || before == null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// ---------- STATUS FOLLOWS THE CHECKLIST ------------------------------------

/**
 * Set a task's status from its own answers.
 *
 * Marking a task done by hand, on a task that has a checklist, is asking
 * someone to state twice what the form already knows. So for those tasks
 * the status is derived: answer every visible question and it is DONE;
 * clear one and it drops back to IN_PROGRESS.
 *
 * Three things this deliberately does not do:
 *
 *   - It never touches a task with no checklist. There is nothing to derive
 *     from, and those keep the manual dropdown.
 *   - It never touches a BLOCKED task. Blocked is computed from
 *     preconditions and answering a question does not clear a precondition.
 *   - It never moves a task to TODO. Once someone has answered anything the
 *     work has started, and TODO would misreport it as untouched.
 *
 * A field counts as answered when it has an answer AND, where the form
 * marks reasoning required, that reasoning is present. Without the second
 * half a task flips to DONE while a row is still visibly flagged red for
 * the missing "why".
 */
export async function syncTaskStatusFromAnswers(
  orgId: string, taskId: string
): Promise<"DONE" | "IN_PROGRESS" | null> {
  const d = await deriveTaskStatusFromAnswers(orgId, taskId);
  if (!d) return null;
  if (d.next === d.current) return d.next;

  await organicPool().query(
    `UPDATE organic.client_tasks
        SET status = $3::organic.task_status,
            completed_at = CASE WHEN $3 = 'DONE' THEN now() ELSE NULL END
      WHERE org_id = $1 AND task_id = $2 AND cycle IS NULL`,
    [orgId, taskId, d.next]
  );
  return d.next;
}

/**
 * What the answers say the status should be, without writing it.
 *
 * Split out of syncTaskStatusFromAnswers so a status can be *inspected*
 * rather than only corrected — scripts/resync-viability-tasks.ts reports a
 * dry run off this, and a rule that changes what "answered" means (a new
 * required field, a new conditional one) can then be checked against the
 * live stores before it is applied to them.
 *
 * Returns null for the cases sync refuses to touch: no checklist, no such
 * task, BLOCKED or SKIPPED.
 */
export async function deriveTaskStatusFromAnswers(
  orgId: string, taskId: string
): Promise<{ current: string; next: "DONE" | "IN_PROGRESS" } | null> {
  const set = fieldsFor(taskId);
  if (!set) return null;

  const pool = organicPool();
  const cur = await pool.query<{ status: string }>(
    `SELECT status::text FROM organic.client_tasks
      WHERE org_id = $1 AND task_id = $2 AND cycle IS NULL`,
    [orgId, taskId]
  );
  const status = cur.rows[0]?.status;
  if (!status || status === "BLOCKED" || status === "SKIPPED") return null;

  const ans = await pool.query<{
    field_key: string; answer_bool: boolean | null;
    answer_text: string | null; answer_number: string | null; evidence: string | null;
  }>(
    `SELECT field_key, answer_bool, answer_text, answer_number, evidence
       FROM organic.task_answers WHERE org_id = $1 AND task_id = $2`,
    [orgId, taskId]
  );
  const byKey = new Map(ans.rows.map((a) => [a.field_key, a]));

  const visible = visibleFields(set, (k) => byKey.get(k)?.answer_bool);
  const answeredThrough = visible.every((f) => {
    const a = byKey.get(f.key);
    if (!a) return false;
    const answered =
      a.answer_bool !== null || a.answer_text !== null || a.answer_number !== null;
    if (!answered) return false;
    if (f.evidenceRequired && !(a.evidence ?? "").trim()) return false;
    return true;
  });

  // Filling in every box is not the same as having done the work. On the
  // audit step "is everything this check found now fixed?" answered `no`
  // holds the task open however completely the rest is written out — see
  // TaskField.holdsCompletionWhenFalse. The manual dropdown still closes
  // it; this only stops the form from closing it on its own.
  const held = completionHolds(set, (k) => byKey.get(k)?.answer_bool).length > 0;

  return { current: status, next: answeredThrough && !held ? "DONE" : "IN_PROGRESS" };
}
