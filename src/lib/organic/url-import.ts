/**
 * Where the URL pool comes from (P4.1.1).
 *
 * `organic.urls` had exactly one writer: `upsertUrl`, called when somebody
 * typed a URL in by hand. So the candidate list on every real store was
 * empty, and the first task of the production engine — "browse the URLs you
 * may use this month" — had nothing to browse. Seventeen rows existed
 * agency-wide, all of them from seed scripts.
 *
 * Two sources, because they answer different questions:
 *
 *   fromSitemap()  — what pages exist at all. One fetch fills the pool.
 *   fromTopPins()  — which pages Pinterest has already rewarded. Far
 *                    smaller, far more valuable, and it is what P1.2.14
 *                    collects by hand in phase 1.
 *
 * Neither writes. Both return proposals with a reason, and the manager
 * confirms — the selection is a judgement, and an importer that inserted
 * three thousand URLs would bury the twenty that matter under them.
 *
 * GA4 and Search Console are the third source and are deliberately absent:
 * they need an OAuth grant per client that the organic app does not have
 * yet. Adding a half-wired third source would make the other two look
 * unreliable when it returned nothing.
 */
import { organicPool } from "./db";
import { pinterestClientForOrg } from "@/lib/pinterest/for-org";
import { sanitiseUrl, type UrlInput } from "./phase4";

export type UrlType = UrlInput["type"];

export interface ProposedUrl {
  url: string;
  name: string;
  type: UrlType;
  reason: UrlInput["reason"];
  /** Why this one is worth the manager's attention. Shown per row. */
  note: string;
  /** Already in the pool. Kept in the list, greyed, rather than dropped. */
  already_known: boolean;
  /** From Pinterest only. */
  proven_clicks?: number;
  proven_saves?: number;
}

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

/**
 * Path patterns, most specific first.
 *
 * Shopify and WooCommerce cover almost every client here; anything that
 * matches nothing lands as SELECTION, which is the type whose overlay rule
 * is the safe one (overlay on). Guessing PRODUCT wrongly is the expensive
 * mistake — that is the only type that publishes without a text overlay.
 */
const PATTERNS: Array<[RegExp, UrlType]> = [
  [/\/(products?|item)\//i, "PRODUCT"],
  [/\/(collections?|category|product-category|shop)\//i, "COLLECTION"],
  [/\/(blogs?|news|journal|articles?|magazine)\//i, "BLOG"],
  [/\/(lookbook|gallery|inspiration|edit)s?\//i, "GALLERY"],
  [/\/pages?\//i, "SELECTION"],
];

/** Paths that are never worth a pin, whatever the sitemap says. */
const EXCLUDE = [
  /\/(cart|checkout|account|login|register|search|orders?)\b/i,
  /\/(policies|policy|terms|privacy|shipping|returns?|faq|contact|about)\b/i,
  // `collections/frontpage` is Shopify's default homepage collection — the
  // homepage under another path, and the method forbids homepage pins.
  /\/(collections\/all|collections\/frontpage|products\.json|sitemap)\b/i,
  /\.(xml|json|pdf|jpg|jpeg|png|webp|gif|svg|css|js)$/i,
];

export function classifyUrl(raw: string): UrlType | null {
  let path: string;
  try {
    const u = new URL(raw);
    path = u.pathname;
    // The method forbids homepage pins outright, and there is a CHECK
    // constraint on organic.urls to match. Filter here so the import does
    // not propose something the database will refuse.
    if (path === "/" || path === "") return null;
  } catch {
    return null;
  }
  if (EXCLUDE.some((re) => re.test(path))) return null;
  for (const [re, type] of PATTERNS) if (re.test(path)) return type;
  return "SELECTION";
}

/**
 * Locale-prefixed paths are the same page.
 *
 * A Shopify sitemap lists `/products/x`, `/nl-nl/products/x` and
 * `/en-nl/products/x` as three entries. They are one page, and importing
 * all three is worse than a duplicate: each carries its own 60-day URL
 * cooldown, so the method's central protection against pinning the same
 * page twice in a month is silently defeated three ways.
 *
 * Only a clear locale (`nl-nl`, `en-gb`) is stripped on sight. A bare
 * two-letter segment is ambiguous — it could be a real path — so it is only
 * treated as a locale when an unprefixed sibling exists to prove it.
 */
const CLEAR_LOCALE = /^[a-z]{2}-[a-z]{2}$/i;
const MAYBE_LOCALE = /^[a-z]{2}$/i;

function canonicalKey(raw: string): string {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length > 1 && (CLEAR_LOCALE.test(parts[0]) || MAYBE_LOCALE.test(parts[0]))) {
      return `${u.host}/${parts.slice(1).join("/")}`;
    }
    return `${u.host}/${parts.join("/")}`;
  } catch {
    return raw;
  }
}

function localePrefix(raw: string): string | null {
  try {
    const parts = new URL(raw).pathname.split("/").filter(Boolean);
    if (parts.length > 1 && (CLEAR_LOCALE.test(parts[0]) || MAYBE_LOCALE.test(parts[0]))) {
      return parts[0].toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Collapse locale variants to one page.
 *
 * Keeps the unprefixed URL when there is one — that is the canonical page
 * the client links everywhere else. Without one, an unambiguous locale wins
 * over a bare two-letter segment, and otherwise the shortest URL does.
 */
function collapseLocales(items: ProposedUrl[]): { kept: ProposedUrl[]; collapsed: number } {
  const groups = new Map<string, ProposedUrl[]>();
  for (const p of items) {
    const k = canonicalKey(p.url);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }

  const kept: ProposedUrl[] = [];
  let collapsed = 0;

  for (const variants of groups.values()) {
    if (variants.length === 1) { kept.push(variants[0]); continue; }
    const ranked = [...variants].sort((a, b) => {
      const ap = localePrefix(a.url), bp = localePrefix(b.url);
      if (!ap && bp) return -1;
      if (ap && !bp) return 1;
      // A page already in the pool wins over one that is not — re-importing
      // must not propose a second row for a URL that already exists.
      if (a.already_known !== b.already_known) return a.already_known ? -1 : 1;
      return a.url.length - b.url.length;
    });
    const others = ranked.length - 1;
    collapsed += others;
    kept.push({
      ...ranked[0],
      note: `${ranked[0].note} · ${others} locale variant${others === 1 ? "" : "s"} folded in`,
    });
  }
  return { kept, collapsed };
}

/** A readable name from the last path segment. */
export function nameFromUrl(raw: string): string {
  try {
    const seg = new URL(raw).pathname.split("/").filter(Boolean).pop() ?? "";
    const words = decodeURIComponent(seg)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (!words) return raw;
    return words.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 120);
  } catch {
    return raw.slice(0, 120);
  }
}

/* ------------------------------------------------------------------ */
/* Source 1 — the sitemap                                              */
/* ------------------------------------------------------------------ */

const MAX_SITEMAP_FILES = 12;
const MAX_URLS = 4000;
const FETCH_TIMEOUT_MS = 15_000;

async function fetchText(url: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { "user-agent": "Pinformance/1.0 (+organic url import)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Sitemaps are machine-generated and the only thing we want out of them is
// <loc>. A regex is the right tool here; an XML parser would be a
// dependency for one tag.
const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

function locs(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(LOC)) out.push(m[1]);
  return out;
}

/**
 * Read the client's sitemap and propose everything pinnable in it.
 *
 * Follows a sitemap index one level down, which is how Shopify ships them
 * (`sitemap.xml` → `sitemap_products_1.xml`, `sitemap_collections_1.xml`, …).
 */
export async function fromSitemap(
  orgId: string,
  opts: { sitemapUrl?: string; limit?: number } = {}
): Promise<{
  proposals: ProposedUrl[];
  scanned: number;
  pinnable: number;
  locale_variants_folded: number;
  source: string;
}> {
  const pool = organicPool();

  let root = opts.sitemapUrl;
  if (!root) {
    const s = await pool.query<{ domain: string | null }>(
      `SELECT domain FROM organic.client_settings WHERE org_id = $1`, [orgId]
    );
    const domain = s.rows[0]?.domain?.trim();
    if (!domain) {
      throw new Error("No domain on this store yet — set it in client settings, or pass a sitemap URL");
    }
    root = /^https?:\/\//i.test(domain) ? `${domain.replace(/\/$/, "")}/sitemap.xml`
                                        : `https://${domain.replace(/\/$/, "")}/sitemap.xml`;
  }

  const rootXml = await fetchText(root);
  const rootLocs = locs(rootXml);

  // A sitemap index lists sitemaps; a sitemap lists pages. Telling them
  // apart by the tag is more reliable than by the file name.
  const isIndex = /<sitemapindex/i.test(rootXml);
  let pageUrls: string[] = [];
  if (isIndex) {
    for (const child of rootLocs.slice(0, MAX_SITEMAP_FILES)) {
      try {
        pageUrls.push(...locs(await fetchText(child)));
      } catch {
        // One unreachable child sitemap must not lose the others.
      }
      if (pageUrls.length >= MAX_URLS) break;
    }
  } else {
    pageUrls = rootLocs;
  }
  pageUrls = pageUrls.slice(0, MAX_URLS);

  const known = await knownUrls(orgId);
  const seen = new Set<string>();
  const proposals: ProposedUrl[] = [];

  for (const raw of pageUrls) {
    const type = classifyUrl(raw);
    if (!type) continue;
    let cleaned: string;
    try {
      cleaned = sanitiseUrl(raw).cleaned;
    } catch {
      continue; // shortener, or otherwise refused
    }
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    proposals.push({
      url: cleaned,
      name: nameFromUrl(cleaned),
      type,
      reason: "NEW",
      note: `${type.toLowerCase()} page from the sitemap`,
      already_known: known.has(cleaned),
    });
  }

  const { kept, collapsed } = collapseLocales(proposals);

  // Unknown first, then by type so the list reads in groups rather than in
  // whatever order the sitemap happened to be written.
  const order: Record<UrlType, number> = {
    PRODUCT: 0, COLLECTION: 1, GALLERY: 2, BLOG: 3, SELECTION: 4,
  };
  kept.sort((a, b) =>
    Number(a.already_known) - Number(b.already_known) ||
    order[a.type] - order[b.type] ||
    a.name.localeCompare(b.name)
  );

  const limit = opts.limit ?? 500;
  return {
    proposals: kept.slice(0, limit),
    scanned: pageUrls.length,
    pinnable: kept.length,
    locale_variants_folded: collapsed,
    source: root,
  };
}

/* ------------------------------------------------------------------ */
/* Source 2 — what Pinterest already rewards                           */
/* ------------------------------------------------------------------ */

const TOP_PIN_SAMPLE = 40;

/**
 * The destination URLs of this account's best-performing organic pins.
 *
 * Smaller than the sitemap and worth more: these are pages Pinterest has
 * already decided it likes, which is exactly what P4.1.1 is supposed to
 * lead with in month one and what P5.2 feeds back in every month after.
 */
export async function fromTopPins(
  orgId: string,
  opts: { days?: number } = {}
): Promise<{ proposals: ProposedUrl[]; pins_read: number }> {
  const days = Math.min(opts.days ?? 90, 89);
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const { client } = await pinterestClientForOrg(orgId);
  const top = await client.getTopPins(
    start, end, "OUTBOUND_CLICK",
    ["IMPRESSION", "SAVE", "OUTBOUND_CLICK"],
    "ORGANIC"
  );
  const pins = (top?.pins ?? []).slice(0, TOP_PIN_SAMPLE);

  const known = await knownUrls(orgId);
  const byUrl = new Map<string, { clicks: number; saves: number; n: number }>();

  for (const p of pins) {
    let link: string | null = null;
    try {
      const full = await client.getPin(p.pin_id);
      link = full?.link ?? null;
    } catch {
      continue; // a deleted pin is not an error worth stopping for
    }
    if (!link) continue;
    let cleaned: string;
    try {
      cleaned = sanitiseUrl(link).cleaned;
    } catch {
      continue;
    }
    if (!classifyUrl(cleaned)) continue;

    const agg = byUrl.get(cleaned) ?? { clicks: 0, saves: 0, n: 0 };
    agg.clicks += Number(p.metrics?.OUTBOUND_CLICK ?? 0);
    agg.saves += Number(p.metrics?.SAVE ?? 0);
    agg.n += 1;
    byUrl.set(cleaned, agg);
  }

  const proposals: ProposedUrl[] = [...byUrl.entries()]
    .map(([url, m]) => ({
      url,
      name: nameFromUrl(url),
      type: classifyUrl(url)!,
      reason: "BEST_PERFORMER" as const,
      note: `${m.clicks.toLocaleString("en-US")} clicks / ${m.saves.toLocaleString("en-US")} saves ` +
            `across ${m.n} pin${m.n === 1 ? "" : "s"} in the last ${days} days`,
      already_known: known.has(url),
      proven_clicks: m.clicks,
      proven_saves: m.saves,
    }))
    .sort((a, b) => (b.proven_clicks ?? 0) - (a.proven_clicks ?? 0));

  return { proposals, pins_read: pins.length };
}

/* ------------------------------------------------------------------ */

async function knownUrls(orgId: string): Promise<Set<string>> {
  const r = await organicPool().query<{ url: string }>(
    `SELECT url FROM organic.urls WHERE org_id = $1`, [orgId]
  );
  return new Set(r.rows.map((x) => x.url));
}

/**
 * Confirm a selection into the pool.
 *
 * Runs through `upsertUrl`, so the reason enum, the shortener refusal and
 * the utm stripping all apply exactly as they do to a hand-typed URL —
 * there is no second, laxer path into this table.
 */
export async function acceptProposals(
  orgId: string,
  chosen: Array<Pick<ProposedUrl, "url" | "name" | "type" | "reason">>
): Promise<{ added: number; ids: string[]; errors: Array<{ url: string; message: string }> }> {
  const { upsertUrl } = await import("./phase4");
  const ids: string[] = [];
  const errors: Array<{ url: string; message: string }> = [];
  for (const c of chosen) {
    try {
      ids.push(await upsertUrl(orgId, {
        url: c.url,
        name: c.name,
        type: c.type,
        reason: c.reason,
        reason_note: "Imported from the sitemap or from Pinterest's top pins",
      }));
    } catch (e) {
      errors.push({ url: c.url, message: (e as Error).message });
    }
  }
  return { added: ids.length, ids, errors };
}
