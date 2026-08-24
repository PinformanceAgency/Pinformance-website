/**
 * Viability gate — P1.0.1 through P1.0.4.
 *
 * Writes converge on organic.client_viability (one row per org, upserted).
 * Each of the four tasks logs its own time_spent_min via completeTaskByDefinition.
 */
import { organicPool } from "./db";
import { completeTaskByDefinition, recomputeAfter } from "./complete";
import { computeUrlRequirement } from "./expansion";
import type { ViabilityRow, ViabilityVerdict } from "./types";

export interface GoodFitPayload {
  visual_first: boolean;
  more_than_5_products: boolean;
  url_volume: boolean;
  high_aov: boolean;
  existing_assets: boolean;
  longterm_mindset: boolean;
  time_spent_min: number;
  notes?: string | null;
}

export interface RedFlagsPayload {
  rf_technical_b2b: boolean;
  rf_local_only: boolean;
  rf_single_landing: boolean;
  rf_needs_sales_now: boolean;
  rf_low_effort_ds: boolean;
  rf_restricted_niche: boolean;
  time_spent_min: number;
  notes?: string | null;
}

export interface VerdictPayload {
  verdict: ViabilityVerdict;
  rationale: string;
  time_spent_min: number;
  notes?: string | null;
}

async function ensureViabilityRow(orgId: string): Promise<void> {
  await organicPool().query(
    `INSERT INTO organic.client_viability (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
    [orgId]
  );
}

/** P1.0.1 — six good-fit signals. */
export async function saveGoodFit(orgId: string, p: GoodFitPayload) {
  await ensureViabilityRow(orgId);
  await organicPool().query(
    `UPDATE organic.client_viability
        SET visual_first = $1, more_than_5_products = $2, url_volume = $3,
            high_aov = $4, existing_assets = $5, longterm_mindset = $6,
            assessed_at = now()
      WHERE org_id = $7`,
    [p.visual_first, p.more_than_5_products, p.url_volume, p.high_aov,
     p.existing_assets, p.longterm_mindset, orgId]
  );
  await completeTaskByDefinition({
    orgId, taskId: "P1.0.1", timeSpentMin: p.time_spent_min, notes: p.notes,
  });
  return recomputeAfter(orgId);
}

/** P1.0.2 — six red-flag signals. */
export async function saveRedFlags(orgId: string, p: RedFlagsPayload) {
  await ensureViabilityRow(orgId);
  await organicPool().query(
    `UPDATE organic.client_viability
        SET rf_technical_b2b = $1, rf_local_only = $2, rf_single_landing = $3,
            rf_needs_sales_now = $4, rf_low_effort_ds = $5, rf_restricted_niche = $6,
            assessed_at = now()
      WHERE org_id = $7`,
    [p.rf_technical_b2b, p.rf_local_only, p.rf_single_landing,
     p.rf_needs_sales_now, p.rf_low_effort_ds, p.rf_restricted_niche, orgId]
  );
  await completeTaskByDefinition({
    orgId, taskId: "P1.0.2", timeSpentMin: p.time_spent_min, notes: p.notes,
  });
  return recomputeAfter(orgId);
}

/** P1.0.3 — AUTO. Fetch the site's sitemap(s), count product/collection/blog URLs. */
export async function countSitemapUrls(orgId: string, rawDomain: string, timeSpentMin = 1) {
  const domain = normalizeDomain(rawDomain);
  const total = await fetchAndCount(domain);

  await ensureViabilityRow(orgId);
  await organicPool().query(
    `UPDATE organic.client_viability
        SET total_urls_found = $1, assessed_at = now()
      WHERE org_id = $2`,
    [total, orgId]
  );
  // Persist the domain on client_settings for later AUTO tasks that need it.
  await organicPool().query(
    `UPDATE organic.client_settings SET domain = $1, updated_at = now() WHERE org_id = $2`,
    [domain, orgId]
  );
  // New: compare against REQUIRED URLs, not the old hardcoded "10".
  // The requirement is derived from daily_pin_target + spacing_hours +
  // per-client url_cooldown_days (Phase 2 frequency × Phase 3 cooldown).
  const req = await computeUrlRequirement(orgId);
  const under_requirement = total < req.required_urls;

  await completeTaskByDefinition({
    orgId, taskId: "P1.0.3", timeSpentMin,
    notes: `Sitemap yielded ${total} URLs; requirement ${req.required_urls} (daily=${req.daily_pin_target}, cooldown=${req.cooldown_days}d, waterfall=${req.waterfall_duration_days}d).`,
  });
  const recomputed = await recomputeAfter(orgId);
  return {
    total_urls_found: total, domain,
    required_urls: req.required_urls,
    under_requirement,
    /** deprecated: kept for the old phase-1 form that still reads it */
    under_threshold: under_requirement,
    requirement: req,
    recomputed,
  };
}

/** P1.0.4 — verdict + rationale. This is the gate for the rest of phase 1. */
export async function saveVerdict(orgId: string, p: VerdictPayload) {
  await ensureViabilityRow(orgId);
  await organicPool().query(
    `UPDATE organic.client_viability
        SET verdict = $1::organic.viability_verdict, rationale = $2, assessed_at = now()
      WHERE org_id = $3`,
    [p.verdict, p.rationale, orgId]
  );
  await completeTaskByDefinition({
    orgId, taskId: "P1.0.4", timeSpentMin: p.time_spent_min, notes: p.notes,
  });
  return recomputeAfter(orgId);
}

// ----- sitemap plumbing ------------------------------------------------------

function normalizeDomain(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new Error(`invalid domain: ${input}`);
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, redirect: "follow" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchAndCount(origin: string): Promise<number> {
  // Try common sitemap locations in order.
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
  ];

  const seenUrls = new Set<string>();
  const visitedSitemaps = new Set<string>();
  const queue: string[] = [];

  for (const c of candidates) {
    const body = await fetchText(c);
    if (body) { queue.push(c); break; }
  }

  // If no root sitemap responded, try robots.txt.
  if (queue.length === 0) {
    const robots = await fetchText(`${origin}/robots.txt`);
    if (robots) {
      for (const line of robots.split(/\r?\n/)) {
        const m = line.match(/^\s*sitemap:\s*(\S+)/i);
        if (m) queue.push(m[1]);
      }
    }
  }

  while (queue.length > 0 && visitedSitemaps.size < 30) {
    const sm = queue.shift()!;
    if (visitedSitemaps.has(sm)) continue;
    visitedSitemaps.add(sm);
    const body = await fetchText(sm);
    if (!body) continue;

    // Nested sitemaps
    for (const m of body.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)) {
      queue.push(m[1].trim());
    }
    // Actual URLs
    for (const m of body.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)) {
      seenUrls.add(m[1].trim());
    }
  }

  return seenUrls.size;
}

// ----- read helper -----------------------------------------------------------

export async function loadViability(orgId: string): Promise<ViabilityRow | null> {
  const r = await organicPool().query<ViabilityRow>(
    `SELECT org_id::text, visual_first, more_than_5_products, url_volume,
            high_aov, existing_assets, longterm_mindset,
            rf_technical_b2b, rf_local_only, rf_single_landing,
            rf_needs_sales_now, rf_low_effort_ds, rf_restricted_niche,
            total_urls_found, verdict::text AS verdict, rationale, assessed_at
       FROM organic.client_viability WHERE org_id = $1`,
    [orgId]
  );
  return r.rows[0] ?? null;
}
