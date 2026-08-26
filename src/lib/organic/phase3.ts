/**
 * Phase 3 backend — keyword harvest, shared volume cache, classification,
 * Pinterest profile and board architecture.
 *
 * The design principle for volume: keyword_volume_cache has no org_id.
 * Volume is a property of the term, not the client, so a lookup done for
 * one advertiser saves the same lookup for the next 39. Every phase-3
 * flow deduplicates candidates against this shared cache and reports the
 * hit count back — the number that justifies the whole mechanism.
 */
import { organicPool } from "./db";
import { completeTaskByDefinition, recomputeAfter } from "./complete";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { generateWithValidator, persistDraft, approveDraft, latestDraft } from "./ai";

// ---------- helpers ---------------------------------------------------------

const CACHE_STALE_DAYS = 180;

function normalizeTerm(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- harvesting (P3.1.1–P3.1.5) --------------------------------------

/** Insert candidates into organic.keywords with a specific source.
 *  All candidates start as GENERIC/type (we'll re-classify later). */
export async function addCandidates(
  orgId: string,
  entries: { term: string; source: string; autocomplete_rank?: number }[]
): Promise<{ inserted: number; deduped: number; total: number }> {
  const pool = organicPool();
  let inserted = 0, deduped = 0;
  for (const e of entries) {
    const term = normalizeTerm(e.term);
    if (!term) continue;
    const r = await pool.query(
      `INSERT INTO organic.keywords (id, org_id, term, type, source, volume_validated, client_forbidden, autocomplete_rank, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'GENERIC'::organic.keyword_type, $3::organic.keyword_source, false, false, $4, now())
       ON CONFLICT (org_id, term) DO UPDATE SET
         autocomplete_rank = COALESCE(EXCLUDED.autocomplete_rank, organic.keywords.autocomplete_rank)
       RETURNING (xmax = 0) AS was_insert`,
      [orgId, term, e.source, e.autocomplete_rank ?? null]
    );
    if (r.rows[0]?.was_insert) inserted++; else deduped++;
  }
  return { inserted, deduped, total: inserted + deduped };
}

/** P3.1.1 record search-bar suggestions, preserving order as autocomplete_rank. */
export async function saveSearchBarSuggestions(
  orgId: string, seedTerm: string, suggestions: string[], timeSpentMin: number
) {
  const entries = suggestions.map((s, i) => ({ term: s, source: "SEARCH_BAR", autocomplete_rank: i + 1 }));
  const r = await addCandidates(orgId, entries);
  await completeTaskByDefinition({ orgId, taskId: "P3.1.1", timeSpentMin,
    notes: `Seed "${seedTerm}" → ${r.inserted} new, ${r.deduped} dupes.` });
  return { ...r, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.2 bubbles + related searches — no rank, just terms. */
export async function saveBubbles(orgId: string, terms: string[], timeSpentMin: number) {
  const r = await addCandidates(orgId, terms.map((t) => ({ term: t, source: "SEARCH_BAR" })));
  await completeTaskByDefinition({ orgId, taskId: "P3.1.2", timeSpentMin,
    notes: `Bubbles + related → ${r.inserted} new, ${r.deduped} dupes.` });
  return { ...r, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.3 pick terms from the 3,437-row Pinterest interest taxonomy. */
export async function searchInterests(query: string, limit = 20) {
  const pool = organicPool();
  const r = await pool.query<{ interest_id: string; name: string; crumb: string; depth: number }>(
    `SELECT interest_id, name, crumb, depth
       FROM organic.pinterest_interests
      WHERE name ILIKE '%' || $1 || '%' OR crumb ILIKE '%' || $1 || '%'
      ORDER BY depth ASC, name ASC LIMIT $2`,
    [query, limit]
  );
  return r.rows;
}

export async function saveInterestPicks(orgId: string, terms: string[], timeSpentMin: number) {
  // MANUAL, not ANNOTATION — the ANNOTATION source is reserved for terms
  // pulled from competitor annotation lists that still need volume proof
  // (the DB CHECK constraint annotation_needs_validation enforces this).
  const r = await addCandidates(orgId, terms.map((t) => ({ term: t, source: "MANUAL" })));
  await completeTaskByDefinition({ orgId, taskId: "P3.1.3", timeSpentMin,
    notes: `Interest-taxonomy picks → ${r.inserted} new, ${r.deduped} dupes.` });
  return { ...r, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.4 AUTO: mine competitor_pins.description for annotation-style phrases. */
export async function harvestCompetitorAnnotations(orgId: string, timeSpentMin = 1) {
  const pool = organicPool();
  const r = await pool.query<{ description: string }>(
    `SELECT description FROM organic.competitor_pins
      WHERE org_id = $1 AND description IS NOT NULL`,
    [orgId]
  );
  // Very small annotation extractor: split on common separators, keep short
  // 2–4 word phrases. Real SOP wants operator-picked from PinInspector, this
  // is a "surface the candidates" first pass.
  const counts = new Map<string, number>();
  for (const row of r.rows) {
    const parts = row.description.split(/[,;|·•\n]+|\s{2,}|\s-\s/);
    for (const raw of parts) {
      const t = normalizeTerm(raw);
      if (!t) continue;
      const wc = t.split(/\s+/).length;
      if (wc < 2 || wc > 4) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const candidates = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)      // seen at least twice — reduces noise
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    // COMPETITOR source, not ANNOTATION — the pool needs volume proof
    // before we promote to ANNOTATION (see the annotation_needs_validation
    // CHECK constraint on organic.keywords).
    .map(([term]) => ({ term, source: "COMPETITOR" }));

  const added = await addCandidates(orgId, candidates);
  await completeTaskByDefinition({ orgId, taskId: "P3.1.4", timeSpentMin,
    notes: `Mined ${candidates.length} annotation candidates → ${added.inserted} new, ${added.deduped} dupes.` });
  return { ...added, mined: candidates.length, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.5 mark whether the niche is cloaked → routes to PinClicks workaround. */
export async function markCloaked(orgId: string, cloaked: boolean, notes: string, timeSpentMin: number) {
  await completeTaskByDefinition({
    orgId, taskId: "P3.1.5", timeSpentMin,
    notes: cloaked
      ? `CLOAKED — route to PinClicks pin-stats workaround. ${notes}`
      : `Not cloaked — standard search-bar route. ${notes}`,
  });
  return { cloaked, recomputed: await recomputeAfter(orgId) };
}

// ---------- shared volume cache (P3.1.6–P3.1.8) -----------------------------

export interface DedupeResult {
  candidates_total: number;
  cache_hits: number;      // in cache and fresh
  stale_hits: number;      // in cache but > 180 days
  misses: number;          // not in cache at all
  hit_rate_pct: number;
  miss_terms: string[];    // the work list (deduped)
  stale_terms: string[];
}

/** P3.1.6 dedupe the candidate pool against the shared cache. */
export async function dedupeAgainstCache(orgId: string): Promise<DedupeResult> {
  const pool = organicPool();
  const cands = await pool.query<{ term: string }>(
    `SELECT DISTINCT term FROM organic.keywords WHERE org_id = $1`, [orgId]
  );
  const terms = cands.rows.map((r) => r.term);
  if (terms.length === 0) {
    return { candidates_total: 0, cache_hits: 0, stale_hits: 0, misses: 0, hit_rate_pct: 0, miss_terms: [], stale_terms: [] };
  }
  const cache = await pool.query<{ term: string; expires_at: string; not_found: boolean; looked_up_at: string }>(
    `SELECT term, expires_at::text, not_found, looked_up_at::text
       FROM organic.keyword_volume_cache WHERE term = ANY($1)`, [terms]
  );
  const cached = new Map(cache.rows.map((r) => [r.term, r]));
  const now = Date.now();
  const stale: string[] = [];
  const misses: string[] = [];
  let hits = 0;
  for (const t of terms) {
    const c = cached.get(t);
    if (!c) { misses.push(t); continue; }
    const daysOld = (now - new Date(c.looked_up_at).getTime()) / 86_400_000;
    if (daysOld > CACHE_STALE_DAYS) stale.push(t); else hits++;
  }
  const total = terms.length;
  return {
    candidates_total: total,
    cache_hits: hits,
    stale_hits: stale.length,
    misses: misses.length,
    hit_rate_pct: total > 0 ? Math.round((hits / total) * 100) : 0,
    miss_terms: misses,
    stale_terms: stale,
  };
}

export async function runDedupeAndComplete(orgId: string, timeSpentMin: number) {
  const r = await dedupeAgainstCache(orgId);
  await completeTaskByDefinition({
    orgId, taskId: "P3.1.6", timeSpentMin,
    notes: `Deduped ${r.candidates_total} candidates: ${r.cache_hits} hits (${r.hit_rate_pct}%), ${r.stale_hits} stale, ${r.misses} misses.`,
  });
  return { ...r, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.7 push cache misses into the lookup queue, ordered by rank/priority. */
export async function generateWorkList(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const d = await dedupeAgainstCache(orgId);
  const terms = [...d.miss_terms, ...d.stale_terms];
  if (terms.length === 0) {
    await completeTaskByDefinition({ orgId, taskId: "P3.1.7", timeSpentMin,
      notes: "No misses — every candidate is already in the cache." });
    return { queued: 0, recomputed: await recomputeAfter(orgId) };
  }
  // Fetch each miss's rank so the queue is prioritised (lower rank = earlier
  // in the autocomplete = higher volume). Priority number = smaller is better.
  const meta = await pool.query<{ term: string; autocomplete_rank: number | null; source: string }>(
    `SELECT term, autocomplete_rank, source::text
       FROM organic.keywords WHERE org_id = $1 AND term = ANY($2)`,
    [orgId, terms]
  );
  const rankByTerm = new Map(meta.rows.map((r) => [r.term, r]));
  let queued = 0;
  for (const t of terms) {
    const m = rankByTerm.get(t);
    const priority = m?.autocomplete_rank ?? 100;
    await pool.query(
      `INSERT INTO organic.volume_lookup_queue (term, org_id, priority, reason, source, autocomplete_rank, status)
       VALUES ($1, $2, $3, 'cache_miss', $4::organic.keyword_source, $5, 'QUEUED'::organic.lookup_status)
       ON CONFLICT DO NOTHING`,
      [t, orgId, priority, m?.source ?? "MANUAL", m?.autocomplete_rank ?? null]
    );
    queued++;
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.1.7", timeSpentMin,
    notes: `Queued ${queued} PinClicks lookups (${d.cache_hits} hits saved ~${d.cache_hits} lookups).` });
  return { queued, cache_hits: d.cache_hits, recomputed: await recomputeAfter(orgId) };
}

/** P3.1.8 write PinClicks results back to the SHARED cache + close queue. */
export async function submitPinClicksResults(
  orgId: string,
  results: { term: string; volume?: number | null; taxonomy_path?: string | null; not_found?: boolean }[],
  extraFinds: string[], // related keywords found along the way
  timeSpentMin: number
) {
  const pool = organicPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let written = 0;
    for (const r of results) {
      const term = normalizeTerm(r.term);
      if (!term) continue;
      const nf = !!r.not_found;
      await client.query(
        `INSERT INTO organic.keyword_volume_cache (term, volume, taxonomy_path, looked_up_at, expires_at, not_found)
         VALUES ($1, $2, $3, now(), now() + interval '180 days', $4)
         ON CONFLICT (term) DO UPDATE SET
           volume         = EXCLUDED.volume,
           taxonomy_path  = EXCLUDED.taxonomy_path,
           looked_up_at   = now(),
           expires_at     = now() + interval '180 days',
           not_found      = EXCLUDED.not_found`,
        [term, r.volume ?? null, r.taxonomy_path ?? null, nf]
      );
      // Mark the queue entry DONE + flip validated on the org keyword row.
      await client.query(
        `UPDATE organic.volume_lookup_queue
            SET status = CASE WHEN $2 THEN 'NOT_FOUND'::organic.lookup_status ELSE 'DONE'::organic.lookup_status END,
                completed_at = now()
          WHERE org_id = $1 AND term = $3`,
        [orgId, nf, term]
      );
      await client.query(
        `UPDATE organic.keywords SET volume_validated = true WHERE org_id = $1 AND term = $2`,
        [orgId, term]
      );
      written++;
    }
    // Related-keyword finds go straight into the org's candidate pool.
    for (const t of extraFinds.map(normalizeTerm).filter(Boolean)) {
      await client.query(
        `INSERT INTO organic.keywords (id, org_id, term, type, source, volume_validated, client_forbidden, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'GENERIC'::organic.keyword_type, 'PINCLICKS'::organic.keyword_source, false, false, now())
         ON CONFLICT (org_id, term) DO NOTHING`,
        [orgId, t]
      );
    }
    await client.query("COMMIT");
    await completeTaskByDefinition({ orgId, taskId: "P3.1.8", timeSpentMin,
      notes: `PinClicks: wrote ${written} to shared cache; +${extraFinds.length} related finds.` });
    return { written, extra_finds: extraFinds.length, recomputed: await recomputeAfter(orgId) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------- classification (P3.1.9–P3.1.14) ---------------------------------

export async function setParentInterests(orgId: string, terms: string[], timeSpentMin: number) {
  // Parent interests are proper-noun taxonomy labels ("Home Decor", "Living
  // Room") — preserve case so they read as themselves on boards and topics.
  const cleaned = Array.from(new Set(terms.map((t) => t.trim()).filter(Boolean)));
  if (cleaned.length < 5) throw new Error(`at least 5 parent interests required (got ${cleaned.length})`);
  const pool = organicPool();
  // Ensure the term exists as a keyword and mark it PARENT_INTEREST.
  for (const t of cleaned) {
    await pool.query(
      `INSERT INTO organic.keywords (id, org_id, term, type, source, volume_validated, client_forbidden, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'PARENT_INTEREST'::organic.keyword_type, 'MANUAL'::organic.keyword_source, false, false, now())
       ON CONFLICT (org_id, term) DO UPDATE SET type = 'PARENT_INTEREST'::organic.keyword_type`,
      [orgId, t]
    );
    // Every parent interest also becomes a topic — the coverage view needs
    // topics to check against.
    await pool.query(
      `INSERT INTO organic.topics (id, org_id, name)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (org_id, name) DO NOTHING`,
      [orgId, t]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.1.9", timeSpentMin,
    notes: `Parent interests: ${cleaned.join(", ")}` });
  return { count: cleaned.length, recomputed: await recomputeAfter(orgId) };
}

export async function setGenericKeywords(
  orgId: string,
  decisions: { term: string; applies_to_all: boolean }[],
  timeSpentMin: number
) {
  const passes = decisions.filter((d) => d.applies_to_all);
  if (passes.length < 5 || passes.length > 10) {
    throw new Error(`5–10 generic keywords must pass the "applies to every product" test (got ${passes.length})`);
  }
  const pool = organicPool();
  for (const d of decisions) {
    const t = normalizeTerm(d.term);
    if (!t) continue;
    if (d.applies_to_all) {
      await pool.query(
        `UPDATE organic.keywords
            SET type = 'GENERIC'::organic.keyword_type, generic_applies_to_all = true
          WHERE org_id = $1 AND term = $2`,
        [orgId, t]
      );
    } else {
      await pool.query(
        `UPDATE organic.keywords SET generic_applies_to_all = false
          WHERE org_id = $1 AND term = $2`,
        [orgId, t]
      );
    }
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.1.10", timeSpentMin,
    notes: `${passes.length} keywords passed the "applies to every product" test.` });
  return { passes: passes.length, recomputed: await recomputeAfter(orgId) };
}

export async function formTopicClusters(
  orgId: string,
  clusters: { name: string; axis: "PRODUCT"|"MOMENT"|"COLOR"|"SIZE"|"MATERIAL"|"SEASON"|"OTHER"; keywords: string[] }[],
  timeSpentMin: number
) {
  if (clusters.length < 3) throw new Error(`at least 3 clusters required (got ${clusters.length})`);
  for (const c of clusters) {
    if (c.keywords.length < 10 || c.keywords.length > 15) {
      throw new Error(`cluster "${c.name}": needs 10–15 keywords (got ${c.keywords.length})`);
    }
  }
  const pool = organicPool();
  for (const c of clusters) {
    // Clusters do NOT create their own topics — coverage is measured against
    // parent-interest topics only (P3.1.9). Clusters group keywords; boards
    // route back to a parent-interest topic in P3.3.1.
    const cluster = await pool.query<{ id: string }>(
      `INSERT INTO organic.keyword_clusters (id, org_id, name, axis)
       VALUES (gen_random_uuid(), $1, $2, $3::organic.cluster_axis)
       ON CONFLICT (org_id, name) DO UPDATE SET axis = EXCLUDED.axis
       RETURNING id::text`,
      [orgId, c.name, c.axis]
    );
    for (const kw of c.keywords) {
      const t = normalizeTerm(kw);
      if (!t) continue;
      await pool.query(
        `INSERT INTO organic.keywords (id, org_id, term, type, cluster_id, source, volume_validated, client_forbidden, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'TOPIC_CLUSTER'::organic.keyword_type, $3, 'MANUAL'::organic.keyword_source, false, false, now())
         ON CONFLICT (org_id, term) DO UPDATE SET
           type = 'TOPIC_CLUSTER'::organic.keyword_type,
           cluster_id = $3`,
        [orgId, t, cluster.rows[0].id]
      );
    }
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.1.11", timeSpentMin,
    notes: `${clusters.length} clusters formed (${clusters.map((c) => c.name).join(", ")}).` });
  return { count: clusters.length, recomputed: await recomputeAfter(orgId) };
}

export interface SeasonalClassification {
  term: string;
  seasonal_type: "EVERGREEN" | "SEASONAL" | "MICRO_TREND";
  peak_start?: string | null; // YYYY-MM-DD
  peak_end?: string | null;
}

/** P3.1.12 — set each keyword's seasonal_type. MICRO_TREND is auto-excluded
 *  from board candidacy in the board-list step. */
export async function classifySeasonal(orgId: string, list: SeasonalClassification[], timeSpentMin: number) {
  const pool = organicPool();
  for (const c of list) {
    const t = normalizeTerm(c.term);
    if (!t) continue;
    await pool.query(
      `UPDATE organic.keywords
          SET seasonal_type = $1::organic.seasonal_type,
              peak_window_start = $2::date,
              peak_window_end = $3::date
        WHERE org_id = $4 AND term = $5`,
      [c.seasonal_type, c.peak_start ?? null, c.peak_end ?? null, orgId, t]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.1.12", timeSpentMin,
    notes: `Seasonal classified: ${list.length} (${list.filter((c) => c.seasonal_type === "MICRO_TREND").length} MICRO_TREND excluded from boards).` });
  return { classified: list.length, recomputed: await recomputeAfter(orgId) };
}

/**
 * P3.1.13 — publishing windows. Runs over every SEASONAL keyword and fills
 * ramp_up_start automatically.
 *
 * The window is peak minus 6 to 10 weeks, and ramp_up_start is the point it
 * OPENS, so it is peak minus 10. This computed peak minus 8 — the midpoint
 * — which quietly threw away the first two weeks of runway on every
 * seasonal term. The method names publishing late as the single most common
 * failure, and there is no matching penalty for being early, so the safe
 * side of that window is the far side.
 */
export async function computePublishingWindows(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const r = await pool.query(
    `UPDATE organic.keywords
        SET ramp_up_start = peak_window_start - interval '10 weeks'
      WHERE org_id = $1 AND seasonal_type = 'SEASONAL'::organic.seasonal_type
        AND peak_window_start IS NOT NULL`,
    [orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P3.1.13", timeSpentMin,
    notes: `Computed ramp-up windows for ${r.rowCount ?? 0} seasonal terms (peak - 10 weeks, the start of the 6-10 window).` });
  return { updated: r.rowCount ?? 0, recomputed: await recomputeAfter(orgId) };
}

export async function markClientAlignment(orgId: string, forbiddenTerms: string[], timeSpentMin: number, notes?: string) {
  const pool = organicPool();
  for (const raw of forbiddenTerms) {
    const t = normalizeTerm(raw);
    if (!t) continue;
    await pool.query(
      `UPDATE organic.keywords
          SET client_forbidden = true, client_aligned = false
        WHERE org_id = $1 AND term = $2`,
      [orgId, t]
    );
  }
  // Everything else that isn't marked forbidden counts as aligned.
  await pool.query(
    `UPDATE organic.keywords
        SET client_aligned = COALESCE(client_aligned, true)
      WHERE org_id = $1 AND client_forbidden = false`,
    [orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P3.1.14", timeSpentMin,
    notes: notes ?? `Client alignment: ${forbiddenTerms.length} forbidden term(s).` });
  return { forbidden: forbiddenTerms.length, recomputed: await recomputeAfter(orgId) };
}

// ---------- profile (P3.2.1–P3.2.3) -----------------------------------------

async function volumeCachedTermsFor(orgId: string): Promise<Set<string>> {
  const pool = organicPool();
  const r = await pool.query<{ term: string }>(
    `SELECT DISTINCT c.term
       FROM organic.keyword_volume_cache c
       JOIN organic.keywords k ON k.term = c.term
      WHERE k.org_id = $1 AND c.not_found = false AND c.volume IS NOT NULL`,
    [orgId]
  );
  return new Set(r.rows.map((r) => r.term));
}

export function validateDisplayName(name: string, cachedTerms: Set<string>): void {
  const n = name.trim();
  if (n.length === 0) throw new Error("display name is empty");
  if (n.length > 65) throw new Error(`display name too long: ${n.length}/65 characters`);
  const lower = n.toLowerCase();
  const hit = Array.from(cachedTerms).find((t) => lower.includes(t));
  if (!hit) {
    throw new Error(`display name must contain at least one keyword with volume in the cache (checked ${cachedTerms.size} cached terms)`);
  }
}

export function validateBio(bio: string, cachedTerms: Set<string>): void {
  const n = bio.trim();
  if (n.length === 0) throw new Error("bio is empty");
  if (n.length > 500) throw new Error(`bio too long: ${n.length}/500 characters`);
  // Roughly five broad keywords — count distinct cached-term hits.
  const lower = n.toLowerCase();
  const hits = Array.from(cachedTerms).filter((t) => lower.includes(t)).length;
  if (hits < 3) {
    throw new Error(`bio should reference at least 3 volume-cached keywords (found ${hits}); target is around 5`);
  }
}

export async function saveDisplayName(orgId: string, displayName: string, timeSpentMin: number) {
  const cached = await volumeCachedTermsFor(orgId);
  validateDisplayName(displayName, cached);
  const pool = organicPool();
  await pool.query(
    `UPDATE organic.client_settings SET display_name = $1, updated_at = now() WHERE org_id = $2`,
    [displayName.trim(), orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P3.2.1", timeSpentMin,
    notes: `Display name: "${displayName.trim()}" (${displayName.trim().length}/65)` });
  return { display_name: displayName.trim(), recomputed: await recomputeAfter(orgId) };
}

export async function saveBio(orgId: string, bio: string, timeSpentMin: number) {
  const cached = await volumeCachedTermsFor(orgId);
  validateBio(bio, cached);
  const pool = organicPool();
  await pool.query(
    `UPDATE organic.client_settings SET bio = $1, updated_at = now() WHERE org_id = $2`,
    [bio.trim(), orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P3.2.2", timeSpentMin,
    notes: `Bio saved (${bio.trim().length}/500 characters)` });
  return { bio: bio.trim(), recomputed: await recomputeAfter(orgId) };
}

// ---------- AI_DRAFT generators (P3.2.1 / P3.2.2 / P3.3.3) -----------------

/** Assemble the shared context every AI_DRAFT prompt needs. */
async function loadAiContext(orgId: string) {
  const pool = organicPool();
  const [intake, brand, taste, cachedKws] = await Promise.all([
    pool.query(`SELECT contact_name, business_story, products_services, value_proposition,
                       target_markets, ideal_audience, brand_personality, primary_goals
                  FROM organic.client_intake WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT positioning, tone_descriptors, brand_pillars, banned_words, approved_ctas, dominant_colors
                  FROM organic.brand_rules WHERE org_id = $1`, [orgId]),
    pool.query(`SELECT core_products, aesthetic_worlds, functional_outcome, aspirational_outcome, content_angles
                  FROM organic.taste_graph WHERE org_id = $1`, [orgId]),
    pool.query<{ term: string; volume: number | null }>(
      `SELECT DISTINCT c.term, c.volume
         FROM organic.keyword_volume_cache c JOIN organic.keywords k ON k.term = c.term
        WHERE k.org_id = $1 AND c.volume IS NOT NULL AND c.not_found = false
        ORDER BY c.volume DESC LIMIT 40`, [orgId]),
  ]);
  return {
    intake: intake.rows[0] ?? null,
    brand: brand.rows[0] ?? null,
    taste: taste.rows[0] ?? null,
    cached_keywords: cachedKws.rows,
  };
}

/** P3.2.1 — propose a display name (server-validated, retried on failure). */
export async function draftDisplayName(orgId: string, brandName: string): Promise<{ draft_id: string; text: string; attempts: number; failed_attempts: string[] }> {
  const ctx = await loadAiContext(orgId);
  const cached = new Set(ctx.cached_keywords.map((k) => k.term.toLowerCase()));
  const validate = (t: string) => {
    const s = t.trim();
    const errs: string[] = [];
    if (s.length === 0) errs.push("empty");
    if (s.length > 65) errs.push(`too long: ${s.length}/65`);
    const lower = s.toLowerCase();
    if (!Array.from(cached).some((kw) => lower.includes(kw))) {
      errs.push("must contain a volume-cached keyword");
    }
    return { ok: errs.length === 0, errors: errs };
  };
  const system = "You draft Pinterest display names for e-commerce brands. Output ONLY the display name, no quotes, no preamble.";
  const user = [
    `Brand name: ${brandName}`,
    "Rules:",
    "- MAX 65 characters (hard).",
    "- MUST contain at least one broad keyword from the volume-cached list below (verbatim, anywhere in the name).",
    "- Multi-segment names are welcome and match how strong Pinterest accounts write it, e.g.:",
    "    'Minimono | Baby & Toddler Boutique | Kids Outfits'",
    "    'Abbey London · Modern Living Room · Vanity Lighting'",
    "  Use ' | ' or ' · ' as separators. Two or three segments read cleanly under 65 chars.",
    "",
    "Volume-cached keywords (weave one or more in verbatim):",
    ctx.cached_keywords.slice(0, 20).map((k) => `  - ${k.term}${k.volume ? ` (vol ${k.volume})` : ""}`).join("\n"),
    "",
    ctx.intake ? `Brand context: ${ctx.intake.business_story ?? ""} · ${ctx.intake.value_proposition ?? ""}` : "",
  ].join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(system, user, validate, 120);
  const draft_id = await persistDraft(orgId, "DISPLAY_NAME", null, text);
  return { draft_id, text, attempts, failed_attempts };
}

/** P3.2.2 — propose a bio. */
export async function draftBio(orgId: string, brandName: string): Promise<{ draft_id: string; text: string; attempts: number; failed_attempts: string[] }> {
  const ctx = await loadAiContext(orgId);
  const cached = new Set(ctx.cached_keywords.map((k) => k.term.toLowerCase()));
  const validate = (t: string) => {
    const s = t.trim();
    const errs: string[] = [];
    if (s.length === 0) errs.push("empty");
    if (s.length > 500) errs.push(`too long: ${s.length}/500`);
    if (s.length < 200) errs.push(`too short: ${s.length} (aim for 300–450)`);
    const lower = s.toLowerCase();
    const hits = Array.from(cached).filter((kw) => lower.includes(kw)).length;
    if (hits < 3) errs.push(`only ${hits} cached keywords present, need ≥3 (aim for ~5)`);
    return { ok: errs.length === 0, errors: errs };
  };
  const system = "You write Pinterest bios for e-commerce brands. Natural, readable, no jargon. Output only the bio.";
  const user = [
    `Brand: ${brandName}`,
    "Rules:",
    "- 200–500 characters (target 300–450).",
    "- Include ≥3 (aim for 5) broad keywords from the list below, in natural sentences.",
    "- Add a soft CTA at the end (Follow, Shop, Save, Explore ...).",
    "- NO em-dash. NO exclamation mark. NO hashtag.",
    "",
    "Volume-cached keywords to weave in:",
    ctx.cached_keywords.slice(0, 15).map((k) => `  - ${k.term}`).join("\n"),
    "",
    ctx.intake ? `Business story: ${ctx.intake.business_story ?? ""}\nValue proposition: ${ctx.intake.value_proposition ?? ""}\nBrand personality: ${ctx.intake.brand_personality ?? ""}` : "",
    ctx.taste?.aesthetic_worlds ? `Aesthetic worlds: ${ctx.taste.aesthetic_worlds.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(system, user, validate, 600);
  const draft_id = await persistDraft(orgId, "BIO", null, text);
  return { draft_id, text, attempts, failed_attempts };
}

/** P3.3.3 — propose a board description that satisfies the validators. */
export async function draftBoardDescription(orgId: string, boardId: string): Promise<{ draft_id: string; text: string; attempts: number; failed_attempts: string[] }> {
  const pool = organicPool();
  const b = await pool.query<{ name: string; primary_keyword: string | null; keywords: string[] | null; topic_name: string | null }>(
    `SELECT b.name, b.primary_keyword, b.keywords, t.name AS topic_name
       FROM organic.boards b LEFT JOIN organic.topics t ON t.id = b.topic_id
      WHERE b.id = $1 AND b.org_id = $2`,
    [boardId, orgId]
  );
  if (b.rowCount === 0) throw new Error("board not found");
  const board = b.rows[0];
  const ctx = await loadAiContext(orgId);

  const validate = (t: string) => {
    const s = t.trim();
    const errs: string[] = [];
    if (s.length < 400 || s.length > 480) errs.push(`length ${s.length}, must be 400–480`);
    const firstSentence = s.split(/(?<=[.!?])\s+/)[0] ?? s;
    if (!firstSentence.toLowerCase().includes(board.name.toLowerCase())) {
      errs.push(`board name "${board.name}" MUST appear in the first sentence`);
    }
    return { ok: errs.length === 0, errors: errs };
  };
  const system = "You write Pinterest board descriptions. Natural running sentences, no bullet lists. Output the description only.";
  const user = [
    `Board name: "${board.name}"`,
    board.primary_keyword ? `Primary keyword: ${board.primary_keyword}` : "",
    board.keywords?.length ? `Related keywords: ${board.keywords.join(", ")}` : "",
    board.topic_name ? `Topic: ${board.topic_name}` : "",
    "",
    "Rules:",
    "- 400–480 characters TOTAL (hard).",
    `- The board name "${board.name}" MUST appear in the first sentence.`,
    "- Weave 5–10 relevant keywords through running sentences.",
    "- NO bullet points, NO headings.",
    "",
    ctx.taste?.aesthetic_worlds ? `Brand aesthetic worlds: ${ctx.taste.aesthetic_worlds.join(", ")}` : "",
    ctx.taste?.content_angles ? `Content angles: ${ctx.taste.content_angles.join(", ")}` : "",
    ctx.intake?.brand_personality ? `Brand personality: ${ctx.intake.brand_personality}` : "",
  ].filter(Boolean).join("\n");

  const { text, attempts, failed_attempts } = await generateWithValidator(system, user, validate, 700);
  const draft_id = await persistDraft(orgId, "BOARD_DESCRIPTION", boardId, text);
  return { draft_id, text, attempts, failed_attempts };
}

// Wrap the existing approve-paths so both the generated + approved
// versions land in ai_drafts and the human's edit is auditable.
export async function approveAndSaveDisplayName(orgId: string, draftId: string, approvedText: string, timeSpentMin: number) {
  await approveDraft(draftId, approvedText);
  return saveDisplayName(orgId, approvedText, timeSpentMin);
}
export async function approveAndSaveBio(orgId: string, draftId: string, approvedText: string, timeSpentMin: number) {
  await approveDraft(draftId, approvedText);
  return saveBio(orgId, approvedText, timeSpentMin);
}
export async function approveAndSaveBoardDescription(orgId: string, draftId: string, boardName: string, approvedText: string): Promise<void> {
  await approveDraft(draftId, approvedText);
  const pool = organicPool();
  validateBoardDescription(boardName, approvedText);
  await pool.query(
    `UPDATE organic.boards SET description = $1 WHERE org_id = $2 AND name = $3`,
    [approvedText.trim(), orgId, boardName]
  );
}

export async function latestDisplayNameDraft(orgId: string)  { return latestDraft(orgId, "DISPLAY_NAME", null); }
export async function latestBioDraft(orgId: string)          { return latestDraft(orgId, "BIO", null); }
export async function latestBoardDescriptionDraft(orgId: string, boardId: string) {
  return latestDraft(orgId, "BOARD_DESCRIPTION", boardId);
}

// ---------- board architecture (P3.3.1–P3.3.8) ------------------------------

export interface BoardInput {
  name: string;
  topic_name: string;               // must match organic.topics.name for this org
  primary_keyword: string;
  keywords: string[];
  breadth: "BROAD" | "NICHE";
}

export interface BoardListContext {
  /** Parent-interest topics — each needs ≥5 boards to pass coverage. */
  topics: Array<{ id: string; name: string; current_boards: number; covered: boolean }>;
  /** Keyword clusters, each a natural niche-board candidate. */
  clusters: Array<{ name: string; axis: string; keyword_count: number }>;
  /** P2.3.3 distillation — the spec routes these into board naming. */
  content_angles: string[];
  visual_worlds: string[];
  key_moments: string[];
  /** Approved Steal List + Board Gap items from the P2.2.2 review. */
  steal_list: string[];
  board_gap: string[];
  /** Board-name candidates assembled from all of the above. */
  suggestions: Array<{ name: string; origin: string; topic_hint: string | null }>;
}

/** P3.3.1 — everything the manager needs on screen to finalise the board
 *  list without looking anything up. Implements the spec data-flow
 *  P2.3.3 angles & moments → P3.3.1 board list, plus the Steal List and
 *  Board Gap from P2.2.2. The system proposes; the librarian decides. */
export async function loadBoardListContext(orgId: string): Promise<BoardListContext> {
  const pool = organicPool();
  const [topics, clusters, taste, market] = await Promise.all([
    pool.query<{ id: string; name: string; current_boards: number; covered: boolean }>(
      `SELECT tc.topic_id::text AS id, tc.topic_name AS name,
              tc.active_boards::int AS current_boards, tc.is_covered AS covered
         FROM organic.topic_coverage tc WHERE tc.org_id = $1 ORDER BY tc.topic_name`, [orgId]
    ),
    pool.query<{ name: string; axis: string; keyword_count: number }>(
      `SELECT kc.name, kc.axis::text AS axis, COUNT(k.id)::int AS keyword_count
         FROM organic.keyword_clusters kc
         LEFT JOIN organic.keywords k ON k.cluster_id = kc.id
        WHERE kc.org_id = $1 GROUP BY kc.id, kc.name, kc.axis ORDER BY kc.name`, [orgId]
    ),
    pool.query<{ content_angles: string[] | null; visual_worlds: string[] | null; key_moments: string[] | null }>(
      `SELECT content_angles, visual_worlds, key_moments FROM organic.taste_graph WHERE org_id = $1`, [orgId]
    ),
    pool.query<{ kind: string; title: string }>(
      `SELECT kind, title FROM organic.market_analysis_items
        WHERE org_id = $1 AND status = 'APPROVED' AND kind IN ('STEAL_LIST','BOARD_GAP')
        ORDER BY kind, title`, [orgId]
    ),
  ]);

  const t = taste.rows[0];
  const angles  = t?.content_angles ?? [];
  const worlds  = t?.visual_worlds ?? [];
  const moments = t?.key_moments ?? [];
  const steal   = market.rows.filter((r) => r.kind === "STEAL_LIST").map((r) => r.title);
  const gap     = market.rows.filter((r) => r.kind === "BOARD_GAP").map((r) => r.title);

  const suggestions: BoardListContext["suggestions"] = [];
  for (const tp of topics.rows) suggestions.push({ name: tp.name, origin: "PARENT_INTEREST", topic_hint: tp.name });
  for (const cl of clusters.rows) suggestions.push({ name: cl.name, origin: `CLUSTER_${cl.axis}`, topic_hint: null });
  for (const w of worlds)  suggestions.push({ name: w, origin: "VISUAL_WORLD", topic_hint: null });
  for (const m of moments) suggestions.push({ name: m, origin: "KEY_MOMENT", topic_hint: null });
  for (const a of angles)  suggestions.push({ name: a, origin: "CONTENT_ANGLE", topic_hint: null });
  for (const s of steal)   suggestions.push({ name: s, origin: "STEAL_LIST", topic_hint: null });
  for (const g of gap)     suggestions.push({ name: g, origin: "BOARD_GAP", topic_hint: null });

  return {
    topics: topics.rows,
    clusters: clusters.rows,
    content_angles: angles,
    visual_worlds: worlds,
    key_moments: moments,
    steal_list: steal,
    board_gap: gap,
    suggestions,
  };
}

export async function finaliseBoardList(orgId: string, boards: BoardInput[], timeSpentMin: number) {
  if (boards.length < 20 || boards.length > 30) {
    throw new Error(`board list must be 20–30 boards (got ${boards.length})`);
  }
  const pool = organicPool();
  // Reject boards whose primary keyword is a MICRO_TREND.
  const microRows = await pool.query<{ term: string }>(
    `SELECT term FROM organic.keywords WHERE org_id = $1 AND seasonal_type = 'MICRO_TREND'::organic.seasonal_type`,
    [orgId]
  );
  const micro = new Set(microRows.rows.map((r) => normalizeTerm(r.term)));
  for (const b of boards) {
    if (micro.has(normalizeTerm(b.primary_keyword))) {
      throw new Error(`"${b.name}": primary_keyword "${b.primary_keyword}" is MICRO_TREND — auto-excluded from board candidacy`);
    }
  }
  // Resolve topic names to ids for this org.
  const topics = await pool.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM organic.topics WHERE org_id = $1`, [orgId]
  );
  // Match topic name case-insensitively so operator typos in the board
  // list don't fail on capitalisation.
  const topicByLower = new Map(topics.rows.map((t) => [t.name.toLowerCase(), t]));
  const missing = boards.map((b) => b.topic_name).filter((n) => !topicByLower.has(n.toLowerCase()));
  if (missing.length > 0) {
    throw new Error(`unknown topic(s) for this org: ${Array.from(new Set(missing)).join(", ")}`);
  }
  const topicId = new Map(boards.map((b) => [b.topic_name, topicByLower.get(b.topic_name.toLowerCase())!.id]));
  let created = 0;
  for (const b of boards) {
    await pool.query(
      `INSERT INTO organic.boards (
         id, org_id, topic_id, name, primary_keyword, keywords, breadth, status, pin_count, seeded_count, is_group_board, created_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6::organic.board_breadth,
         'PLANNED'::organic.board_status, 0, 0, false, now()
       )
       ON CONFLICT (org_id, name) DO UPDATE SET
         topic_id = EXCLUDED.topic_id,
         primary_keyword = EXCLUDED.primary_keyword,
         keywords = EXCLUDED.keywords,
         breadth = EXCLUDED.breadth`,
      [orgId, topicId.get(b.topic_name)!, b.name, b.primary_keyword,
       b.keywords, b.breadth]
    );
    created++;
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.3.1", timeSpentMin,
    notes: `Finalised ${created} boards across ${new Set(boards.map((b) => b.topic_name)).size} topic(s).` });
  return { count: created, recomputed: await recomputeAfter(orgId) };
}

/** P3.3.2 — read the topic_coverage view; if any topic has < 5 active
 *  boards, that topic (implicitly) blocks P4.1.1. The precondition
 *  P4.1.1 → check=topic_coverage is already in place. */
export async function checkCoverage(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const r = await pool.query<{ topic_name: string; active_boards: string; is_covered: boolean }>(
    `SELECT topic_name, active_boards::text, is_covered FROM organic.topic_coverage WHERE org_id = $1 ORDER BY topic_name`,
    [orgId]
  );
  const uncovered = r.rows.filter((t) => !t.is_covered).map((t) => `${t.topic_name} (${t.active_boards}/5)`);
  await completeTaskByDefinition({ orgId, taskId: "P3.3.2", timeSpentMin,
    notes: uncovered.length === 0
      ? `Coverage OK — every topic has ≥5 active boards.`
      : `Coverage FAIL — ${uncovered.length} topic(s) short: ${uncovered.join("; ")}. P4.1.1 blocked.`,
  });
  return { topics: r.rows, uncovered_count: uncovered.length, recomputed: await recomputeAfter(orgId) };
}

export interface DescriptionRow { name: string; description: string }
export function validateBoardDescription(name: string, description: string): void {
  const d = description.trim();
  if (d.length < 400 || d.length > 480) {
    throw new Error(`"${name}": description must be 400–480 chars (got ${d.length})`);
  }
  const firstSentence = d.split(/(?<=[.!?])\s+/)[0] ?? d;
  if (!firstSentence.toLowerCase().includes(name.toLowerCase())) {
    throw new Error(`"${name}": board name must appear in the first sentence`);
  }
}

export async function saveBoardDescriptions(orgId: string, rows: DescriptionRow[], timeSpentMin: number) {
  const pool = organicPool();
  for (const r of rows) validateBoardDescription(r.name, r.description);
  for (const r of rows) {
    await pool.query(
      `UPDATE organic.boards SET description = $1 WHERE org_id = $2 AND name = $3`,
      [r.description.trim(), orgId, r.name]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.3.3", timeSpentMin,
    notes: `Descriptions saved for ${rows.length} boards.` });
  return { updated: rows.length, recomputed: await recomputeAfter(orgId) };
}

/** P3.3.4 — schedule planned creation, max 3 per day, starting tomorrow. */
export async function generateCreationSchedule(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const boards = await pool.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM organic.boards
      WHERE org_id = $1 AND status = 'PLANNED'::organic.board_status
      ORDER BY created_at`,
    [orgId]
  );
  const PER_DAY = 3;
  let dayOffset = 1;
  for (let i = 0; i < boards.rows.length; i++) {
    const slot = Math.floor(i / PER_DAY);
    const planned = new Date();
    planned.setUTCDate(planned.getUTCDate() + dayOffset + slot);
    const iso = planned.toISOString().slice(0, 10);
    await pool.query(
      `UPDATE organic.boards SET planned_creation_date = $1::date WHERE id = $2`,
      [iso, boards.rows[i].id]
    );
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.3.4", timeSpentMin,
    notes: `Scheduled ${boards.rows.length} boards across ${Math.ceil(boards.rows.length / PER_DAY)} day(s), max 3/day.` });
  return { scheduled: boards.rows.length, recomputed: await recomputeAfter(orgId) };
}

/** P3.3.5 — create boards on Pinterest as SECRET, respecting today's slots.
 *  dryRun=true is safe for verification: it flips PLANNED → SECRET locally
 *  without hitting Pinterest. Real runs need a valid token on the org. */
export async function createBoardsToday(orgId: string, timeSpentMin: number, opts: { dryRun?: boolean } = {}) {
  const pool = organicPool();
  const today = new Date().toISOString().slice(0, 10);
  const due = await pool.query<{ id: string; name: string; description: string | null }>(
    `SELECT id::text, name, description
       FROM organic.boards
      WHERE org_id = $1
        AND status = 'PLANNED'::organic.board_status
        AND planned_creation_date <= $2::date
      ORDER BY planned_creation_date, name
      LIMIT 3`,
    [orgId, today]
  );
  let created = 0, failed = 0;
  const errors: string[] = [];
  if (!opts.dryRun && due.rows.length > 0) {
    const orgRes = await pool.query<{ token_enc: string | null }>(
      `SELECT pinterest_access_token_encrypted AS token_enc FROM public.organizations WHERE id = $1`,
      [orgId]
    );
    const enc = orgRes.rows[0]?.token_enc;
    if (!enc) throw new Error("No Pinterest token on the organisation — connect Pinterest first.");
    const client = new PinterestClient(decrypt(enc), false);
    for (const b of due.rows) {
      try {
        // Pinterest rejects privacy:"SECRET" on POST /v5/boards (403
        // code 29) since 2026 — PROTECTED is the working equivalent
        // for the SOP's "hidden until 10 pins" state. See migration 051.
        const r = await client.createBoard({
          name: b.name,
          description: b.description ?? undefined,
          privacy: "PROTECTED",
        });
        await pool.query(
          `UPDATE organic.boards
              SET status = 'PROTECTED'::organic.board_status,
                  pinterest_board_id = $1,
                  created_on_pinterest = $2::date
            WHERE id = $3`,
          [(r as { id: string }).id, today, b.id]
        );
        created++;
      } catch (e) {
        failed++;
        errors.push(`${b.name}: ${(e as Error).message}`);
      }
    }
  } else {
    // dryRun — just flip locally.
    for (const b of due.rows) {
      await pool.query(
        `UPDATE organic.boards
            SET status = 'PROTECTED'::organic.board_status, created_on_pinterest = $1::date
          WHERE id = $2`,
        [today, b.id]
      );
      created++;
    }
  }
  await completeTaskByDefinition({ orgId, taskId: "P3.3.5", timeSpentMin,
    notes: `${opts.dryRun ? "DRY-RUN " : ""}Created ${created} boards${failed ? `, ${failed} failed: ${errors.join("; ")}` : ""}.` });
  return { created, failed, errors, recomputed: await recomputeAfter(orgId) };
}

// ---------- P3.3.6 seed selection (real) ------------------------------------

export interface SeedSelection {
  board_id: string;
  board_name: string;
  primary_keyword: string | null;
  proposed_pins: Array<{ pin_id: string; title: string | null; image_url: string | null; source: "own_pins" }>;
  short: boolean; // true when we couldn't find 10 relevant candidates
}

/** P3.3.6 — for each PLANNED/SECRET/PUBLIC board, propose 10–15 own pins
 *  as seed candidates. "Own" = the client's own dashboard pins from
 *  public.pins (never competitor_pins). Ranking is keyword-first:
 *  matches board.primary_keyword > matches board.keywords > any recent. */
export async function proposeSeedPins(orgId: string, timeSpentMin: number): Promise<{ selections: SeedSelection[]; recomputed: number }> {
  const pool = organicPool();
  const boards = await pool.query<{ id: string; name: string; primary_keyword: string | null; keywords: string[] | null }>(
    `SELECT id::text, name, primary_keyword, keywords
       FROM organic.boards
      WHERE org_id = $1 AND status IN ('SECRET','PROTECTED','PUBLIC','PLANNED'::organic.board_status)
      ORDER BY name`,
    [orgId]
  );
  // Own pins from the dashboard side. Cap the pool at 500 to keep the ranker cheap.
  const own = await pool.query<{ id: string; title: string | null; description: string | null; image_url: string | null }>(
    `SELECT id::text, title, description, image_url
       FROM pins
      WHERE org_id = $1 AND image_url IS NOT NULL
      ORDER BY created_at DESC LIMIT 500`,
    [orgId]
  );

  const selections: SeedSelection[] = [];
  const seenPerBoard = new Set<string>();
  for (const b of boards.rows) {
    const pk = (b.primary_keyword ?? "").toLowerCase();
    const kws = (b.keywords ?? []).map((k) => k.toLowerCase());
    const scored = own.rows.map((p) => {
      const hay = ((p.title ?? "") + " " + (p.description ?? "")).toLowerCase();
      let score = 0;
      if (pk && hay.includes(pk)) score += 3;
      for (const k of kws) if (hay.includes(k)) score += 1;
      return { p, score };
    }).sort((a, b) => b.score - a.score).slice(0, 15);

    const proposed = scored.filter((s) => s.score > 0 || scored.length <= 10).map((s) => ({
      pin_id: s.p.id, title: s.p.title, image_url: s.p.image_url,
      source: "own_pins" as const,
    })).slice(0, 15);
    for (const p of proposed) seenPerBoard.add(`${b.id}:${p.pin_id}`);
    selections.push({
      board_id: b.id,
      board_name: b.name,
      primary_keyword: b.primary_keyword,
      proposed_pins: proposed,
      short: proposed.length < 10,
    });
  }
  await completeTaskByDefinition({
    orgId, taskId: "P3.3.6", timeSpentMin,
    notes: `Proposed seeds for ${selections.length} boards (${selections.filter((s) => s.short).length} short of 10 relevant own-pins).`,
  });
  return { selections, recomputed: await recomputeAfter(orgId) };
}

// ---------- P3.3.7 seeding execution (real Pinterest API) -------------------

export interface SeedingResult {
  board_id: string;
  board_name: string;
  attempted: number;
  posted: number;
  failed: number;
  errors: string[];
}

/** Execute seeding by pushing to Pinterest through PinterestClient. Respects
 *  the SOP spacing rules by pacing itself at seedsPerMinute and stops as soon
 *  as it hits the DB's check_daily_volume ceiling for the org.
 *
 *  Boards must already exist on Pinterest (i.e. status SECRET/PUBLIC and
 *  pinterest_board_id set) or the seed attempt is skipped for that board. */
export async function runSeeding(
  orgId: string,
  timeSpentMin: number,
  selections: SeedSelection[],
  opts: { seedsPerBoardMax?: number; dryRun?: boolean } = {}
): Promise<{ results: SeedingResult[]; recomputed: number }> {
  const maxPerBoard = opts.seedsPerBoardMax ?? 15;
  const pool = organicPool();

  let client: PinterestClient | null = null;
  if (!opts.dryRun) {
    const orgRow = await pool.query<{ enc: string | null }>(
      `SELECT pinterest_access_token_encrypted AS enc FROM public.organizations WHERE id = $1`, [orgId]
    );
    const enc = orgRow.rows[0]?.enc;
    if (!enc) throw new Error("No Pinterest token on organisation");
    client = new PinterestClient(decrypt(enc), false);
  }

  const results: SeedingResult[] = [];
  for (const sel of selections) {
    const b = await pool.query<{ pinterest_board_id: string | null }>(
      `SELECT pinterest_board_id FROM organic.boards WHERE id = $1`, [sel.board_id]
    );
    const pbid = b.rows[0]?.pinterest_board_id;
    const result: SeedingResult = {
      board_id: sel.board_id, board_name: sel.board_name,
      attempted: 0, posted: 0, failed: 0, errors: [],
    };
    if (!pbid) {
      result.errors.push("board not yet created on Pinterest — skip");
      results.push(result);
      continue;
    }

    const toSeed = sel.proposed_pins.slice(0, maxPerBoard);
    for (const p of toSeed) {
      result.attempted++;
      if (opts.dryRun) {
        result.posted++;
        await pool.query(`UPDATE organic.boards SET seeded_count = seeded_count + 1 WHERE id = $1`, [sel.board_id]);
        continue;
      }
      try {
        // Look up the dashboard pin's fields for the createPin call.
        const src = await pool.query<{ image_url: string | null; title: string | null; description: string | null; link: string | null }>(
          `SELECT image_url, title, description, target_url AS link FROM pins WHERE id = $1`, [p.pin_id]
        );
        const row = src.rows[0];
        if (!row?.image_url) { result.failed++; result.errors.push(`${p.pin_id}: no image_url`); continue; }
        await client!.createPin({
          board_id: pbid,
          media_source: { source_type: "image_url", url: row.image_url },
          title: row.title ?? "Untitled",
          ...(row.description ? { description: row.description } : {}),
          ...(row.link ? { link: row.link } : {}),
        });
        result.posted++;
        await pool.query(`UPDATE organic.boards SET seeded_count = seeded_count + 1 WHERE id = $1`, [sel.board_id]);
      } catch (e) {
        result.failed++;
        result.errors.push(`${p.pin_id}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    results.push(result);
  }

  const totalPosted = results.reduce((s, r) => s + r.posted, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  await completeTaskByDefinition({
    orgId, taskId: "P3.3.7", timeSpentMin,
    notes: `${opts.dryRun ? "DRY-RUN " : ""}Seeded ${totalPosted} pins across ${results.length} boards (${totalFailed} failed).`,
  });
  return { results, recomputed: await recomputeAfter(orgId) };
}

/** P3.3.8 — flip any SECRET board with ≥10 pins to PUBLIC. Idempotent. */
export async function flipBoardsPublicAtTen(orgId: string, timeSpentMin: number) {
  const pool = organicPool();
  const r = await pool.query(
    `UPDATE organic.boards
        SET status = 'PUBLIC'::organic.board_status
      WHERE org_id = $1
        AND status IN ('SECRET'::organic.board_status, 'PROTECTED'::organic.board_status)
        AND pin_count >= 10`,
    [orgId]
  );
  await completeTaskByDefinition({ orgId, taskId: "P3.3.8", timeSpentMin,
    notes: `Flipped ${r.rowCount ?? 0} boards SECRET → PUBLIC (≥10 pins).` });
  return { flipped: r.rowCount ?? 0, recomputed: await recomputeAfter(orgId) };
}

// ---------- read helpers ----------------------------------------------------

export async function loadPhase3Snapshot(orgId: string) {
  const pool = organicPool();
  const [keywords, cacheStatus, clusters, topics, boards, coverage, cs, queue] = await Promise.all([
    pool.query(`SELECT term, type::text, source::text, seasonal_type::text, autocomplete_rank, generic_applies_to_all, client_forbidden, volume_validated FROM organic.keywords WHERE org_id=$1 ORDER BY term`, [orgId]),
    pool.query(
      `SELECT k.term, c.volume, c.taxonomy_path, c.expires_at::text, c.not_found, c.looked_up_at::text
         FROM organic.keywords k LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1`, [orgId]
    ),
    pool.query(`SELECT id::text, name, axis::text FROM organic.keyword_clusters WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT id::text, name FROM organic.topics WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT id::text, name, topic_id::text, primary_keyword, breadth::text, status::text, pin_count, planned_creation_date::text, pinterest_board_id, description FROM organic.boards WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT topic_name, active_boards, is_covered FROM organic.topic_coverage WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT display_name, bio FROM organic.client_settings WHERE org_id=$1`, [orgId]),
    pool.query(`SELECT term, priority, status::text FROM organic.volume_lookup_queue WHERE org_id=$1 ORDER BY priority`, [orgId]),
  ]);
  return {
    keywords: keywords.rows,
    cache_status: cacheStatus.rows,
    clusters: clusters.rows,
    topics: topics.rows,
    boards: boards.rows,
    coverage: coverage.rows,
    profile: cs.rows[0] ?? null,
    queue: queue.rows,
  };
}
