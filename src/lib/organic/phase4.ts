/**
 * Phase 4 — the recurring pin engine.
 *
 * One cycle = one URL going through phases 4.1 → 4.4. Because Phase 4
 * tasks are is_recurring=true they are NOT seeded during activate; a
 * cycle is spawned here per URL with a cycle key so client_progress and
 * the recompute treat each URL's phase-4 chain independently.
 *
 * The waterfall math (deliberately verbatim in code so it's provable):
 *   • 16 pins per URL = 4 designs × 4 crops (copy variants A/B/C/D)
 *   • Sequence 1..16 is interleaved by design:
 *       s=1 → D1/A, s=2 → D2/A, s=3 → D3/A, s=4 → D4/A,
 *       s=5 → D1/B, s=6 → D2/B, ...             s=16 → D4/D
 *     → design_index = (s-1) % 4
 *     → copy_index   = (s-1) / 4
 *   • Board rotation with offset (SOP):
 *       D1 → boards[0,1,2,3]
 *       D2 → boards[1,2,3,0]
 *       D3 → boards[2,3,0,1]
 *       D4 → boards[3,0,1,2]
 *     → board_pos = (design_index + copy_index) % 4
 *     Each board receives 4 pins, one from each of the 4 designs.
 *   • Schedule dates: 1 pin per (spacing_hours/24) days, starting at
 *     start_date. Consecutive-day for ESTABLISHED (24h), every 2 days
 *     for NEW (48h).
 *   • Same-design interval: 4 pins × (spacing/24) = 4 days ESTABLISHED,
 *     8 days NEW — matches the SOP directly.
 *
 * DB triggers enforce:
 *   check_pin_spacing        — no two pins for the same URL within
 *                              spacing_hours/24 days of each other.
 *   check_daily_volume       — daily count ≤ client_settings.daily_pin_target
 *   check_board_url_history  — 180-day cooldown BETWEEN waterfalls
 *                              (migration 048 excludes same-waterfall pins)
 *   set_url_cooldown         — 60-day URL cooldown after waterfall
 *                              status=COMPLETED
 */
import type { PoolClient } from "pg";
import { organicPool } from "./db";
import { completeTaskByDefinition, recomputeAfter } from "./complete";

const PHASE_4_TASK_IDS = [
  "P4.1.1","P4.1.2","P4.1.3","P4.1.4","P4.1.5","P4.1.6","P4.1.7","P4.1.8",
  "P4.2.1","P4.2.2","P4.2.3","P4.2.4","P4.2.5","P4.2.6","P4.2.7","P4.2.8","P4.2.9","P4.2.10",
  "P4.3.1","P4.3.2",
  "P4.4.1","P4.4.2",
];

const VALID_REASONS = ["SEASONAL","NEW","BEST_PERFORMER","CLIENT_REQUEST","STOCK_PUSH","AB_TEST"] as const;
type UrlReason = typeof VALID_REASONS[number];

// ---------- cycle bootstrap -------------------------------------------------

/** Seed a fresh phase-4 cycle for one URL. Cycle key is the url_id short-hash
 *  so client_tasks can carry many URLs' cycles in parallel. */
export async function startCycleForUrl(orgId: string, urlId: string) {
  const cycle = `URL-${urlId.slice(0, 8)}`;
  const pool = organicPool();
  for (const task_id of PHASE_4_TASK_IDS) {
    await pool.query(
      `INSERT INTO organic.client_tasks (org_id, task_id, cycle, status)
       VALUES ($1, $2, $3, 'BLOCKED'::organic.task_status)
       ON CONFLICT (org_id, task_id, cycle) DO NOTHING`,
      [orgId, task_id, cycle]
    );
  }
  await recomputeAfter(orgId);
  return { cycle, seeded: PHASE_4_TASK_IDS.length };
}

// ---------- URL candidate pool + selection ----------------------------------

/** P4.1.1 — candidate URLs, already filtered by the urls_selectable view
 *  (cooldown + topic coverage + ≥5 boards). Ranking implements two of the
 *  spec's data flows:
 *
 *    P1.2.14 top pins  → P4.1.1   month-1 quick wins lead the list
 *    P5.2 winners      → P4.1.1   later cycles lead with proven URLs
 *
 *  Rank order: proven winners (measured outbound clicks + saves) first,
 *  then BEST_PERFORMER-flagged URLs from the phase-1 audit, then the rest
 *  newest-first. Everything carries the signal that put it there so the
 *  manager sees WHY a URL is at the top. */
export async function candidateUrls(orgId: string) {
  const pool = organicPool();
  const r = await pool.query(
    `WITH perf AS (
       SELECT w.url_id,
              COALESCE(SUM(pp.outbound_clicks), 0)::int AS clicks,
              COALESCE(SUM(pp.saves), 0)::int           AS saves
         FROM organic.pin_performance pp
         JOIN organic.pins p       ON p.id = pp.pin_id
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.org_id = $1
        GROUP BY w.url_id
     )
     SELECT u.*,
            COALESCE(perf.clicks, 0)                    AS proven_clicks,
            COALESCE(perf.saves, 0)                     AS proven_saves,
            (COALESCE(perf.clicks, 0) + COALESCE(perf.saves, 0)) AS proven_score,
            CASE
              WHEN COALESCE(perf.clicks, 0) + COALESCE(perf.saves, 0) > 0
                THEN 'PROVEN_WINNER'
              WHEN u.reason = 'BEST_PERFORMER'::organic.url_reason
                THEN 'PHASE1_TOP_PIN'
              WHEN u.reason = 'NEW'::organic.url_reason
                THEN 'NEW_URL'
              ELSE NULL
            END AS lead_signal
       FROM organic.urls_selectable u
       LEFT JOIN perf ON perf.url_id = u.id
      WHERE u.org_id = $1
      ORDER BY
        (COALESCE(perf.clicks, 0) + COALESCE(perf.saves, 0)) DESC,
        (u.reason = 'BEST_PERFORMER'::organic.url_reason) DESC,
        u.created_at DESC`,
    [orgId]
  );
  return r.rows;
}

/** Seasonal candidates: URLs whose peak_window_start falls 8–12 weeks out. */
export async function seasonalCandidates(orgId: string) {
  const pool = organicPool();
  const r = await pool.query(
    `SELECT * FROM organic.urls
      WHERE org_id = $1 AND is_seasonal = true
        AND peak_window_start IS NOT NULL
        AND peak_window_start BETWEEN current_date + interval '8 weeks'
                                  AND current_date + interval '12 weeks'
      ORDER BY peak_window_start`,
    [orgId]
  );
  return r.rows;
}

export interface UrlInput {
  url: string;
  name: string;
  type: "PRODUCT" | "COLLECTION" | "BLOG" | "GALLERY" | "SELECTION";
  reason: UrlReason;
  reason_note?: string;
  is_seasonal?: boolean;
  peak_window_start?: string | null;
  peak_window_end?: string | null;
  topic_id?: string | null;
  funnel_stage?: "TOP" | "MIDDLE" | "BOTTOM" | null;
}

export async function upsertUrl(orgId: string, u: UrlInput): Promise<string> {
  if (!VALID_REASONS.includes(u.reason)) {
    throw new Error(`reason must be one of ${VALID_REASONS.join(", ")}`);
  }
  // Reject shorteners + strip utm_* params (Pinterest attaches its own
  // attribution — client-side utm pollutes the source-of-truth).
  const clean = sanitiseUrl(u.url);
  u = { ...u, url: clean.cleaned };
  const pool = organicPool();
  const r = await pool.query<{ id: string }>(
    `INSERT INTO organic.urls (
       id, org_id, url, name, type, reason, reason_note,
       is_seasonal, peak_window_start, peak_window_end, topic_id, funnel_stage, created_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3, $4::organic.url_type, $5::organic.url_reason, $6,
       COALESCE($7, false), $8::date, $9::date, $10::uuid, $11::organic.funnel_stage, now()
     )
     ON CONFLICT (org_id, url) DO UPDATE SET
       name = EXCLUDED.name,
       type = EXCLUDED.type,
       reason = EXCLUDED.reason,
       reason_note = EXCLUDED.reason_note,
       is_seasonal = EXCLUDED.is_seasonal,
       peak_window_start = EXCLUDED.peak_window_start,
       peak_window_end = EXCLUDED.peak_window_end,
       topic_id = EXCLUDED.topic_id,
       funnel_stage = EXCLUDED.funnel_stage
     RETURNING id::text`,
    [orgId, u.url, u.name, u.type, u.reason, u.reason_note ?? null,
     u.is_seasonal ?? false, u.peak_window_start ?? null, u.peak_window_end ?? null,
     u.topic_id ?? null, u.funnel_stage ?? null]
  );
  return r.rows[0].id;
}

export async function assignBoardsToUrl(urlId: string, boardIds: string[]): Promise<void> {
  if (boardIds.length < 5) throw new Error(`at least 5 boards required (got ${boardIds.length})`);
  const pool = organicPool();
  // Wipe + re-insert so re-runs replace the mapping.
  await pool.query(`DELETE FROM organic.url_boards WHERE url_id = $1`, [urlId]);
  for (let i = 0; i < boardIds.length; i++) {
    await pool.query(
      `INSERT INTO organic.url_boards (url_id, board_id, position) VALUES ($1, $2, $3)`,
      [urlId, boardIds[i], i]
    );
  }
}

export async function assignKeywordsToUrl(urlId: string, keywordIds: string[], primaryId: string): Promise<void> {
  if (keywordIds.length > 5) throw new Error(`max 5 keywords per URL (got ${keywordIds.length})`);
  if (!keywordIds.includes(primaryId)) throw new Error(`primary keyword id must be in keywordIds`);
  const pool = organicPool();
  await pool.query(`DELETE FROM organic.url_keywords WHERE url_id = $1`, [urlId]);
  for (const kid of keywordIds) {
    await pool.query(
      `INSERT INTO organic.url_keywords (url_id, keyword_id, is_primary) VALUES ($1, $2, $3)`,
      [urlId, kid, kid === primaryId]
    );
  }
}

// ---------- design brief ----------------------------------------------------

export interface DesignBrief {
  url: string;
  url_name: string;
  primary_keyword: string;
  long_tail_keywords: string[];
  /** Overlay hook keywords — the long-tail terms picked in P4.1.8. */
  overlay_keywords: string[];
  /** Hex codes from the P2.1.4 grid analysis for this keyword. */
  dominant_colors: string[];
  /** Brand colours + typography from the P1.1.6 brand book. */
  brand_colors: string[];
  typography: string | null;
  tone_descriptors: string[];
  banned_words: string[];
  approved_ctas: string[];
  /** Three angles / worlds / moments from P2.3.3. */
  content_angles: string[];
  visual_worlds: string[];
  key_moments: string[];
  save_split_pct: number;   // 80
  click_split_pct: number;  // 20
  format_notes: string;
  /** Non-negotiable design constraints, spelled out for the designer. */
  constraints: string[];
}

/** P4.2.3 — assemble a brief from the DB for the design/copy stages. */
export async function generateDesignBrief(orgId: string, urlId: string): Promise<DesignBrief> {
  const pool = organicPool();
  const urlRow = await pool.query(
    `SELECT url, name FROM organic.urls WHERE id = $1 AND org_id = $2`, [urlId, orgId]
  );
  if (urlRow.rowCount === 0) throw new Error("URL not found for this org");

  const kws = await pool.query<{ term: string; is_primary: boolean }>(
    `SELECT k.term, uk.is_primary
       FROM organic.url_keywords uk
       JOIN organic.keywords k ON k.id = uk.keyword_id
      WHERE uk.url_id = $1
      ORDER BY uk.is_primary DESC`, [urlId]
  );
  const primary = kws.rows.find((r) => r.is_primary)?.term ?? "";
  const longTail = kws.rows.filter((r) => !r.is_primary).map((r) => r.term).slice(0, 5);

  // P2.1.4 dominant colours → design brief. The single most-requested
  // cross-phase value per the spec's data-flow map.
  const colorsRow = await pool.query<{ hex_1: string | null; hex_2: string | null; hex_3: string | null }>(
    `SELECT hex_1, hex_2, hex_3 FROM organic.grid_analyses
      WHERE org_id = $1 AND target_keyword = $2 LIMIT 1`,
    [orgId, primary]
  );
  const colors = colorsRow.rows[0]
    ? [colorsRow.rows[0].hex_1, colorsRow.rows[0].hex_2, colorsRow.rows[0].hex_3].filter(Boolean) as string[]
    : [];

  // P1.1.6 brand book → design brief, and P2.3.3 angles/worlds/moments →
  // design brief. Both are spec data-flows; without them the designer has
  // to look the values up by hand, which is exactly what the spec forbids.
  const [brandRow, tasteRow] = await Promise.all([
    pool.query<{
      dominant_colors: string[] | null; tone_descriptors: string[] | null;
      banned_words: string[] | null; approved_ctas: string[] | null;
      asset_locations: Record<string, unknown> | null;
    }>(
      `SELECT dominant_colors, tone_descriptors, banned_words, approved_ctas, asset_locations
         FROM organic.brand_rules WHERE org_id = $1`, [orgId]
    ),
    pool.query<{ content_angles: string[] | null; visual_worlds: string[] | null; key_moments: string[] | null }>(
      `SELECT content_angles, visual_worlds, key_moments
         FROM organic.taste_graph WHERE org_id = $1`, [orgId]
    ),
  ]);
  const brand = brandRow.rows[0];
  const taste = tasteRow.rows[0];
  const typography = (brand?.asset_locations as { typography?: string } | null)?.typography ?? null;

  const overlay = longTail.slice(0, 5);

  return {
    url: urlRow.rows[0].url,
    url_name: urlRow.rows[0].name,
    primary_keyword: primary,
    long_tail_keywords: longTail.length >= 3 ? longTail : [...longTail, ...Array(3 - longTail.length).fill(primary)],
    overlay_keywords: overlay.length > 0 ? overlay : [primary],
    dominant_colors: colors,
    brand_colors: brand?.dominant_colors ?? [],
    typography,
    tone_descriptors: brand?.tone_descriptors ?? [],
    banned_words: brand?.banned_words ?? [],
    approved_ctas: brand?.approved_ctas ?? [],
    content_angles: taste?.content_angles ?? [],
    visual_worlds: taste?.visual_worlds ?? [],
    key_moments: taste?.key_moments ?? [],
    save_split_pct: 80,
    click_split_pct: 20,
    format_notes: "80% save pins (2:3 lifestyle, no text). 20% click pins (9:16 with keyword-front text + CTA).",
    constraints: [
      "Sans-serif fonts only — Pinterest OCR fails on cursive and script.",
      "Keep the top-left and top-right corners clear: Pinterest overlays Save / More buttons there.",
      "No watermarks — the algorithm penalises them.",
      "AI route: apply a 1% transparent frame before export to strip C2PA metadata, and never enable \"Mark as AI-Modified\" in the Pin Builder.",
      "Four visually distinct designs, then three micro-crops each.",
    ],
  };
}

// ---------- copy validators (P4.2.9) ----------------------------------------

export interface CopyDraft {
  title: string;
  description: string;
  primary_keyword: string;
  /** SEO-generated tagline that goes to the designer as text overlay
   *  hook. 4–9 words (max 12), must contain primary keyword or a close
   *  variant, no exclamation marks. Kept close in intent to the title. */
  tagline?: string;
}

const EM_DASH = /—/;
const EN_DASH = /–/;

/** Simple stem match — the tagline may say "modern living rooms" while
 *  the primary keyword is "modern living room". Match if any stem overlaps. */
function containsKeywordOrVariant(text: string, kw: string): boolean {
  if (!kw) return true;
  const t = text.toLowerCase();
  if (t.includes(kw)) return true;
  // Split into words and check that ≥ ceil(kw_words × 0.7) stems appear.
  const kwWords = kw.split(/\s+/).filter(Boolean);
  const hits = kwWords.filter((w) => {
    const stem = w.replace(/(ies|es|s)$/i, "").slice(0, 4);
    return stem.length >= 3 && t.includes(stem);
  }).length;
  return hits >= Math.ceil(kwWords.length * 0.7);
}

export function validateCopy(c: CopyDraft): { ok: boolean; errors: string[] } {
  const errs: string[] = [];
  const title = c.title.trim();
  const desc = c.description.trim();
  const tagline = (c.tagline ?? "").trim();
  const kw = c.primary_keyword.trim().toLowerCase();

  if (title.length > 100) errs.push(`title > 100 chars (${title.length})`);
  if (title.length === 0) errs.push("title is empty");
  else if (kw && !title.toLowerCase().slice(0, Math.max(kw.length + 20, 30)).includes(kw))
    errs.push(`title must start with primary keyword "${kw}"`);
  if (/[!]/.test(title) || /[!]/.test(desc)) errs.push("no exclamation marks");
  if (/#/.test(title) || /#/.test(desc)) errs.push("no hashtags");
  if (EM_DASH.test(title) || EM_DASH.test(desc) || EN_DASH.test(title) || EN_DASH.test(desc))
    errs.push("no em-dash / en-dash");
  if (desc.length < 250 || desc.length > 300) errs.push(`description must be 250–300 chars (got ${desc.length})`);

  // Tagline is optional at the API level but validated when present. If
  // your workflow requires it, wrap validateCopy with a "tagline required"
  // caller check.
  if (tagline) {
    const words = tagline.split(/\s+/).filter(Boolean).length;
    if (words < 4 || words > 12) errs.push(`tagline must be 4–12 words (got ${words})`);
    if (words > 9) errs.push(`tagline should be 4–9 words (${words} exceeds the soft ceiling of 9; hard max 12)`);
    if (/[!]/.test(tagline)) errs.push("tagline: no exclamation marks");
    if (kw && !containsKeywordOrVariant(tagline, kw))
      errs.push(`tagline must contain the primary keyword "${kw}" or a close variant`);
  }

  return { ok: errs.length === 0, errors: errs };
}

// ---------- URL sanitisation (deviation 6) ----------------------------------

const URL_SHORTENERS = new Set([
  "bit.ly","tinyurl.com","t.co","ow.ly","buff.ly","goo.gl","is.gd","tiny.cc",
  "shorturl.at","rebrand.ly","cutt.ly","rb.gy","s.id","lnkd.in","fb.me",
]);

/** Returns { cleaned, warning } — throws on shortened hostnames, silently
 *  strips utm_* params. Pinterest attaches its own attribution so utm from
 *  the client always pollutes the source-of-truth. */
export function sanitiseUrl(raw: string): { cleaned: string; stripped_params: string[] } {
  const trimmed = (raw ?? "").trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("url must start with http(s)://");
  let u: URL;
  try { u = new URL(trimmed); } catch { throw new Error(`invalid URL: ${raw}`); }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (URL_SHORTENERS.has(host)) {
    throw new Error(`URL shorteners are not accepted (host: ${host}). Use the destination URL directly so Pinterest can attribute correctly.`);
  }
  const stripped: string[] = [];
  const keep = new URLSearchParams();
  u.searchParams.forEach((v, k) => {
    if (/^utm_/i.test(k)) { stripped.push(k); return; }
    keep.append(k, v);
  });
  u.search = keep.toString();
  return { cleaned: u.toString(), stripped_params: stripped };
}

// ---------- waterfall engine (P4.3.1) ---------------------------------------

export interface WaterfallReport {
  waterfall_id: string;
  design_ids: string[];
  copy_set_ids: string[];
  pin_ids: string[];
  matrix: string[][];              // 4x4 board matrix (rows=designs, cols=copies A/B/C/D)
  pin_schedule: { seq: number; design: number; copy: string; board_index: number; date: string }[];
  interval_days_between_same_design: number;
  spacing_hours: number;
}

/** Full waterfall: 4 designs, 4 copy sets, 16 pins with rotation. */
export async function generateWaterfall(
  orgId: string,
  urlId: string,
  startDateISO: string
): Promise<WaterfallReport> {
  const pool = organicPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 0. Setup — read spacing + boards + primary keyword.
    const cs = await client.query<{ spacing_hours: number }>(
      `SELECT spacing_hours FROM organic.client_settings WHERE org_id = $1`, [orgId]
    );
    if (cs.rowCount === 0) throw new Error("client_settings missing");
    const spacingHours = cs.rows[0].spacing_hours;
    const spacingDays = Math.max(1, Math.round(spacingHours / 24));

    const boardsRes = await client.query<{ board_id: string; position: number }>(
      `SELECT board_id::text, position FROM organic.url_boards WHERE url_id = $1 ORDER BY position`,
      [urlId]
    );
    if ((boardsRes.rowCount ?? 0) < 4) throw new Error(`need ≥4 boards assigned to URL (got ${boardsRes.rowCount})`);
    const boards = boardsRes.rows.map((r) => r.board_id).slice(0, 4);

    const kwRes = await client.query<{ term: string }>(
      `SELECT k.term FROM organic.url_keywords uk JOIN organic.keywords k ON k.id = uk.keyword_id
        WHERE uk.url_id = $1 AND uk.is_primary = true LIMIT 1`, [urlId]
    );
    const primaryKeyword = kwRes.rows[0]?.term ?? "";

    // 1. Waterfall row
    const wf = await client.query<{ id: string }>(
      `INSERT INTO organic.waterfalls (id, org_id, url_id, status, start_date, spacing_hours)
       VALUES (gen_random_uuid(), $1, $2, 'PLANNING'::organic.waterfall_status, $3::date, $4)
       RETURNING id::text`,
      [orgId, urlId, startDateISO, spacingHours]
    );
    const waterfallId = wf.rows[0].id;

    // 2. 4 designs — 80/20 save/click split → D1/D2/D3 = SAVE, D4 = CLICK.
    const designIds: string[] = [];
    for (let d = 0; d < 4; d++) {
      const intent = d < 3 ? "SAVE" : "CLICK";
      const route = "DIRECT"; // operator picks in real flow
      const filename = fileNameFor(primaryKeyword, d + 1);
      const dr = await client.query<{ id: string }>(
        `INSERT INTO organic.designs (
           id, waterfall_id, design_number, intent, route, filename, text_overlay_keyword,
           fresh_technique, qc_status, created_at
         ) VALUES (
           gen_random_uuid(), $1, $2, $3::organic.pin_intent, $4::organic.design_route, $5, $6,
           NULL, 'PENDING'::organic.qc_status, now()
         ) RETURNING id::text`,
        [waterfallId, d + 1, intent, route, filename, d === 3 ? primaryKeyword : null]
      );
      designIds.push(dr.rows[0].id);
    }

    // 3. 4 copy_sets, one per design. All 4 crops of a design share this text.
    const copySetIds: string[] = [];
    for (let d = 0; d < 4; d++) {
      const cs = await client.query<{ id: string }>(
        `INSERT INTO organic.copy_sets (
           id, design_id, primary_keyword, secondary_keywords,
           validator_status, validator_errors, human_qc_status, generated_at
         ) VALUES (
           gen_random_uuid(), $1, $2, ARRAY[]::text[],
           'PENDING'::organic.validator_status, '{}'::jsonb, 'PENDING'::organic.qc_status, now()
         ) RETURNING id::text`,
        [designIds[d], primaryKeyword]
      );
      copySetIds.push(cs.rows[0].id);
    }

    // 4. 16 pins — the actual rotation.
    const pinIds: string[] = [];
    const schedule: WaterfallReport["pin_schedule"] = [];
    const matrix: string[][] = [[],[],[],[]];
    const VARIANTS = ["A","B","C","D"];
    for (let s = 1; s <= 16; s++) {
      const designIndex = (s - 1) % 4;
      const copyIndex   = Math.floor((s - 1) / 4);
      const boardPos    = (designIndex + copyIndex) % 4;
      const dayOffset   = (s - 1) * spacingDays;
      const scheduled = addDaysISO(startDateISO, dayOffset);
      const variant = VARIANTS[copyIndex];

      const p = await client.query<{ id: string }>(
        `INSERT INTO organic.pins (
           id, waterfall_id, design_id, copy_set_id, board_id, sequence_number, copy_variant,
           scheduled_date, status
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6::bpchar,
           $7::date, 'PLANNED'::organic.pin_status
         ) RETURNING id::text`,
        [waterfallId, designIds[designIndex], copySetIds[designIndex], boards[boardPos], s, variant, scheduled]
      );
      pinIds.push(p.rows[0].id);
      matrix[designIndex][copyIndex] = boards[boardPos];
      schedule.push({ seq: s, design: designIndex + 1, copy: variant, board_index: boardPos, date: scheduled });
    }

    await client.query("COMMIT");

    return {
      waterfall_id: waterfallId,
      design_ids: designIds,
      copy_set_ids: copySetIds,
      pin_ids: pinIds,
      matrix,
      pin_schedule: schedule,
      interval_days_between_same_design: 4 * spacingDays,
      spacing_hours: spacingHours,
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------- schedule preview (P4.3.2 approval, P4.4.1 push) -----------------

export async function loadWaterfallSchedule(waterfallId: string) {
  const pool = organicPool();
  const pins = await pool.query(
    `SELECT p.sequence_number, p.copy_variant, p.scheduled_date::text AS scheduled_date,
            d.design_number, b.name AS board_name
       FROM organic.pins p
       JOIN organic.designs d ON d.id = p.design_id
       JOIN organic.boards b  ON b.id = p.board_id
      WHERE p.waterfall_id = $1
      ORDER BY p.sequence_number`,
    [waterfallId]
  );
  return pins.rows;
}

/** Simulated schedule push — the real Pinterest push lives with the pin
 *  scheduler and reuses the existing post-pins cron. */
export async function pushWaterfallToPinterest(
  waterfallId: string,
  opts: { dryRun?: boolean } = {}
) {
  if (opts.dryRun) return { queued: 0, mode: "dry-run" as const };
  // TODO: hand off to the existing post-pins cron path. Skeleton for now.
  return { queued: 0, mode: "handoff-todo" as const };
}

// ---------- helpers ---------------------------------------------------------

function addDaysISO(startISO: string, days: number): string {
  const [y, m, d] = startISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** SOP file name rule: lowercase, hyphens, keyword included. */
export function fileNameFor(primaryKeyword: string, designNumber: number): string {
  const slug = primaryKeyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "pin"}-d${designNumber}.jpg`;
}

// ---------- convenience wrappers for the task-completion side ---------------

export async function completePhase4Task(
  orgId: string,
  taskId: string,
  cycle: string,
  timeSpentMin: number,
  notes?: string,
  db?: PoolClient
) {
  const runner = db ?? organicPool();
  await runner.query(
    `UPDATE organic.client_tasks
        SET status='DONE'::organic.task_status,
            completed_at=now(),
            started_at=COALESCE(started_at, now()),
            time_spent_min=$1,
            notes=COALESCE($2, notes)
      WHERE org_id=$3 AND task_id=$4 AND cycle=$5`,
    [timeSpentMin, notes ?? null, orgId, taskId, cycle]
  );
}

export async function completeCycleTask(orgId: string, cycle: string, taskId: string, timeSpentMin: number, notes?: string) {
  await completePhase4Task(orgId, taskId, cycle, timeSpentMin, notes);
  // fall back to the definition-level helper if the cycle-scoped update
  // didn't hit — used when a task exists without cycle (edge case).
  if (!cycle) await completeTaskByDefinition({ orgId, taskId, timeSpentMin, notes });
  return recomputeAfter(orgId);
}

export async function loadPhase4Snapshot(orgId: string) {
  const pool = organicPool();
  const [selectable, waterfalls] = await Promise.all([
    pool.query(`SELECT id::text, url, name, reason::text, is_seasonal, cooldown_clear, topic_covered, assigned_boards, is_selectable
                  FROM organic.urls_selectable WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT id::text, url_id::text, status::text, start_date::text, end_date::text
                  FROM organic.waterfalls WHERE org_id = $1 ORDER BY created_at DESC`, [orgId]),
  ]);
  return { selectable_urls: selectable.rows, waterfalls: waterfalls.rows };
}

// ---------- cycle loader for the UI -----------------------------------------

export interface CycleTaskRow {
  client_task_id: string;
  task_id: string;
  step: string;
  name: string;
  task_type: string;
  guidance: string | null;
  status: string;
  time_spent_min: number | null;
  notes: string | null;
  sort_order: number;
}
export interface CycleView {
  cycle: string;
  url_id: string;
  url: string;
  url_name: string;
  reason: string;
  reason_note: string | null;
  is_seasonal: boolean;
  peak_window_start: string | null;
  peak_window_end: string | null;
  topic_id: string | null;
  topic_name: string | null;
  funnel_stage: string | null;
  assigned_boards: Array<{ board_id: string; board_name: string; position: number }>;
  assigned_keywords: Array<{ keyword_id: string; term: string; is_primary: boolean; volume: number | null }>;
  waterfall: { id: string; status: string; start_date: string; end_date: string | null; spacing_hours: number } | null;
  tasks: CycleTaskRow[];
  progress: { total: number; done: number; blocked: number; pct: number };
}

/** Returns every URL-scoped Phase 4 cycle for this org, hydrated with the
 *  URL info, assigned boards, keywords, current waterfall and all 22 tasks. */
export async function loadCyclesForOrg(orgId: string): Promise<CycleView[]> {
  const pool = organicPool();

  const cyclesRes = await pool.query<{ cycle: string }>(
    `SELECT DISTINCT cycle FROM organic.client_tasks
      WHERE org_id = $1 AND cycle IS NOT NULL AND cycle LIKE 'URL-%'`,
    [orgId]
  );
  if (cyclesRes.rowCount === 0) return [];

  const cycleKeys = cyclesRes.rows.map((r) => r.cycle);
  const urlShortIds = cycleKeys.map((c) => c.replace(/^URL-/, ""));

  // Match cycle-key short id (first 8 chars of url_id) → url row.
  const urlsRes = await pool.query<{ id: string; url: string; name: string; reason: string; reason_note: string | null; is_seasonal: boolean; peak_window_start: string | null; peak_window_end: string | null; topic_id: string | null; topic_name: string | null; funnel_stage: string | null }>(
    `SELECT u.id::text, u.url, u.name, u.reason::text AS reason, u.reason_note,
            u.is_seasonal, u.peak_window_start::text, u.peak_window_end::text,
            u.topic_id::text, t.name AS topic_name, u.funnel_stage::text
       FROM organic.urls u
       LEFT JOIN organic.topics t ON t.id = u.topic_id
      WHERE u.org_id = $1 AND left(u.id::text, 8) = ANY($2)`,
    [orgId, urlShortIds]
  );
  const urlByShort = new Map(urlsRes.rows.map((u) => [u.id.slice(0, 8), u]));

  const boardsRes = await pool.query<{ url_id: string; board_id: string; board_name: string; position: number }>(
    `SELECT ub.url_id::text, ub.board_id::text, b.name AS board_name, ub.position
       FROM organic.url_boards ub JOIN organic.boards b ON b.id = ub.board_id
      WHERE ub.url_id IN (SELECT id FROM organic.urls WHERE org_id = $1)
      ORDER BY ub.position`,
    [orgId]
  );
  const kwRes = await pool.query<{ url_id: string; keyword_id: string; term: string; is_primary: boolean; volume: number | null }>(
    `SELECT uk.url_id::text, uk.keyword_id::text, k.term, uk.is_primary, c.volume
       FROM organic.url_keywords uk
       JOIN organic.keywords k ON k.id = uk.keyword_id
       LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
      WHERE uk.url_id IN (SELECT id FROM organic.urls WHERE org_id = $1)`,
    [orgId]
  );
  const wfRes = await pool.query<{ id: string; url_id: string; status: string; start_date: string; end_date: string | null; spacing_hours: number }>(
    `SELECT id::text, url_id::text, status::text, start_date::text, end_date::text, spacing_hours
       FROM organic.waterfalls WHERE org_id = $1
      ORDER BY created_at DESC`,
    [orgId]
  );
  const wfLatestByUrl = new Map<string, { id: string; status: string; start_date: string; end_date: string | null; spacing_hours: number }>();
  for (const w of wfRes.rows) if (!wfLatestByUrl.has(w.url_id)) wfLatestByUrl.set(w.url_id, { id: w.id, status: w.status, start_date: w.start_date, end_date: w.end_date, spacing_hours: w.spacing_hours });

  const tasksRes = await pool.query<{ cycle: string; id: string; task_id: string; step: string; name: string; task_type: string; guidance: string | null; status: string; time_spent_min: number | null; notes: string | null; sort_order: number }>(
    `SELECT ct.cycle, ct.id::text, ct.task_id, td.step, td.name, td.task_type::text,
            td.guidance, ct.status::text, ct.time_spent_min, ct.notes, td.sort_order
       FROM organic.client_tasks ct JOIN organic.task_definitions td ON td.id = ct.task_id
      WHERE ct.org_id = $1 AND td.active AND ct.cycle = ANY($2)
      ORDER BY td.sort_order`,
    [orgId, cycleKeys]
  );
  const tasksByCycle = new Map<string, CycleTaskRow[]>();
  for (const r of tasksRes.rows) {
    const arr = tasksByCycle.get(r.cycle) ?? [];
    arr.push({
      client_task_id: r.id, task_id: r.task_id, step: r.step, name: r.name,
      task_type: r.task_type, guidance: r.guidance, status: r.status,
      time_spent_min: r.time_spent_min, notes: r.notes, sort_order: r.sort_order,
    });
    tasksByCycle.set(r.cycle, arr);
  }

  const boardsByUrl = new Map<string, Array<{ board_id: string; board_name: string; position: number }>>();
  for (const b of boardsRes.rows) {
    const arr = boardsByUrl.get(b.url_id) ?? [];
    arr.push({ board_id: b.board_id, board_name: b.board_name, position: b.position });
    boardsByUrl.set(b.url_id, arr);
  }
  const kwsByUrl = new Map<string, Array<{ keyword_id: string; term: string; is_primary: boolean; volume: number | null }>>();
  for (const k of kwRes.rows) {
    const arr = kwsByUrl.get(k.url_id) ?? [];
    arr.push({ keyword_id: k.keyword_id, term: k.term, is_primary: k.is_primary, volume: k.volume });
    kwsByUrl.set(k.url_id, arr);
  }

  const out: CycleView[] = [];
  for (const cycleKey of cycleKeys) {
    const shortId = cycleKey.replace(/^URL-/, "");
    const u = urlByShort.get(shortId);
    if (!u) continue; // URL was deleted — skip orphan cycles
    const tasks = tasksByCycle.get(cycleKey) ?? [];
    const done = tasks.filter((t) => t.status === "DONE").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;
    out.push({
      cycle: cycleKey,
      url_id: u.id,
      url: u.url,
      url_name: u.name,
      reason: u.reason,
      reason_note: u.reason_note,
      is_seasonal: u.is_seasonal,
      peak_window_start: u.peak_window_start,
      peak_window_end: u.peak_window_end,
      topic_id: u.topic_id,
      topic_name: u.topic_name,
      funnel_stage: u.funnel_stage,
      assigned_boards: boardsByUrl.get(u.id) ?? [],
      assigned_keywords: kwsByUrl.get(u.id) ?? [],
      waterfall: wfLatestByUrl.get(u.id) ?? null,
      tasks,
      progress: {
        total: tasks.length,
        done,
        blocked,
        pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
      },
    });
  }
  return out;
}

/** Boards this org has available to assign to a URL — for the board picker. */
export async function loadOrgBoards(orgId: string) {
  const pool = organicPool();
  const r = await pool.query<{ id: string; name: string; status: string; topic_name: string | null }>(
    `SELECT b.id::text, b.name, b.status::text, t.name AS topic_name
       FROM organic.boards b
       LEFT JOIN organic.topics t ON t.id = b.topic_id
      WHERE b.org_id = $1
      ORDER BY t.name NULLS LAST, b.name`,
    [orgId]
  );
  return r.rows;
}

/** Volume-cached keywords for this org — for the keyword picker. */
export async function loadOrgKeywordsWithVolume(orgId: string) {
  const pool = organicPool();
  const r = await pool.query<{ id: string; term: string; volume: number | null; type: string }>(
    `SELECT k.id::text, k.term, c.volume, k.type::text
       FROM organic.keywords k
       LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
      WHERE k.org_id = $1 AND (c.volume IS NOT NULL OR k.volume_validated = true)
      ORDER BY COALESCE(c.volume, 0) DESC, k.term`,
    [orgId]
  );
  return r.rows;
}

/** Grid-analysis presence check for the "P4.2.1 grid gate before design". */
export async function hasGridAnalysisForKeyword(orgId: string, keyword: string): Promise<boolean> {
  const pool = organicPool();
  const r = await pool.query(
    `SELECT 1 FROM organic.grid_analyses WHERE org_id = $1 AND target_keyword = $2 LIMIT 1`,
    [orgId, keyword]
  );
  return (r.rowCount ?? 0) > 0;
}
