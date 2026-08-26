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
import { loadAccountBrief, splitFromGrid, formatNotesFromGrid } from "./brief";
import { adviseBoards, adviseKeywords, adviseUrls, checkBoards, checkKeywords, checkUrlReadiness } from "./structure";
import { generateWithValidator, persistDraft } from "./ai";
import type { Deviation } from "./structure";

/** Stamped on every generated copy set so a regression can be traced to
 *  the model that produced it. */
const MODEL_VERSION = "claude-sonnet-4-5";

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

/**
 * Boards for a URL. Never refuses.
 *
 * This used to throw below five boards. That is the method's rule, not a
 * data constraint, and enforcing it here meant a manager who had a reason —
 * a topic genuinely short of boards, a deliberate small test — could not
 * proceed at all. The rule still exists; it is reported by checkBoards()
 * wherever the assignment is shown, so the deviation is visible without the
 * tool arguing with the person using it.
 */
export async function assignBoardsToUrl(urlId: string, boardIds: string[]): Promise<void> {
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

/**
 * Keywords for a URL. Refuses one thing only.
 *
 * The five-keyword cap is the method's rule and is reported by
 * checkKeywords() rather than enforced here — same reasoning as boards.
 * A primary that is not among the selected keywords is different: that is
 * incoherent rather than unconventional, and it would write a url_keywords
 * set with no primary at all, which the design brief then reads as an empty
 * keyword.
 */
export async function assignKeywordsToUrl(urlId: string, keywordIds: string[], primaryId: string): Promise<void> {
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
  /** What has already worked on this account, from the phase-5
   *  winning_combinations view. Month two designing as if month one never
   *  happened is the difference between a recurring service that improves
   *  and one that repeats. */
  proven: string[];
  save_split_pct: number;   // 80
  click_split_pct: number;  // 20
  format_notes: string;
  /** What the research could not supply, in the designer's own words.
   *  Named rather than silently defaulted — someone who knows there is no
   *  brand book works differently from someone who assumes the palette
   *  below is the brand's. */
  gaps: string[];
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

  // Everything the account knows about itself, in one read. This used to be
  // three separate queries picking four values out of three months of
  // research; see brief.ts for why that shape was the problem rather than
  // the amount.
  const brief = await loadAccountBrief(orgId);
  if (!brief) throw new Error("Org not found");

  // The grid reading for THIS keyword. Falls back to the account's first
  // grid row when the primary keyword was never gridded — a neighbouring
  // keyword in the same niche is a far better guide than a constant, and
  // the basis line says which one it used.
  const findings = brief.grid.value ?? [];
  // Case- and whitespace-insensitive. The grid's target_keyword and the
  // keyword bank's term are typed by different people at different times —
  // "Gold Hoop Earrings" against "gold hoop earrings" is the same research,
  // and an exact match would silently drop it to the 80/20 fallback while
  // reporting that as a considered decision.
  const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
  const key = norm(primary);
  const exact = findings.find((g) => norm(g.keyword) === key) ?? null;
  const finding = exact ?? findings[0] ?? null;

  const split = splitFromGrid(exact);
  const brand = brief.brand.value;
  const taste = brief.taste.value;

  return {
    url: urlRow.rows[0].url,
    url_name: urlRow.rows[0].name,
    primary_keyword: primary,
    long_tail_keywords: longTail.length >= 3 ? longTail : [...longTail, ...Array(3 - longTail.length).fill(primary)],
    overlay_keywords: longTail.slice(0, 5).length > 0 ? longTail.slice(0, 5) : [primary],
    dominant_colors: finding?.colors ?? [],
    brand_colors: brand?.dominant_colors ?? [],
    typography: brand?.typography ?? null,
    tone_descriptors: brand?.tone_descriptors ?? [],
    banned_words: brand?.banned_words ?? [],
    approved_ctas: brand?.approved_ctas ?? [],
    content_angles: taste?.content_angles ?? [],
    visual_worlds: taste?.visual_worlds ?? [],
    key_moments: taste?.key_moments ?? [],
    proven: (brief.proven.value ?? []).slice(0, 6).map(
      (p) => `${p.intent ?? "?"} pin, ${p.route === "AI_GENERATED" ? "AI route" : "direct"}, on "${p.board_name}" — ` +
             `${p.clicks.toLocaleString("en-US")} clicks / ${p.saves.toLocaleString("en-US")} saves`
    ),
    save_split_pct: split.save_split_pct,
    click_split_pct: split.click_split_pct,
    format_notes: formatNotesFromGrid(exact ?? finding, split),
    // What the research could not tell us, named rather than defaulted.
    // A designer reading "no brand book" behaves differently from one who
    // assumes the palette below is the brand's.
    gaps: [brief.grid, brief.brand, brief.taste, brief.market, brief.proven]
      .filter((k) => !k.known)
      .map((k) => (k as { why: string }).why),
    constraints: [
      "Sans-serif fonts only — Pinterest OCR fails on cursive and script.",
      "Keep the top-left and top-right corners clear: Pinterest overlays Save / More buttons there.",
      "No watermarks — the algorithm penalises them.",
      "AI route: apply a 1% transparent frame before export to strip C2PA metadata, and never enable \"Mark as AI-Modified\" in the Pin Builder.",
      "Four visually distinct designs, then three micro-crops each.",
      ...(brand?.never_include ?? []).map((n) => `Brand rule — never include: ${n}`),
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

/**
 * `banned` and `neverInclude` come from the brand book (P1.1.6) via
 * brand_rules. They were collected in phase 1 and then checked by nobody —
 * the validator enforced Pinterest's rules and left the client's own to
 * whoever happened to remember them. A word the client explicitly rejected
 * reaching a published pin is the one copy failure they will actually see.
 */
export interface CopyRules {
  bannedWords?: string[];
  neverInclude?: string[];
}

export function validateCopy(c: CopyDraft, rules: CopyRules = {}): { ok: boolean; errors: string[] } {
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

  // Whole-word matching: a brand that bans "sale" must not trip on
  // "wholesale", and one that bans "cheap" should still catch "Cheap".
  const haystack = `${title} ${desc} ${tagline}`.toLowerCase();
  for (const w of rules.bannedWords ?? []) {
    const t = w.trim().toLowerCase();
    if (t && new RegExp(`\\b${escapeRe(t)}\\b`).test(haystack)) {
      errs.push(`banned word from the brand book: "${w}"`);
    }
  }
  for (const n of rules.neverInclude ?? []) {
    const t = n.trim().toLowerCase();
    if (t && haystack.includes(t)) {
      errs.push(`the brand book says never include: "${n}"`);
    }
  }

  return { ok: errs.length === 0, errors: errs };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/**
 * A cycle task, carrying everything a task card needs.
 *
 * It used to carry six fields, because the cycle panel rendered these as a
 * read-only list of id, name and a status pill. That made the twenty-two
 * tasks the SOP defines for phase 4 unworkable in the dashboard: you could
 * see that P4.2.4 existed and that it was TODO, and nowhere could you read
 * what it asks, what it should hand back, record what you did, attach the
 * designs, or mark it done. Phases 1 to 3 had all of that from the start.
 */
export interface CycleTaskRow {
  client_task_id: string;
  task_id: string;
  phase: number;
  step: string;
  name: string;
  description: string | null;
  task_type: string;
  guidance: string | null;
  expected_output: string | null;
  external_tool: string | null;
  external_url: string | null;
  is_recurring: boolean;
  status: string;
  time_spent_min: number | null;
  skip_reason: string | null;
  skip_note: string | null;
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
  /** Where this cycle's selection departs from the method or from the
   *  account's own research. Never blocks anything — the manager may always
   *  overrule — but an unmarked deviation is indistinguishable from a
   *  mistake by the time anyone reads it back. */
  deviations: Deviation[];
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

  const tasksRes = await pool.query<CycleTaskRow & { cycle: string; id: string }>(
    `SELECT ct.cycle, ct.id::text, ct.task_id, td.phase, td.step, td.name,
            td.description, td.task_type::text, td.guidance, td.expected_output,
            td.external_tool, td.external_url, td.is_recurring,
            ct.status::text, ct.time_spent_min, ct.skip_reason, ct.skip_note,
            ct.notes, td.sort_order
       FROM organic.client_tasks ct JOIN organic.task_definitions td ON td.id = ct.task_id
      WHERE ct.org_id = $1 AND td.active AND ct.cycle = ANY($2)
      ORDER BY td.sort_order`,
    [orgId, cycleKeys]
  );
  const tasksByCycle = new Map<string, CycleTaskRow[]>();
  for (const r of tasksRes.rows) {
    const arr = tasksByCycle.get(r.cycle) ?? [];
    arr.push({
      client_task_id: r.id, task_id: r.task_id, phase: r.phase, step: r.step,
      name: r.name, description: r.description, task_type: r.task_type,
      guidance: r.guidance, expected_output: r.expected_output,
      external_tool: r.external_tool, external_url: r.external_url,
      is_recurring: r.is_recurring, status: r.status,
      time_spent_min: r.time_spent_min, skip_reason: r.skip_reason,
      skip_note: r.skip_note, notes: r.notes, sort_order: r.sort_order,
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

  // One brief for the whole org, then checked per cycle. Loading it per
  // cycle would multiply ten queries by however many URLs are running.
  const brief = await loadAccountBrief(orgId);
  const kwMeta = new Map<string, { volume: number | null; forbidden: boolean }>();
  if (brief) {
    const meta = await pool.query<{ id: string; volume: string | null; client_forbidden: boolean | null }>(
      `SELECT k.id::text, c.volume, k.client_forbidden
         FROM organic.keywords k
         LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1`, [orgId]);
    for (const m of meta.rows) {
      kwMeta.set(m.id, { volume: m.volume == null ? null : Number(m.volume), forbidden: !!m.client_forbidden });
    }
  }
  const boardMeta = new Map<string, { topic_id: string | null; pin_count: number | null; status: string | null }>();
  const readiness = new Map<string, { cooldown_clear: boolean; topic_covered: boolean; assigned_boards: number }>();
  if (brief) {
    const [bm, rd] = await Promise.all([
      pool.query<{ id: string; topic_id: string | null; pin_count: number | null; status: string | null }>(
        `SELECT id::text, topic_id::text, pin_count, status::text FROM organic.boards WHERE org_id = $1`, [orgId]),
      pool.query<{ id: string; cooldown_clear: boolean; topic_covered: boolean; assigned_boards: string }>(
        `SELECT id::text, cooldown_clear, topic_covered, assigned_boards::text
           FROM organic.urls_selectable WHERE org_id = $1`, [orgId]),
    ]);
    for (const b of bm.rows) boardMeta.set(b.id, { topic_id: b.topic_id, pin_count: b.pin_count, status: b.status });
    for (const r of rd.rows) {
      readiness.set(r.id, {
        cooldown_clear: r.cooldown_clear,
        topic_covered: r.topic_covered,
        assigned_boards: Number(r.assigned_boards),
      });
    }
  }

  const out: CycleView[] = [];
  for (const cycleKey of cycleKeys) {
    const shortId = cycleKey.replace(/^URL-/, "");
    const u = urlByShort.get(shortId);
    if (!u) continue; // URL was deleted — skip orphan cycles
    const tasks = tasksByCycle.get(cycleKey) ?? [];
    const done = tasks.filter((t) => t.status === "DONE").length;
    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;

    const cycleBoards = boardsByUrl.get(u.id) ?? [];
    const cycleKws = kwsByUrl.get(u.id) ?? [];
    const deviations = brief
      ? [
          ...checkUrlReadiness(readiness.get(u.id) ?? null, u.name),
          ...checkBoards(
            brief,
            cycleBoards.map((b) => ({
              id: b.board_id, name: b.board_name,
              topic_id: boardMeta.get(b.board_id)?.topic_id ?? null,
              status: boardMeta.get(b.board_id)?.status ?? null,
              pin_count: boardMeta.get(b.board_id)?.pin_count ?? null,
            })),
            u.topic_id
          ),
          ...checkKeywords(
            brief,
            cycleKws.map((k) => ({
              id: k.keyword_id, term: k.term, type: null,
              volume: kwMeta.get(k.keyword_id)?.volume ?? k.volume ?? null,
              client_forbidden: kwMeta.get(k.keyword_id)?.forbidden ?? false,
            })),
            cycleKws.find((k) => k.is_primary)?.keyword_id ?? null
          ),
        ]
      : [];

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
      deviations,
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


// ---------- deviations (the manager may overrule, visibly) -------------------

export interface CycleDeviations {
  boards: Deviation[];
  keywords: Deviation[];
}

/**
 * What about this URL's current selection departs from the method or from
 * this account's research.
 *
 * Computed on read rather than stored at save time, deliberately. A stored
 * warning goes stale the moment a board gets pinned past ten, or a keyword
 * finally gets its volume — and a stale warning is worse than none, because
 * people learn to dismiss the whole panel.
 */
export async function loadCycleDeviations(orgId: string, urlId: string): Promise<CycleDeviations> {
  const pool = organicPool();
  const brief = await loadAccountBrief(orgId);
  if (!brief) return { boards: [], keywords: [] };

  const [urlRow, boards, kws] = await Promise.all([
    pool.query<{ topic_id: string | null }>(
      `SELECT topic_id::text FROM organic.urls WHERE id = $1 AND org_id = $2`, [urlId, orgId]),
    pool.query(
      `SELECT b.id::text, b.name, b.topic_id::text, b.status::text, b.pin_count
         FROM organic.url_boards ub JOIN organic.boards b ON b.id = ub.board_id
        WHERE ub.url_id = $1 ORDER BY ub.position`, [urlId]),
    pool.query(
      `SELECT k.id::text, k.term, k.type::text, k.client_forbidden, uk.is_primary,
              c.volume
         FROM organic.url_keywords uk
         JOIN organic.keywords k ON k.id = uk.keyword_id
         LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE uk.url_id = $1`, [urlId]),
  ]);

  const topicId = urlRow.rows[0]?.topic_id ?? null;
  const chosenBoards = boards.rows.map((b) => ({
    id: b.id, name: b.name, topic_id: b.topic_id, status: b.status, pin_count: b.pin_count,
  }));
  const chosenKws = kws.rows.map((k) => ({
    id: k.id, term: k.term, type: k.type,
    volume: k.volume == null ? null : Number(k.volume),
    client_forbidden: k.client_forbidden,
  }));
  const primaryId = kws.rows.find((k) => k.is_primary)?.id ?? null;

  return {
    boards: checkBoards(brief, chosenBoards, topicId),
    keywords: checkKeywords(brief, chosenKws, primaryId),
  };
}

/** The ranked suggestions for a URL, with the reason for each. */
export async function loadCycleAdvice(orgId: string, urlId: string) {
  const pool = organicPool();
  const brief = await loadAccountBrief(orgId);
  if (!brief) return null;

  const [urlRow, boards, kws] = await Promise.all([
    pool.query<{ topic_id: string | null }>(
      `SELECT topic_id::text FROM organic.urls WHERE id = $1 AND org_id = $2`, [urlId, orgId]),
    pool.query(
      `SELECT id::text, name, topic_id::text, status::text, pin_count
         FROM organic.boards WHERE org_id = $1`, [orgId]),
    pool.query(
      `SELECT k.id::text, k.term, k.type::text, k.client_forbidden, c.volume
         FROM organic.keywords k
         LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1`, [orgId]),
  ]);

  return {
    boards: adviseBoards(
      brief,
      boards.rows.map((b) => ({ id: b.id, name: b.name, topic_id: b.topic_id, status: b.status, pin_count: b.pin_count })),
      urlRow.rows[0]?.topic_id ?? null
    ),
    keywords: adviseKeywords(
      brief,
      kws.rows.map((k) => ({
        id: k.id, term: k.term, type: k.type,
        volume: k.volume == null ? null : Number(k.volume),
        client_forbidden: k.client_forbidden,
      }))
    ),
  };
}

// ---------- P4.2.8 copy + P4.2.4 image prompts ------------------------------
//
// Both were the same hole: the waterfall created four copy_sets rows with a
// primary keyword and nothing else, and the AI route had no prompt at all.
// Three months of research decided which URL and which boards, and then the
// thing the client actually sees — the words on the pin and the picture —
// was written from scratch by whoever was free, with the brand book open in
// another tab if they remembered.
//
// Both now read the account brief. Nothing here publishes: a draft is
// written, a human approves it. That is what AI_DRAFT means in the SOP and
// it is the right shape — the model is good at holding forty constraints at
// once and bad at knowing which of them the client stopped caring about.

interface DesignContext {
  design_id: string;
  design_number: number;
  intent: string;
  route: string;
  text_overlay_keyword: string | null;
  url_id: string;
  org_id: string;
}

async function designContext(orgId: string, designId: string): Promise<DesignContext> {
  const r = await organicPool().query<DesignContext>(
    `SELECT d.id::text AS design_id, d.design_number, d.intent::text AS intent,
            d.route::text AS route, d.text_overlay_keyword,
            w.url_id::text AS url_id, w.org_id::text AS org_id
       FROM organic.designs d
       JOIN organic.waterfalls w ON w.id = d.waterfall_id
      WHERE d.id = $1 AND w.org_id = $2`,
    [designId, orgId]
  );
  if (r.rowCount === 0) throw new Error("Design not found for this org");
  return r.rows[0];
}

const COPY_SYSTEM = `You write Pinterest pin copy for a media buying agency.

You return ONLY a JSON object, no preamble and no code fence:
{"tagline": "...", "title": "...", "description": "..."}

Hard rules, all enforced by a validator that will reject you:
- title: at most 100 characters, and it must OPEN with the primary keyword.
- description: between 250 and 300 characters. Not 249, not 301.
- tagline: 4 to 9 words, must contain the primary keyword or a close variant.
  This is the text overlay on the image, so it has to work as a hook on its own.
- No exclamation marks anywhere. No hashtags. No em-dashes or en-dashes.
- Never use a banned word or a never-include item from the brand book.

Write in the brand's tone. Pinterest is a search engine before it is a
social network: the description is read by the algorithm as much as by a
person, so it should carry the long-tail terms naturally rather than
stuffing them.`;

/** P4.2.8 — copy for one design, drafted from the account's own research. */
export async function generateCopyForDesign(orgId: string, designId: string) {
  const ctx = await designContext(orgId, designId);
  const [brief, account] = await Promise.all([
    generateDesignBrief(orgId, ctx.url_id),
    loadAccountBrief(orgId),
  ]);
  if (!account) throw new Error("Org not found");

  const rules: CopyRules = {
    bannedWords: account.brand.value?.banned_words ?? [],
    neverInclude: account.brand.value?.never_include ?? [],
  };

  const intentLine = ctx.intent === "CLICK"
    ? "This is a CLICK pin: 9:16, text overlay, a CTA. The tagline is the hook people read before they decide to tap."
    : "This is a SAVE pin: 2:3 lifestyle, no text on the image. The tagline is still needed for the overlay variant, but the copy should read as inspiration rather than a pitch.";

  const user = [
    `Brand: ${account.name}${account.niche ? ` — ${account.niche}` : ""}`,
    account.brand.value?.positioning ? `Positioning: ${account.brand.value.positioning}` : null,
    account.intake.value?.brand_personality ? `Personality: ${account.intake.value.brand_personality}` : null,
    account.intake.value?.ideal_audience ? `Audience: ${account.intake.value.ideal_audience}` : null,
    "",
    `Landing page: ${brief.url_name} (${brief.url})`,
    `Primary keyword: ${brief.primary_keyword}`,
    `Long-tail to work in naturally: ${brief.long_tail_keywords.join(", ")}`,
    "",
    intentLine,
    `Design ${ctx.design_number} of 4.`,
    ctx.text_overlay_keyword ? `Overlay hook chosen for this design: ${ctx.text_overlay_keyword}` : null,
    "",
    brief.tone_descriptors.length ? `Tone: ${brief.tone_descriptors.join(", ")}` : null,
    brief.approved_ctas.length ? `Approved CTAs (use one verbatim on a CLICK pin): ${brief.approved_ctas.join(" / ")}` : null,
    rules.bannedWords?.length ? `Banned words: ${rules.bannedWords.join(", ")}` : null,
    rules.neverInclude?.length ? `Never include: ${rules.neverInclude.join(", ")}` : null,
    "",
    brief.content_angles.length ? `Content angles for this brand: ${brief.content_angles.join(" / ")}` : null,
    brief.key_moments.length ? `Key moments: ${brief.key_moments.join(" / ")}` : null,
    "",
    `What page one rewards here: ${brief.format_notes}`,
    brief.proven.length ? `What has already worked on this account:\n${brief.proven.map((p) => `  - ${p}`).join("\n")}` : null,
    brief.gaps.length ? `\nResearch gaps you are working around:\n${brief.gaps.map((g) => `  - ${g}`).join("\n")}` : null,
  ].filter((l) => l !== null).join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(
    COPY_SYSTEM,
    user,
    (raw) => {
      const parsed = parseCopyJson(raw, brief.primary_keyword);
      if ("error" in parsed) return { ok: false, errors: [parsed.error] };
      return validateCopy(parsed.copy, rules);
    },
    900
  );

  const parsed = parseCopyJson(text, brief.primary_keyword);
  if ("error" in parsed) throw new Error(parsed.error);
  const copy = parsed.copy;

  // Upsert, not update. The waterfall generator creates a copy_sets row per
  // design, but a design can also arrive from an import or a re-run where
  // that row was never made — and an UPDATE matching nothing returned
  // ok:true while the copy went nowhere. A generation that silently
  // persists nothing is the worst of both: the cost of the call, none of
  // the result, and no way to tell from the response.
  const written = await organicPool().query(
    `INSERT INTO organic.copy_sets
       (id, design_id, tagline, title, description, primary_keyword,
        secondary_keywords, validator_status, validator_errors,
        human_qc_status, prompt_version, model_version, generated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::text[],
             'PASS'::organic.validator_status, '{}'::jsonb,
             'PENDING'::organic.qc_status, 'copy-v1', $7, now())
     ON CONFLICT (design_id) DO UPDATE SET
       tagline = EXCLUDED.tagline,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       secondary_keywords = EXCLUDED.secondary_keywords,
       validator_status = EXCLUDED.validator_status,
       validator_errors = EXCLUDED.validator_errors,
       -- A regenerated copy set has not been reviewed, whatever the old row
       -- said. Carrying APPROVED across would let new text inherit approval
       -- nobody gave it.
       human_qc_status = 'PENDING'::organic.qc_status,
       human_qc_by = NULL,
       human_qc_reason = NULL,
       prompt_version = EXCLUDED.prompt_version,
       model_version = EXCLUDED.model_version,
       generated_at = now()
     RETURNING id::text`,
    [designId, copy.tagline ?? null, copy.title, copy.description,
     brief.primary_keyword, brief.long_tail_keywords, MODEL_VERSION]
  );
  if (written.rowCount === 0) throw new Error("copy set was not written");
  await persistDraft(orgId, "PIN_COPY", designId, text);

  return { copy, attempts, failed_attempts };
}

/** Tolerant of a fenced or chatty response — the validator loop needs the
 *  reason, not a thrown parse error that reads as an API failure. */
function parseCopyJson(raw: string, primaryKeyword: string):
  { copy: CopyDraft } | { error: string } {
  const body = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return { error: "response was not a JSON object" };
  try {
    const o = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.description !== "string") {
      return { error: "JSON must carry string 'title' and 'description'" };
    }
    return {
      copy: {
        title: o.title,
        description: o.description,
        tagline: typeof o.tagline === "string" ? o.tagline : undefined,
        primary_keyword: primaryKeyword,
      },
    };
  } catch {
    return { error: "response was not valid JSON" };
  }
}

const IMAGE_SYSTEM = `You write image prompts for Pinterest pins.

Return ONE paragraph, 40 to 80 words, no preamble and no quotes. It has to
be usable verbatim in an image model or handed to a designer as a shot
brief, so describe subject, setting, light, composition and palette — not
mood words on their own.

Non-negotiable, because Pinterest penalises the alternatives:
- No text, no words, no lettering, no logos and no watermarks in the image.
- Leave the top-left and top-right corners uncluttered; Pinterest overlays
  its own buttons there.
- Photographic realism unless the brand's visual world says otherwise.`;

/** P4.2.4, AI route — the image prompt for one design. */
export async function generateImagePromptForDesign(orgId: string, designId: string) {
  const ctx = await designContext(orgId, designId);
  const [brief, account] = await Promise.all([
    generateDesignBrief(orgId, ctx.url_id),
    loadAccountBrief(orgId),
  ]);
  if (!account) throw new Error("Org not found");

  const ratio = ctx.intent === "CLICK" ? "9:16 vertical" : "2:3 vertical";
  const palette = [...brief.dominant_colors, ...brief.brand_colors].slice(0, 5);

  const user = [
    `Brand: ${account.name}${account.niche ? ` — ${account.niche}` : ""}`,
    account.intake.value?.products_services ? `Products: ${account.intake.value.products_services}` : null,
    `Landing page: ${brief.url_name}`,
    `Primary keyword: ${brief.primary_keyword}`,
    "",
    `Format: ${ratio}. ${ctx.intent === "CLICK" ? "Leave clear space for a text overlay." : "No overlay — the image carries it alone."}`,
    `Design ${ctx.design_number} of 4, and the four must be visually distinct from each other.`,
    "",
    brief.visual_worlds.length ? `Visual worlds for this brand (pick the one that fits this URL): ${brief.visual_worlds.join(" / ")}` : null,
    brief.key_moments.length ? `Key moments: ${brief.key_moments.join(" / ")}` : null,
    palette.length ? `Palette to sit inside: ${palette.join(", ")}` : null,
    brief.tone_descriptors.length ? `Tone: ${brief.tone_descriptors.join(", ")}` : null,
    "",
    `What page one looks like for this keyword: ${brief.format_notes}`,
    brief.gaps.length ? `\nResearch gaps you are working around:\n${brief.gaps.map((g) => `  - ${g}`).join("\n")}` : null,
  ].filter((l) => l !== null).join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(
    IMAGE_SYSTEM,
    user,
    validateImagePrompt,
    500
  );
  const draftId = await persistDraft(orgId, "IMAGE_PROMPT", designId, text);
  return { prompt: text, draft_id: draftId, attempts, failed_attempts };
}

/**
 * The two things that actually get a pin suppressed, checked rather than
 * hoped for: baked-in text, and a watermark. Everything else about an image
 * prompt is taste, and taste is what the human approval step is for.
 */
export function validateImagePrompt(text: string): { ok: boolean; errors: string[] } {
  const errs: string[] = [];
  const t = text.trim();
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words < 30) errs.push(`prompt is ${words} words, too thin to brief from (aim 40-80)`);
  if (words > 110) errs.push(`prompt is ${words} words, over the 80-word target`);
  if (/\b(watermark|logo|lettering|caption|subtitle)\b/i.test(t) && !/\bno\s+(watermark|logo|lettering)/i.test(t)) {
    errs.push("prompt asks for a watermark, logo or lettering — Pinterest penalises all three");
  }
  if (/^["']|["']$/.test(t)) errs.push("prompt is wrapped in quotes");
  return { ok: errs.length === 0, errors: errs };
}

// ---------- what is stopping a cycle from starting --------------------------

export interface CycleReadiness {
  total_urls: number;
  eligible: number;
  running: number;
  /** Ranked, best first, with the research reason. Empty when none qualify. */
  ready: Array<{ url_id: string; name: string; why: string }>;
  /** Why the rest cannot start, grouped by cause, worst first. */
  blockers: Array<{ count: number; what: string; fix: string; href: string; examples: string[] }>;
}

/**
 * Phase 4 opens on a store with no cycle far more often than not, and until
 * now it said "0 URLs eligible" in grey and left it there. That is the one
 * moment the manager most needs telling what to do, and the page answered
 * with a number.
 *
 * The blockers are the same three conditions organic.urls_selectable
 * computes — cooldown, topic coverage, boards assigned — turned back into
 * the actions that clear them. Ordered by how many URLs each is holding up,
 * because fixing the one blocking nine URLs beats fixing the one blocking
 * one.
 */
export async function loadCycleReadiness(orgId: string): Promise<CycleReadiness> {
  const pool = organicPool();
  const [rows, running, brief] = await Promise.all([
    pool.query<{
      id: string; name: string; topic_name: string | null;
      cooldown_clear: boolean; topic_covered: boolean;
      assigned_boards: string; is_selectable: boolean; cooldown_until: string | null;
    }>(
      `SELECT u.id::text, u.name, t.name AS topic_name,
              u.cooldown_clear, u.topic_covered, u.assigned_boards::text,
              u.is_selectable, u.cooldown_until::text
         FROM organic.urls_selectable u
         LEFT JOIN organic.topics t ON t.id = u.topic_id
        WHERE u.org_id = $1
        ORDER BY u.name`, [orgId]),
    pool.query<{ n: string }>(
      `SELECT COUNT(DISTINCT cycle)::text AS n FROM organic.client_tasks
        WHERE org_id = $1 AND cycle LIKE 'URL-%'`, [orgId]),
    loadAccountBrief(orgId),
  ]);

  const all = rows.rows;
  const inCycle = new Set(
    (await pool.query<{ short: string }>(
      `SELECT DISTINCT replace(cycle, 'URL-', '') AS short
         FROM organic.client_tasks WHERE org_id = $1 AND cycle LIKE 'URL-%'`, [orgId]
    )).rows.map((r) => r.short)
  );

  const free = all.filter((u) => !inCycle.has(u.id.slice(0, 8)));
  const eligible = free.filter((u) => u.is_selectable);

  // Rank the ones that can start by the same research the cycle would use,
  // so the first suggestion is the one the account's own history points at.
  const advice = brief
    ? adviseUrls(brief, eligible.map((u) => ({
        id: u.id, name: u.name, funnel_stage: null, is_seasonal: null, reason: null,
      })))
    : null;
  const ready = (advice?.suggested ?? eligible.map((u) => ({ id: u.id, name: u.name })))
    .slice(0, 3)
    .map((u, i) => ({
      url_id: u.id, name: u.name,
      why: advice?.reasons[i] ?? "out of cooldown and fully assigned",
    }));

  const blockers: CycleReadiness["blockers"] = [];
  const push = (list: typeof all, what: string, fix: string, href: string) => {
    if (list.length === 0) return;
    blockers.push({
      count: list.length, what, fix, href,
      examples: list.slice(0, 4).map((u) => u.name),
    });
  };

  if (all.length === 0) {
    blockers.push({
      count: 0,
      what: "There are no URLs on this store yet",
      fix: "Add the pages worth pinning to — collections, guides, strong product pages.",
      href: "urls", examples: [],
    });
  } else {
    // Reported independently: a URL can be short on both, and telling
    // somebody to fix coverage when boards are also missing sends them back
    // twice.
    const noCoverage = free.filter((u) => !u.topic_covered);
    const fewBoards = free.filter((u) => Number(u.assigned_boards) < 5);
    const cooling = free.filter((u) => !u.cooldown_clear);
    push(noCoverage,
      `topic has fewer than five boards`,
      "Build boards for that topic. Coverage gates phase 4 for everything under it (P3.3.2).",
      "boards");
    push(fewBoards,
      `fewer than five boards assigned`,
      "Open the URL and assign at least five semantically relevant boards (P4.1.7).",
      "urls");
    push(cooling,
      `still inside cooldown`,
      "Nothing to do — they come back on their own. The date is on the URL.",
      "urls");
  }
  blockers.sort((a, b) => b.count - a.count);

  return {
    total_urls: all.length,
    eligible: eligible.length,
    running: Number(running.rows[0]?.n ?? 0),
    ready,
    blockers,
  };
}
