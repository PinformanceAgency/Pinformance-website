/**
 * Phase 2 backend — grid analysis, competitors, taste graph, frequency,
 * plus the market-analysis review queue. Kept in one file because the
 * pieces are small and share the same pool/complete plumbing.
 */
import { organicPool } from "./db";
import { completeTaskByDefinition, recomputeAfter } from "./complete";

// ---------- Grid analysis (P2.1.1, P2.1.3, P2.1.4) --------------------------

export interface SeedKeywordsPayload {
  keywords: string[];       // 5–10 broad terms
  time_spent_min: number;
}

export async function saveSeedKeywords(orgId: string, p: SeedKeywordsPayload) {
  const cleaned = Array.from(new Set(p.keywords.map((k) => k.trim()).filter(Boolean)));
  if (cleaned.length < 5 || cleaned.length > 10) {
    throw new Error(`seed keywords must be 5–10 (got ${cleaned.length})`);
  }
  const pool = organicPool();
  // Upsert as broad GENERIC keywords, source=MANUAL.
  for (const term of cleaned) {
    await pool.query(
      `INSERT INTO organic.keywords (id, org_id, term, type, source, volume_validated, client_forbidden, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'GENERIC'::organic.keyword_type, 'MANUAL'::organic.keyword_source, false, false, now())
       ON CONFLICT (org_id, term) DO NOTHING`,
      [orgId, term]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P2.1.1", timeSpentMin: p.time_spent_min,
    notes: `Seed keywords: ${cleaned.join(", ")}` });
  return { keywords: cleaned, recomputed: await recomputeAfter(orgId) };
}

export interface GridRecord {
  target_keyword: string;
  fmt_simple_pins: boolean;
  fmt_infographics: boolean;
  fmt_video_916: boolean;
  fmt_pure_aesthetic: boolean;
  fmt_text_heavy: boolean;
  has_visible_ctas: boolean;
  text_overlay_bucket: "NONE" | "MINIMAL" | "HALF" | "MOST" | "ALL";
  look_and_feel: string;
}

/** P2.1.3 — one grid row per keyword. */
export async function saveGridRecords(orgId: string, records: GridRecord[], timeSpentMin: number) {
  if (records.length === 0) throw new Error("at least one grid record required");
  const pool = organicPool();
  for (const r of records) {
    await pool.query(
      `INSERT INTO organic.grid_analyses (
         id, org_id, target_keyword,
         fmt_simple_pins, fmt_infographics, fmt_video_916, fmt_pure_aesthetic, fmt_text_heavy,
         has_visible_ctas, text_overlay_bucket, look_and_feel, analyzed_at
       ) VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (org_id, target_keyword) DO UPDATE SET
         fmt_simple_pins    = EXCLUDED.fmt_simple_pins,
         fmt_infographics   = EXCLUDED.fmt_infographics,
         fmt_video_916      = EXCLUDED.fmt_video_916,
         fmt_pure_aesthetic = EXCLUDED.fmt_pure_aesthetic,
         fmt_text_heavy     = EXCLUDED.fmt_text_heavy,
         has_visible_ctas   = EXCLUDED.has_visible_ctas,
         text_overlay_bucket= EXCLUDED.text_overlay_bucket,
         look_and_feel      = EXCLUDED.look_and_feel,
         analyzed_at        = now()`,
      [orgId, r.target_keyword, r.fmt_simple_pins, r.fmt_infographics, r.fmt_video_916,
       r.fmt_pure_aesthetic, r.fmt_text_heavy, r.has_visible_ctas, r.text_overlay_bucket, r.look_and_feel]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P2.1.3", timeSpentMin,
    notes: `Grid recorded for ${records.length} keyword(s).` });
  return { count: records.length, recomputed: await recomputeAfter(orgId) };
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
function normHex(h: string): string {
  if (!HEX_RE.test(h)) throw new Error(`invalid hex code: "${h}" (expected 6 hex digits)`);
  return "#" + h.replace(/^#/, "").toLowerCase();
}

export interface HexRecord {
  target_keyword: string;
  hex_1: string;
  hex_2: string;
  hex_3: string;
}

/** P2.1.4 — three dominant hex codes per keyword. */
export async function saveHexes(orgId: string, records: HexRecord[], timeSpentMin: number) {
  if (records.length === 0) throw new Error("at least one hex record required");
  const pool = organicPool();
  for (const r of records) {
    const h1 = normHex(r.hex_1), h2 = normHex(r.hex_2), h3 = normHex(r.hex_3);
    const upd = await pool.query(
      `UPDATE organic.grid_analyses
          SET hex_1=$1, hex_2=$2, hex_3=$3, analyzed_at=now()
        WHERE org_id=$4 AND target_keyword=$5`,
      [h1, h2, h3, orgId, r.target_keyword]
    );
    if (upd.rowCount === 0) {
      // No grid row yet — insert one carrying only the hexes.
      await pool.query(
        `INSERT INTO organic.grid_analyses (id, org_id, target_keyword, hex_1, hex_2, hex_3, analyzed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
         ON CONFLICT (org_id, target_keyword) DO UPDATE SET
           hex_1=EXCLUDED.hex_1, hex_2=EXCLUDED.hex_2, hex_3=EXCLUDED.hex_3, analyzed_at=now()`,
        [orgId, r.target_keyword, h1, h2, h3]
      );
    }
  }
  await completeTaskByDefinition({ orgId, taskId: "P2.1.4", timeSpentMin,
    notes: `Hex colors recorded for ${records.length} keyword(s).` });
  return { count: records.length, recomputed: await recomputeAfter(orgId) };
}

// ---------- Competitors (P2.1.5, P2.1.6, P2.1.7) ----------------------------

export interface CompetitorInput {
  name: string;
  handle?: string;
  profile_url: string;
  niche_fit: "STRONG" | "PARTIAL" | "WEAK";
}

export async function saveCompetitors(orgId: string, list: CompetitorInput[], timeSpentMin: number) {
  if (list.length < 5 || list.length > 10) {
    throw new Error(`competitors must be 5–10 (got ${list.length})`);
  }
  const pool = organicPool();
  for (const c of list) {
    if (!c.profile_url?.trim()) throw new Error("profile_url is required");
    await pool.query(
      `INSERT INTO organic.competitors (id, org_id, profile_url, handle, name, niche_fit, analyzed_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
       ON CONFLICT (org_id, profile_url) DO UPDATE SET
         handle    = EXCLUDED.handle,
         name      = EXCLUDED.name,
         niche_fit = EXCLUDED.niche_fit,
         analyzed_at = now()`,
      [orgId, c.profile_url.trim(), c.handle ?? null, c.name.trim(), c.niche_fit]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P2.1.5", timeSpentMin,
    notes: `Competitors: ${list.map((c) => c.name).join(", ")}` });
  return { count: list.length, recomputed: await recomputeAfter(orgId) };
}

/** P2.1.6 — parse PinInspector-shaped CSV. Column names PinInspector uses
 *  vary; we accept the common ones and fall back to positional order. */
export async function importCompetitorPinsCsv(
  orgId: string,
  competitorProfileUrl: string,
  csv: string,
  timeSpentMin: number
) {
  const pool = organicPool();
  const comp = await pool.query<{ id: string }>(
    `SELECT id::text FROM organic.competitors WHERE org_id=$1 AND profile_url=$2`,
    [orgId, competitorProfileUrl]
  );
  if (comp.rowCount === 0) throw new Error(`competitor not found: ${competitorProfileUrl}`);
  const competitor_id = comp.rows[0].id;

  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV appears empty");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (candidates: string[]): number => {
    for (const c of candidates) {
      const i = header.findIndex((h) => h === c || h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iUrl   = idx(["pin url", "pin_url", "url", "link"]);
  const iTitle = idx(["title"]);
  const iDesc  = idx(["description", "desc"]);
  const iBoard = idx(["board", "board name", "board_name"]);
  const iSaves = idx(["saves", "repins"]);
  const iClicks= idx(["outbound clicks", "outbound_clicks", "clicks"]);
  const iImp   = idx(["impressions", "views"]);

  let inserted = 0;
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.every((c) => !c.trim())) continue;
    await pool.query(
      `INSERT INTO organic.competitor_pins (org_id, competitor_id, pin_url, title, description, board_name, saves, outbound_clicks, impressions, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        orgId, competitor_id,
        iUrl >= 0 ? cols[iUrl] : null,
        iTitle >= 0 ? cols[iTitle] : null,
        iDesc >= 0 ? cols[iDesc] : null,
        iBoard >= 0 ? cols[iBoard] : null,
        iSaves >= 0 ? intOrNull(cols[iSaves]) : null,
        iClicks >= 0 ? intOrNull(cols[iClicks]) : null,
        iImp >= 0 ? intOrNull(cols[iImp]) : null,
        JSON.stringify(Object.fromEntries(header.map((h, i) => [h, cols[i] ?? null]))),
      ]
    );
    inserted++;
  }

  await pool.query(
    `UPDATE organic.competitors SET pin_export_path = $1 WHERE id = $2`,
    [`csv-${inserted}-rows`, competitor_id]
  );
  await completeTaskByDefinition({ orgId, taskId: "P2.1.6", timeSpentMin,
    notes: `Imported ${inserted} pins from ${competitorProfileUrl}` });
  return { imported: inserted, competitor_id, recomputed: await recomputeAfter(orgId) };
}

// ---------- Market analysis (P2.2.1, P2.2.2) --------------------------------

export interface MAItem {
  kind: "STEAL_LIST" | "BOARD_GAP" | "CONTENT_ANGLE";
  title: string;
  detail?: string | null;
}

/** P2.2.1 — assemble prompt, call Claude Haiku, insert items. */
export async function generateMarketAnalysis(orgId: string, timeSpentMin: number) {
  const key = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPHIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set — configure it in the environment first.");

  const pool = organicPool();
  const [intake, taste, grids, competitors] = await Promise.all([
    pool.query(`SELECT * FROM organic.client_intake WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT * FROM organic.taste_graph WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT target_keyword, look_and_feel, hex_1, hex_2, hex_3 FROM organic.grid_analyses WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT name, handle, profile_url, niche_fit FROM organic.competitors WHERE org_id = $1`, [orgId]),
  ]);

  const context = {
    intake: intake.rows[0] ?? null,
    taste_graph: taste.rows[0] ?? null,
    grid_analyses: grids.rows,
    competitors: competitors.rows,
  };

  const prompt = [
    "You are a Pinterest strategist for a media-buying agency.",
    "The client context is below as JSON. Produce a market analysis in STRICT JSON",
    "with exactly three top-level arrays and no other keys:",
    "  steal_list       — board names competitors use that this client should adopt (5–10)",
    "  board_gap        — topics no competitor is covering that fit this client (3–8)",
    "  content_angles   — distinct visual/narrative angles the client should pursue (5–10)",
    "Each item is an object with fields: title (short), detail (one sentence why).",
    "Output valid JSON only, no prose, no code fences.",
    "",
    "CLIENT CONTEXT:",
    JSON.stringify(context, null, 2),
  ].join("\n");

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = resp.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");

  let parsed: { steal_list?: MAItem[]; board_gap?: MAItem[]; content_angles?: MAItem[] };
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`AI returned non-JSON: ${text.slice(0, 200)}`); }

  // Clear old PENDING items so re-runs replace what wasn't reviewed yet.
  await pool.query(
    `DELETE FROM organic.market_analysis_items WHERE org_id = $1 AND status = 'PENDING'`,
    [orgId]
  );

  const buckets: [MAItem[] | undefined, "STEAL_LIST" | "BOARD_GAP" | "CONTENT_ANGLE"][] = [
    [parsed.steal_list, "STEAL_LIST"],
    [parsed.board_gap, "BOARD_GAP"],
    [parsed.content_angles, "CONTENT_ANGLE"],
  ];
  let inserted = 0;
  for (const [items, kind] of buckets) {
    for (const it of items ?? []) {
      if (!it.title) continue;
      await pool.query(
        `INSERT INTO organic.market_analysis_items (org_id, kind, title, detail)
         VALUES ($1,$2,$3,$4)`,
        [orgId, kind, it.title, it.detail ?? null]
      );
      inserted++;
    }
  }

  await completeTaskByDefinition({ orgId, taskId: "P2.2.1", timeSpentMin,
    notes: `AI market analysis generated ${inserted} items.` });
  return { inserted, recomputed: await recomputeAfter(orgId) };
}

export async function reviewMarketItem(
  itemId: string,
  status: "APPROVED" | "REJECTED",
  rejectReason?: string
) {
  if (status === "REJECTED" && !rejectReason?.trim()) {
    throw new Error("reject reason is required to reject an item");
  }
  const pool = organicPool();
  const cur = await pool.query<{ org_id: string; kind: string }>(
    `SELECT org_id::text, kind FROM organic.market_analysis_items WHERE id = $1`,
    [itemId]
  );
  if (cur.rowCount === 0) throw new Error("item not found");
  await pool.query(
    `UPDATE organic.market_analysis_items
        SET status = $1, reject_reason = $2, reviewed_at = now()
      WHERE id = $3`,
    [status, status === "REJECTED" ? rejectReason : null, itemId]
  );
  // Also mirror approved STEAL_LIST / BOARD_GAP into board_opportunities.
  if (status === "APPROVED") {
    const item = await pool.query<{ title: string; kind: string; detail: string | null }>(
      `SELECT title, kind, detail FROM organic.market_analysis_items WHERE id = $1`,
      [itemId]
    );
    const it = item.rows[0];
    if (it && (it.kind === "STEAL_LIST" || it.kind === "BOARD_GAP")) {
      await pool.query(
        `INSERT INTO organic.board_opportunities (id, org_id, board_name, category, source_type, source_note)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [cur.rows[0].org_id, it.title, it.kind, "AI_MARKET_ANALYSIS", it.detail ?? null]
      );
    }
  }
  return { ok: true };
}

/** P2.2.2 — when the operator says "reviewed", we simply mark it done.
 *  All the per-item decisions have already been persisted. */
export async function markReviewComplete(orgId: string, timeSpentMin: number, notes?: string) {
  const counts = await organicPool().query<{ status: string; n: number }>(
    `SELECT status, COUNT(*)::int AS n FROM organic.market_analysis_items
      WHERE org_id = $1 GROUP BY status`, [orgId]
  );
  const summary = counts.rows.map((r) => `${r.n} ${r.status.toLowerCase()}`).join(", ");
  await completeTaskByDefinition({ orgId, taskId: "P2.2.2", timeSpentMin,
    notes: notes ?? `Reviewed market analysis: ${summary}` });
  return { recomputed: await recomputeAfter(orgId) };
}

// ---------- Taste graph (P2.3.1, P2.3.3) ------------------------------------

export interface TasteGraphPayload {
  core_products: string[];
  spaces_context: string[];
  aesthetic_worlds: string[];
  moments_seasons: string[];
  functional_outcome: string[];
  aspirational_outcome: string[];
  related_interests: string[];
  time_spent_min: number;
}

export async function saveTasteGraph(orgId: string, p: TasteGraphPayload) {
  const arr = (a: string[]) => a.map((s) => s.trim()).filter(Boolean);
  const pool = organicPool();
  await pool.query(
    `INSERT INTO organic.taste_graph (
       org_id, core_products, spaces_context, aesthetic_worlds, moments_seasons,
       functional_outcome, aspirational_outcome, related_interests
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (org_id) DO UPDATE SET
       core_products = EXCLUDED.core_products,
       spaces_context = EXCLUDED.spaces_context,
       aesthetic_worlds = EXCLUDED.aesthetic_worlds,
       moments_seasons = EXCLUDED.moments_seasons,
       functional_outcome = EXCLUDED.functional_outcome,
       aspirational_outcome = EXCLUDED.aspirational_outcome,
       related_interests = EXCLUDED.related_interests`,
    [orgId, arr(p.core_products), arr(p.spaces_context), arr(p.aesthetic_worlds),
     arr(p.moments_seasons), arr(p.functional_outcome), arr(p.aspirational_outcome),
     arr(p.related_interests)]
  );
  await completeTaskByDefinition({ orgId, taskId: "P2.3.1", timeSpentMin: p.time_spent_min,
    notes: "Taste graph mapped (7 fields)." });
  return { recomputed: await recomputeAfter(orgId) };
}

export interface AnglesWorldsMoments {
  content_angles: string[]; // exactly 3
  visual_worlds: string[];  // exactly 3
  key_moments: string[];    // exactly 3
  time_spent_min: number;
}

/** P2.3.3 — enforces exactly three of each. */
export async function saveThreeAnglesWorldsMoments(orgId: string, p: AnglesWorldsMoments) {
  const check = (arr: string[], label: string) => {
    const cleaned = arr.map((s) => s.trim()).filter(Boolean);
    if (cleaned.length !== 3) throw new Error(`${label}: exactly 3 required (got ${cleaned.length})`);
    return cleaned;
  };
  const angles = check(p.content_angles, "content_angles");
  const worlds = check(p.visual_worlds,  "visual_worlds");
  const moments = check(p.key_moments,    "key_moments");
  const pool = organicPool();
  // Requires the taste_graph row to already exist (P2.3.1 comes first).
  await pool.query(
    `INSERT INTO organic.taste_graph (org_id, content_angles, visual_worlds, key_moments)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (org_id) DO UPDATE SET
       content_angles = EXCLUDED.content_angles,
       visual_worlds  = EXCLUDED.visual_worlds,
       key_moments    = EXCLUDED.key_moments`,
    [orgId, angles, worlds, moments]
  );
  await completeTaskByDefinition({ orgId, taskId: "P2.3.3", timeSpentMin: p.time_spent_min,
    notes: `3 angles / 3 worlds / 3 moments distilled.` });
  return { recomputed: await recomputeAfter(orgId) };
}

// ---------- Frequency (P2.4.1, P2.4.2) --------------------------------------

export interface VelocityPayload {
  entries: { profile_url: string; pins_per_day: number }[];
  time_spent_min: number;
}

/** P2.4.1 — write 4-month pins/day per competitor. */
export async function saveVelocity(orgId: string, p: VelocityPayload) {
  if (p.entries.length === 0) throw new Error("at least one competitor velocity required");
  const pool = organicPool();
  for (const e of p.entries) {
    if (!(e.pins_per_day >= 0)) throw new Error(`invalid pins_per_day for ${e.profile_url}`);
    await pool.query(
      `UPDATE organic.competitors SET pins_per_day_4mo = $1 WHERE org_id = $2 AND profile_url = $3`,
      [e.pins_per_day, orgId, e.profile_url]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P2.4.1", timeSpentMin: p.time_spent_min,
    notes: `Velocity recorded for ${p.entries.length} competitor(s).` });
  return { recomputed: await recomputeAfter(orgId) };
}

/** P2.4.2 — 16-pin math: 1 URL yields 16 pin variants.
 *  urls_per_month = ceil((pins_per_day × 30) / 16) */
export const PINS_PER_URL = 16;

export function computeUrlsPerMonth(pinsPerDay: number): { urls_per_month: number; explanation: string } {
  const daily = Math.max(0, pinsPerDay);
  const monthly = daily * 30;
  const urls = Math.ceil(monthly / PINS_PER_URL);
  return {
    urls_per_month: urls,
    explanation: `${daily} pins/day × 30 days ÷ ${PINS_PER_URL} pins/URL = ${(monthly / PINS_PER_URL).toFixed(2)} → ceil to ${urls} URLs/month`,
  };
}

export async function persistFrequency(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const cs = await pool.query<{ daily_pin_target: number }>(
    `SELECT daily_pin_target FROM organic.client_settings WHERE org_id = $1`,
    [orgId]
  );
  if (cs.rowCount === 0) throw new Error("client_settings not found");
  const { urls_per_month, explanation } = computeUrlsPerMonth(cs.rows[0].daily_pin_target);
  await pool.query(
    `UPDATE organic.client_settings SET urls_per_month = $1, updated_at = now() WHERE org_id = $2`,
    [urls_per_month, orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P2.4.2", timeSpentMin, notes: explanation });
  return { urls_per_month, explanation, recomputed: await recomputeAfter(orgId) };
}

// ---------- Read helpers ----------------------------------------------------

export async function loadPhase2Snapshot(orgId: string) {
  const pool = organicPool();
  const [keywords, grids, competitors, taste, market, cs] = await Promise.all([
    pool.query(`SELECT term FROM organic.keywords WHERE org_id=$1 ORDER BY term`, [orgId]),
    pool.query(`SELECT target_keyword, fmt_simple_pins, fmt_infographics, fmt_video_916, fmt_pure_aesthetic, fmt_text_heavy, has_visible_ctas, text_overlay_bucket, look_and_feel, hex_1, hex_2, hex_3 FROM organic.grid_analyses WHERE org_id=$1 ORDER BY target_keyword`, [orgId]),
    pool.query(`SELECT id::text, name, handle, profile_url, niche_fit, pins_per_day_4mo, pin_export_path FROM organic.competitors WHERE org_id=$1 ORDER BY name`, [orgId]),
    pool.query(`SELECT * FROM organic.taste_graph WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT id::text, kind, title, detail, status, reject_reason FROM organic.market_analysis_items WHERE org_id=$1 ORDER BY kind, created_at`, [orgId]),
    pool.query(`SELECT daily_pin_target, urls_per_month FROM organic.client_settings WHERE org_id=$1`, [orgId]),
  ]);
  return {
    keywords: keywords.rows.map((r) => r.term as string),
    grid_analyses: grids.rows,
    competitors: competitors.rows,
    taste_graph: taste.rows[0] ?? null,
    market_items: market.rows,
    client_settings: cs.rows[0] ?? null,
  };
}

// ---------- helpers ---------------------------------------------------------

function intOrNull(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = parseInt(String(s).replace(/[^\d-]/g, ""), 10);
  return isFinite(n) ? n : null;
}

/** Small CSV parser that handles quoted fields with commas + escaped quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
      else if (ch === "\r") { /* skip */ }
      else cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}
