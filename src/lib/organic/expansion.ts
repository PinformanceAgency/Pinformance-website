/**
 * URL pool expansion — when a client's catalogue is too small for their
 * target frequency, the system proposes landing pages the client can
 * build. Proposals are generated from the keyword bank + topic clusters,
 * so the suggested pages map to keywords that already have cached volume.
 *
 * Every proposal carries a concrete brief the manager can copy-paste to
 * the client. Once the client builds the page, the operator marks the
 * proposal BUILT + attaches the new URL, which feeds back into the URL
 * pool.
 */
import { organicPool } from "./db";

// ---------- URL requirement math --------------------------------------------

export interface UrlRequirement {
  daily_pin_target: number;
  spacing_hours: number;
  spacing_days: number;
  waterfall_duration_days: number;
  urls_per_month_needed: number;
  cooldown_days: number;
  rerun_interval_days: number;
  required_urls: number;
  existing_urls: number;
  /** What P1.0.3 counted on the sitemap. Null until the gate is run. */
  sitemap_urls: number | null;
  /** The larger of the two — the pool the plan can actually draw on. */
  available_urls: number;
  gap: number;                              // required − existing (0 if none)
  cooldown_below_floor: boolean;            // < 30 days = warn
}

export async function computeUrlRequirement(orgId: string): Promise<UrlRequirement> {
  const pool = organicPool();
  const cs = await pool.query<{
    daily_pin_target: number;
    spacing_hours: number;
    url_cooldown_days: number;
  }>(
    `SELECT daily_pin_target, spacing_hours, url_cooldown_days
       FROM organic.client_settings WHERE org_id = $1`, [orgId]
  );
  if (cs.rowCount === 0) throw new Error("client_settings not found");
  const { daily_pin_target, spacing_hours, url_cooldown_days } = cs.rows[0];

  const spacing_days = Math.max(1, Math.round(spacing_hours / 24));
  const waterfall_duration_days = 15 * spacing_days;           // 16 pins, 15 gaps
  const urls_per_month_needed = Math.ceil((daily_pin_target * 30) / 16);
  const rerun_interval_days = waterfall_duration_days + url_cooldown_days;
  const required_urls = Math.ceil((urls_per_month_needed * rerun_interval_days) / 30);

  const [existing, sitemap] = await Promise.all([
    pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM organic.urls WHERE org_id = $1`, [orgId]),
    // P1.0.3 counted the sitemap in phase 1, long before anyone typed a URL
    // into the system. The data-flow map requires that count to reach the
    // frequency plan, and counting organic.urls alone got the answer wrong
    // in exactly the case the plan is made: a store that has just been
    // assessed has 38 usable URLs on its sitemap and 0 rows here, so the
    // requirement reported a shortfall of the entire plan.
    pool.query<{ n: number | null }>(
      `SELECT total_urls_found AS n FROM organic.client_viability WHERE org_id = $1`, [orgId]),
  ]);
  const existing_urls = existing.rows[0].n;
  const sitemap_urls = sitemap.rows[0]?.n ?? null;

  // The pool is whichever is larger. Entered URLs are the live truth once
  // they exist; the sitemap count is the only truth before that. Taking the
  // smaller would report a gap that closes itself the moment somebody does
  // data entry, which is not a frequency problem.
  const available_urls = Math.max(existing_urls, sitemap_urls ?? 0);

  return {
    daily_pin_target, spacing_hours, spacing_days,
    waterfall_duration_days, urls_per_month_needed,
    cooldown_days: url_cooldown_days, rerun_interval_days, required_urls,
    existing_urls, sitemap_urls, available_urls,
    gap: Math.max(0, required_urls - available_urls),
    cooldown_below_floor: url_cooldown_days < 30,
  };
}

// ---------- Page-type generator ---------------------------------------------

export type PageType =
  | "COLOR_CATEGORY" | "PRODUCT_TYPE" | "LENGTH_STYLE" | "MATERIAL"
  | "SEASONAL_EDIT" | "BEST_OF" | "REVIEWS_UGC" | "CURATED_SELECTION";

/** Maps a cluster axis to the most natural landing-page type. */
const AXIS_TO_PAGE_TYPE: Record<string, PageType> = {
  COLOR:    "COLOR_CATEGORY",
  PRODUCT:  "PRODUCT_TYPE",
  SIZE:     "LENGTH_STYLE",
  MATERIAL: "MATERIAL",
  SEASON:   "SEASONAL_EDIT",
  MOMENT:   "BEST_OF",
  OTHER:    "CURATED_SELECTION",
};

export interface ProposedPage {
  title: string;
  page_type: PageType;
  supporting_keywords: string[];
  supporting_keywords_volume: number;
  brief: string;
}

/** Compose a client-ready brief for one proposed page. */
function brief(page_type: PageType, title: string, kws: Array<{ term: string; volume: number | null }>): string {
  const kwList = kws.map((k) => `- ${k.term}${k.volume ? ` (Pinterest volume ~${k.volume})` : ""}`).join("\n");
  const typeGuidance: Record<PageType, string> = {
    COLOR_CATEGORY: "One landing page grouping the SKUs that share this colour palette. Hero image with the palette obvious, product grid below. Photo-first, not text-heavy.",
    PRODUCT_TYPE: "A dedicated collection page for this product type. Mix of hero shots, in-context lifestyle images, and a shoppable grid. Filter chips optional but useful.",
    LENGTH_STYLE: "Grouping by size or fit — e.g. 'small bedroom ideas', 'oversized rugs for large rooms'. Editorial framing on top, product proof below.",
    MATERIAL: "Material story page. Explain the material's benefits + care, followed by every SKU that uses it. Works for jewellery, textiles, home decor, fashion.",
    SEASONAL_EDIT: "Time-boxed collection ('Holiday hosting', 'Spring refresh'). Ship 8–12 weeks before peak so pins can index in time.",
    BEST_OF: "Curated 'best of' for a moment or context. Editorial voice. Cross-links to other product pages, not a dead-end.",
    REVIEWS_UGC: "Reviews / UGC gallery page. Shoppable images from customers. Great for the trust-and-conversion half of the funnel.",
    CURATED_SELECTION: "Editorial pick from the buyer or founder. Rotate quarterly. Storytelling copy, product proof.",
  };
  return [
    `PAGE PROPOSAL — "${title}"`,
    `Type: ${page_type.replace(/_/g, " ").toLowerCase()}`,
    ``,
    `WHY:`,
    `  ${typeGuidance[page_type]}`,
    ``,
    `SEO ANCHOR KEYWORDS (already have Pinterest volume — use verbatim in H1 + first paragraph):`,
    kwList,
    ``,
    `SUGGESTED URL SLUG:`,
    `  /collections/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)}`,
    ``,
    `MINIMUM CONTENT:`,
    `  - Hero image (2:3, no text overlay)`,
    `  - H1 + one paragraph containing the top 3 anchor keywords`,
    `  - Product grid or curated tiles (min 6 items, 12+ preferred)`,
    `  - Internal cross-links to at least 2 related pages`,
    ``,
    `TARGET LIVE DATE: ASAP — this URL is on the frequency plan.`,
  ].join("\n");
}

/** Produce N page proposals ranked by supporting-volume. */
export async function proposeExpansion(orgId: string, targetCount = 10): Promise<ProposedPage[]> {
  const pool = organicPool();

  // Group by cluster first — each cluster with cached-volume keywords
  // becomes one candidate page.
  const clusters = await pool.query<{
    cluster_id: string; cluster_name: string; axis: string;
    top_keywords: string[]; top_volumes: number[]; total_volume: number;
  }>(
    `WITH ranked AS (
       SELECT kc.id AS cluster_id, kc.name AS cluster_name, kc.axis::text,
              k.term, c.volume,
              ROW_NUMBER() OVER (PARTITION BY kc.id ORDER BY c.volume DESC NULLS LAST) AS rn
         FROM organic.keyword_clusters kc
         JOIN organic.keywords k ON k.cluster_id = kc.id
         LEFT JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE kc.org_id = $1
          AND c.volume IS NOT NULL AND c.volume > 0
     )
     SELECT cluster_id::text, cluster_name, axis,
            array_agg(term ORDER BY volume DESC) FILTER (WHERE rn <= 5)  AS top_keywords,
            array_agg(volume ORDER BY volume DESC) FILTER (WHERE rn <= 5) AS top_volumes,
            SUM(volume)::int AS total_volume
       FROM ranked GROUP BY cluster_id, cluster_name, axis
       ORDER BY total_volume DESC`, [orgId]
  );

  const proposals: ProposedPage[] = [];
  for (const row of clusters.rows) {
    const page_type = AXIS_TO_PAGE_TYPE[row.axis] ?? "CURATED_SELECTION";
    const kws = row.top_keywords.map((t, i) => ({ term: t, volume: row.top_volumes?.[i] ?? null }));
    const title = titleForCluster(row.cluster_name, page_type);
    proposals.push({
      title,
      page_type,
      supporting_keywords: kws.map((k) => k.term),
      supporting_keywords_volume: row.total_volume,
      brief: brief(page_type, title, kws),
    });
    if (proposals.length >= targetCount) break;
  }

  // If we still need more pages, propose seasonal ones from unassigned
  // SEASONAL keywords (not in a cluster).
  if (proposals.length < targetCount) {
    const seasonal = await pool.query<{ term: string; volume: number }>(
      `SELECT k.term, c.volume
         FROM organic.keywords k JOIN organic.keyword_volume_cache c ON c.term = k.term
        WHERE k.org_id = $1 AND k.seasonal_type = 'SEASONAL'::organic.seasonal_type
          AND k.cluster_id IS NULL AND c.volume IS NOT NULL AND c.volume > 0
        ORDER BY c.volume DESC LIMIT 10`, [orgId]
    );
    for (const s of seasonal.rows) {
      const title = `Seasonal edit — ${s.term}`;
      proposals.push({
        title, page_type: "SEASONAL_EDIT",
        supporting_keywords: [s.term], supporting_keywords_volume: s.volume,
        brief: brief("SEASONAL_EDIT", title, [{ term: s.term, volume: s.volume }]),
      });
      if (proposals.length >= targetCount) break;
    }
  }

  // Always include a REVIEWS/UGC page as a durable base for any client
  // that doesn't already have one.
  if (proposals.length < targetCount) {
    const title = "Customer reviews & UGC gallery";
    proposals.push({
      title, page_type: "REVIEWS_UGC",
      supporting_keywords: [], supporting_keywords_volume: 0,
      brief: brief("REVIEWS_UGC", title, []),
    });
  }

  return proposals;
}

function titleForCluster(clusterName: string, page_type: PageType): string {
  // Slightly opinionated wrap so the title reads as a landing page,
  // not as a cluster label.
  switch (page_type) {
    case "COLOR_CATEGORY":  return `${clusterName} — colour edit`;
    case "PRODUCT_TYPE":    return `Shop the ${clusterName}`;
    case "LENGTH_STYLE":    return `${clusterName} — sized selection`;
    case "MATERIAL":        return `${clusterName} — material story`;
    case "SEASONAL_EDIT":   return `${clusterName} — seasonal edit`;
    case "BEST_OF":         return `Best of ${clusterName}`;
    case "REVIEWS_UGC":     return clusterName;
    case "CURATED_SELECTION": return `${clusterName} — curated picks`;
    default:                return clusterName;
  }
}

// ---------- Persistence ------------------------------------------------------

export async function saveProposals(orgId: string, proposals: ProposedPage[]): Promise<string[]> {
  const pool = organicPool();
  const ids: string[] = [];
  for (const p of proposals) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO organic.url_expansion_proposals
         (org_id, proposed_title, page_type, supporting_keywords, supporting_keywords_volume, brief)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id::text`,
      [orgId, p.title, p.page_type, p.supporting_keywords, p.supporting_keywords_volume, p.brief]
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

export async function loadProposals(orgId: string) {
  const pool = organicPool();
  const r = await pool.query(
    `SELECT id::text, proposed_title, page_type, supporting_keywords, supporting_keywords_volume,
            brief, status, built_url, built_url_id::text, created_at::text, sent_to_client_at::text, built_at::text
       FROM organic.url_expansion_proposals
      WHERE org_id = $1 ORDER BY status, created_at DESC`, [orgId]
  );
  return r.rows;
}

export async function markProposalStatus(id: string, status: "PROPOSED"|"SENT_TO_CLIENT"|"BUILDING"|"BUILT"|"REJECTED", builtUrl?: string, builtUrlId?: string) {
  const pool = organicPool();
  const patch: Record<string, unknown> = { status };
  if (status === "SENT_TO_CLIENT") patch.sent_to_client_at = new Date().toISOString();
  if (status === "BUILT") { patch.built_at = new Date().toISOString(); if (builtUrl) patch.built_url = builtUrl; if (builtUrlId) patch.built_url_id = builtUrlId; }
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(`UPDATE organic.url_expansion_proposals SET ${sets} WHERE id = $1`, [id, ...keys.map((k) => patch[k])]);
}

/** Convenience: mark a proposal BUILT while also creating an
 *  organic.urls row so the new page immediately joins the pool.
 *  Returns the new url_id. */
export async function markProposalBuiltWithNewUrl(
  proposalId: string,
  builtUrl: string,
): Promise<string> {
  if (!/^https?:\/\//i.test(builtUrl)) throw new Error("built URL must start with http(s)://");
  const pool = organicPool();
  const prop = await pool.query<{ org_id: string; proposed_title: string; page_type: string }>(
    `SELECT org_id::text, proposed_title, page_type FROM organic.url_expansion_proposals WHERE id = $1`,
    [proposalId]
  );
  if (prop.rowCount === 0) throw new Error("proposal not found");
  const { org_id, proposed_title, page_type } = prop.rows[0];

  // Map page_type → url_type + a sensible funnel + reason.
  const urlType =
    page_type === "PRODUCT_TYPE"     ? "PRODUCT" :
    page_type === "COLOR_CATEGORY"   ? "COLLECTION" :
    page_type === "SEASONAL_EDIT"    ? "COLLECTION" :
    page_type === "MATERIAL"         ? "COLLECTION" :
    page_type === "LENGTH_STYLE"     ? "COLLECTION" :
    page_type === "BEST_OF"          ? "SELECTION" :
    page_type === "CURATED_SELECTION"? "SELECTION" :
    page_type === "REVIEWS_UGC"      ? "GALLERY" :
    "COLLECTION";
  const funnel = page_type === "REVIEWS_UGC" ? "BOTTOM" : page_type === "SEASONAL_EDIT" ? "TOP" : "MIDDLE";

  const insUrl = await pool.query<{ id: string }>(
    `INSERT INTO organic.urls (
       id, org_id, url, name, type, reason, reason_note,
       is_seasonal, funnel_stage, created_at
     ) VALUES (
       gen_random_uuid(), $1, $2, $3,
       $4::organic.url_type, 'NEW'::organic.url_reason,
       'Built from expansion proposal ' || $5::text,
       $6, $7::organic.funnel_stage, now()
     )
     ON CONFLICT (org_id, url) DO UPDATE SET name = EXCLUDED.name
     RETURNING id::text`,
    [org_id, builtUrl, proposed_title, urlType, proposalId, page_type === "SEASONAL_EDIT", funnel]
  );
  const urlId = insUrl.rows[0].id;

  await markProposalStatus(proposalId, "BUILT", builtUrl, urlId);
  return urlId;
}

// ---------- Verdict logic (P1.0.4 / P1.0.3 re-derivation) -------------------

export type ViabilityVerdictLevel = "STRONG_FIT" | "MODERATE_FIT" | "WEAK_FIT";

export interface ViabilityAssessment {
  requirement: UrlRequirement;
  buildable_pages: number;              // count of PROPOSED / SENT_TO_CLIENT / BUILDING proposals
  existing_plus_buildable: number;
  verdict_suggested: ViabilityVerdictLevel;
  reasoning: string;
}

export async function assessViability(orgId: string): Promise<ViabilityAssessment> {
  const req = await computeUrlRequirement(orgId);
  const pool = organicPool();
  const bld = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM organic.url_expansion_proposals
      WHERE org_id = $1 AND status IN ('PROPOSED','SENT_TO_CLIENT','BUILDING','BUILT')`, [orgId]
  );
  const buildable = bld.rows[0].n;
  const combined = req.existing_urls + buildable;

  let verdict: ViabilityVerdictLevel;
  let reasoning: string;
  if (req.existing_urls >= req.required_urls) {
    verdict = "STRONG_FIT";
    reasoning = `Existing URL inventory (${req.existing_urls}) meets or exceeds the requirement of ${req.required_urls}. Cycle plan is sustainable without expansion.`;
  } else if (combined >= req.required_urls) {
    verdict = "MODERATE_FIT";
    reasoning = `Existing URLs (${req.existing_urls}) fall short of the requirement of ${req.required_urls} by ${req.gap}, but ${buildable} expansion proposal(s) close the gap. Conditional pass — attach the expansion brief and confirm with the client before starting.`;
  } else {
    verdict = "WEAK_FIT";
    reasoning = `Existing URLs (${req.existing_urls}) + all currently proposed pages (${buildable}) still fall short of the requirement of ${req.required_urls}. Not viable at the target frequency until either the catalogue expands or the daily pin target is reduced.`;
  }

  return {
    requirement: req, buildable_pages: buildable,
    existing_plus_buildable: combined, verdict_suggested: verdict, reasoning,
  };
}
