/**
 * Workspace data loaders — one query bundle per tab of the redesigned
 * client workspace. Everything is org-scoped and read-only. Writes still
 * live in phase[1-5].ts.
 */
import { organicPool } from "./db";

// ---------- LEAKS (Overview leak panel) -------------------------------------

export interface Leak {
  kind: string;               // machine-readable category
  label: string;              // one-line human summary
  count: number;              // how many items in this leak
  detail: string[];           // up to 5 examples, human-readable
  fix_href: string;           // deep-link to the tab where it gets fixed
  severity: "high" | "medium" | "low";
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
      severity: "medium",
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
      severity: "high",
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
      severity: "medium",
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
      severity: "medium",
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
      severity: "low",
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
      leaks.push({ kind: "no_token", label: "No Pinterest token connected", count: 1, detail: ["Reconnect Pinterest to enable API writes"], fix_href: `../../integrations`, severity: "high" });
    } else if (t.expires_at) {
      const daysLeft = Math.floor((new Date(t.expires_at).getTime() - Date.now()) / 86_400_000);
      if (daysLeft < 0) {
        leaks.push({ kind: "token_expired", label: "Pinterest token EXPIRED", count: 1, detail: [`Expired ${-daysLeft} days ago on ${t.expires_at.slice(0, 10)}`], fix_href: `../../integrations`, severity: "high" });
      } else if (daysLeft <= 7) {
        leaks.push({ kind: "token_expiring", label: `Pinterest token expires in ${daysLeft} day(s)`, count: 1, detail: [`Expires ${t.expires_at.slice(0, 10)}`], fix_href: `../../integrations`, severity: "high" });
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
      severity: "high",
    });
  }

  return leaks;
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
