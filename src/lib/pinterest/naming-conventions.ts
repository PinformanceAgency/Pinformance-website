/**
 * Parsers for Pinformance naming conventions on Pinterest campaigns,
 * ad groups, and ads. Source of truth: Pinformance - Naming Conventions.docx.
 *
 * Names are pipe-delimited (`A | B | C | ...`). Token positions vary between
 * campaigns (e.g. the catalog slot can be absent), so we identify each token
 * by *matching against a known enum* rather than by index. Tokens we can't
 * classify go in `unknown` so the UI can surface naming-hygiene issues.
 */

// ---------- Campaign ----------

export type Country = "US" | "NL" | "BE" | "AU" | "AT" | "CA" | "DE" | "UK" | "FR" | "ES" | "IT";
export type Catalog = "CAT" | "NON_CAT";
export type PerformancePlus = "P+" | "NP+";
export type Funnel = "PROSP" | "RET";
export type Strategy = "TEST" | "HERO" | "CATG";
export type Objective = "CONV" | "ROAS";

export interface CampaignParsed {
  raw: string;
  country: Country | null;
  catalog: Catalog | null;
  performancePlus: PerformancePlus | null;
  funnel: Funnel | null;
  strategy: Strategy | null;
  /** When strategy === "CATG" the category slot may carry a literal category like "WATCHES". */
  strategyCategory: string | null;
  objective: Objective | null;
  unknown: string[];
}

const COUNTRY_SET = new Set<Country>([
  "US", "NL", "BE", "AU", "AT", "CA", "DE", "UK", "FR", "ES", "IT",
]);

function splitTokens(name: string): string[] {
  return name
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function normalize(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

function isCountry(t: string): t is Country {
  return COUNTRY_SET.has(t.toUpperCase() as Country);
}

function isPerfPlus(t: string): t is PerformancePlus {
  const u = t.toUpperCase();
  return u === "P+" || u === "NP+";
}

function isFunnel(t: string): t is Funnel {
  const u = t.toUpperCase();
  return u === "PROSP" || u === "RET" || u === "PROSPECTING" || u === "RETARGETING";
}

function normalizeFunnel(t: string): Funnel | null {
  const u = t.toUpperCase();
  if (u === "PROSP" || u === "PROSPECTING") return "PROSP";
  if (u === "RET" || u === "RETARGETING") return "RET";
  return null;
}

function isStrategy(t: string): boolean {
  const u = t.toUpperCase();
  return u === "TEST" || u === "HERO" || u === "CATG";
}

function isObjective(t: string): boolean {
  const u = t.toUpperCase();
  return u === "CONV" || u === "CONVERSION" || u === "ROAS";
}

function normalizeObjective(t: string): Objective | null {
  const u = t.toUpperCase();
  if (u === "CONV" || u === "CONVERSION") return "CONV";
  if (u === "ROAS") return "ROAS";
  return null;
}

function isCatalog(t: string): boolean {
  return t.toUpperCase() === "CAT";
}

/**
 * Parse a campaign name into typed dimensions. Position-tolerant.
 *
 * When the strategy slot contains an unrecognized category-style token
 * (e.g. "WATCHES" in `DE | CAT | P+ | PROSP | WATCHES | ROAS`), it's
 * interpreted as `strategy: "CATG"` with `strategyCategory` set.
 */
export function parseCampaignName(name: string): CampaignParsed {
  const tokens = splitTokens(name);
  const out: CampaignParsed = {
    raw: name,
    country: null,
    catalog: null,
    performancePlus: null,
    funnel: null,
    strategy: null,
    strategyCategory: null,
    objective: null,
    unknown: [],
  };

  // First pass: classify the unambiguous tokens.
  const leftover: string[] = [];
  for (const tok of tokens) {
    const t = normalize(tok);
    if (!out.country && isCountry(t)) {
      out.country = t.toUpperCase() as Country;
      continue;
    }
    if (!out.catalog && isCatalog(t)) {
      out.catalog = "CAT";
      continue;
    }
    if (!out.performancePlus && isPerfPlus(t)) {
      out.performancePlus = t.toUpperCase() as PerformancePlus;
      continue;
    }
    if (!out.funnel && isFunnel(t)) {
      out.funnel = normalizeFunnel(t);
      continue;
    }
    if (!out.strategy && isStrategy(t)) {
      out.strategy = t.toUpperCase() as Strategy;
      continue;
    }
    if (!out.objective && isObjective(t)) {
      out.objective = normalizeObjective(t);
      continue;
    }
    leftover.push(t);
  }

  // Second pass: anything left that LOOKS like a category (alpha-only, not a
  // common stop-token) becomes the strategyCategory (implies CATG). Other
  // leftovers go to `unknown` for the hygiene badge.
  for (const t of leftover) {
    if (!out.strategyCategory && /^[A-Za-z][A-Za-z0-9 _-]*$/.test(t)) {
      out.strategyCategory = t;
      if (!out.strategy) out.strategy = "CATG";
      continue;
    }
    out.unknown.push(t);
  }

  // If catalog wasn't explicitly tagged AND the rest of the campaign parses
  // cleanly, treat it as NON_CAT. (CAT is explicit; absence == non-catalog.)
  if (!out.catalog && out.country) out.catalog = "NON_CAT";

  return out;
}

// ---------- Ad Group ----------

export type Gender = "F" | "M" | "ALL";

export interface AdGroupParsed {
  raw: string;
  gender: Gender | null;
  age: string | null; // free-form: 18+, 18-24, 25-34, 18-34, ...
  funnel: Funnel | null; // ad groups sometimes carry PROSP/RET too
  audience: string | null; // Broad, ATC_L180, View_L180, Eng_L90, Purchase_L180, ACL_1-5, or copied name
  category: string | null; // Swim, Bra, BestSellers, Mixed, Shapewear, ...
  unknown: string[];
}

const GENDER_SET = new Set(["F", "M", "ALL"]);
function isGender(t: string): boolean {
  return GENDER_SET.has(t.toUpperCase());
}
function isAge(t: string): boolean {
  return /^\d{2}(\+|-\d{2})$/.test(t);
}
const KNOWN_AUDIENCES = new Set([
  "BROAD",
  "ATC_L180",
  "VIEW_L180",
  "ENG_L90",
  "PURCHASE_L180",
]);
function isKnownAudience(t: string): boolean {
  const u = t.toUpperCase();
  if (KNOWN_AUDIENCES.has(u)) return true;
  // ACL_1-5, ACL_2-7, etc.
  if (/^ACL_\d+-\d+$/i.test(t)) return true;
  // _L<days> retention windows (anything matching the pattern)
  if (/_L\d+$/i.test(t)) return true;
  return false;
}

export function parseAdGroupName(name: string): AdGroupParsed {
  const tokens = splitTokens(name);
  const out: AdGroupParsed = {
    raw: name,
    gender: null,
    age: null,
    funnel: null,
    audience: null,
    category: null,
    unknown: [],
  };

  const leftover: string[] = [];
  for (const tok of tokens) {
    const t = normalize(tok);
    if (!out.gender && isGender(t)) {
      out.gender = t.toUpperCase() as Gender;
      continue;
    }
    if (!out.age && isAge(t)) {
      out.age = t;
      continue;
    }
    if (!out.funnel && isFunnel(t)) {
      out.funnel = normalizeFunnel(t);
      continue;
    }
    if (!out.audience && isKnownAudience(t)) {
      out.audience = t;
      continue;
    }
    leftover.push(t);
  }

  // Heuristic: the last alpha token tends to be the category.
  for (let i = leftover.length - 1; i >= 0; i--) {
    const t = leftover[i];
    if (!out.category && /^[A-Za-z][A-Za-z0-9 _-]*$/.test(t)) {
      out.category = t;
      leftover.splice(i, 1);
      break;
    }
  }
  // Anything still leftover that doesn't fit any slot → if no audience was
  // matched, the first remaining token is treated as a copied audience name.
  if (!out.audience && leftover.length > 0) {
    out.audience = leftover.shift()!;
  }
  out.unknown = leftover;

  return out;
}

// ---------- Ad ----------

export type Format = "VIDEO" | "STATIC" | "CAROUSEL" | "COLLECTION";
export type AdContentType = "ORGANIC" | "AD";
export type CreatorType = "UGC" | "SHOOT" | "GRAPHIC" | "FOUNDER" | "INFLUENCER" | "BRAND";
export type LpType = "PRODUCT" | "COLLECTION" | "PAGE";

export interface AdParsed {
  raw: string;
  launchDate: string | null; // YYYY-MM-DD when DDMMYY can be parsed; otherwise null
  format: Format | null;
  contentType: AdContentType | null;
  creatorType: CreatorType | null;
  category: string | null;
  productOrHook: string | null;
  offer: string | null; // BAU, 2FOR1, 20OFF, BOGO, Bundle
  lpType: LpType | null;
  version: string | null; // V1, V2, BATCH 123
  unknown: string[];
}

const FORMAT_SET = new Set(["VIDEO", "STATIC", "CAROUSEL", "COLLECTION"]);
const CREATOR_SET = new Set(["UGC", "SHOOT", "GRAPHIC", "FOUNDER", "INFLUENCER", "BRAND"]);
const CONTENT_TYPE_SET = new Set(["ORGANIC", "AD"]);
const KNOWN_OFFERS = new Set(["BAU", "2FOR1", "BOGO", "BUNDLE"]);

function isFormat(t: string): boolean {
  return FORMAT_SET.has(t.toUpperCase());
}
function isCreator(t: string): boolean {
  return CREATOR_SET.has(t.toUpperCase());
}
function isContentType(t: string): boolean {
  return CONTENT_TYPE_SET.has(t.toUpperCase());
}
function isOffer(t: string): boolean {
  const u = t.toUpperCase();
  if (KNOWN_OFFERS.has(u)) return true;
  // Patterns like "20OFF", "15OFF", "50PCTOFF"
  if (/^\d+(PCT)?OFF$/i.test(t)) return true;
  return false;
}
function isLpType(t: string): boolean {
  return ["/PRODUCT", "/COLLECTION", "/PAGE"].includes(t.toUpperCase());
}
function lpFromToken(t: string): LpType | null {
  const u = t.toUpperCase();
  if (u === "/PRODUCT") return "PRODUCT";
  if (u === "/COLLECTION") return "COLLECTION";
  if (u === "/PAGE") return "PAGE";
  return null;
}
function isVersion(t: string): boolean {
  return /^V\d+$/i.test(t) || /^BATCH\s*\d+$/i.test(t);
}
function isDdmmyy(t: string): boolean {
  return /^\d{6}$/.test(t);
}
function ddmmyyToIso(t: string): string | null {
  if (!isDdmmyy(t)) return null;
  const dd = t.slice(0, 2);
  const mm = t.slice(2, 4);
  const yy = t.slice(4, 6);
  const year = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  const d = Number(dd);
  const m = Number(mm);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${year}-${mm}-${dd}`;
}

export function parseAdName(name: string): AdParsed {
  const tokens = splitTokens(name);
  const out: AdParsed = {
    raw: name,
    launchDate: null,
    format: null,
    contentType: null,
    creatorType: null,
    category: null,
    productOrHook: null,
    offer: null,
    lpType: null,
    version: null,
    unknown: [],
  };

  const leftover: string[] = [];
  for (const tok of tokens) {
    const t = normalize(tok);
    if (!out.launchDate && isDdmmyy(t)) {
      out.launchDate = ddmmyyToIso(t);
      continue;
    }
    if (!out.format && isFormat(t)) {
      out.format = t.toUpperCase() as Format;
      continue;
    }
    if (!out.contentType && isContentType(t)) {
      out.contentType = t.toUpperCase() as AdContentType;
      continue;
    }
    if (!out.creatorType && isCreator(t)) {
      out.creatorType = t.toUpperCase() as CreatorType;
      continue;
    }
    if (!out.offer && isOffer(t)) {
      out.offer = t.toUpperCase();
      continue;
    }
    if (!out.lpType && isLpType(t)) {
      out.lpType = lpFromToken(t);
      continue;
    }
    if (!out.version && isVersion(t)) {
      out.version = t.toUpperCase();
      continue;
    }
    leftover.push(t);
  }

  // After classifying, the first remaining alpha token = category, second = product/hook.
  // This matches the framework: `... | Category | Product/Hook | ...`.
  const alpha = leftover.filter((t) => /^[A-Za-z][A-Za-z0-9 _-]*$/.test(t));
  if (alpha.length > 0) {
    out.category = alpha[0];
    if (alpha.length > 1) out.productOrHook = alpha.slice(1).join(" | ");
  }

  // Anything alpha that we used is accounted for; anything non-alpha leftover
  // is genuinely unknown.
  const usedAlpha = new Set(alpha);
  out.unknown = leftover.filter((t) => !usedAlpha.has(t));

  return out;
}

// ---------- Hygiene helpers (UI badge) ----------

export interface HygieneCounts {
  campaignsUnknown: number;
  adGroupsUnknown: number;
  adsUnknown: number;
  /** Names of items that had at least one unknown token. Truncated upstream if needed. */
  offenders: { kind: "campaign" | "ad_group" | "ad"; name: string; tokens: string[] }[];
}

export function hygieneFromParses(
  campaigns: CampaignParsed[],
  adGroups: AdGroupParsed[],
  ads: AdParsed[]
): HygieneCounts {
  const offenders: HygieneCounts["offenders"] = [];
  let campaignsUnknown = 0;
  let adGroupsUnknown = 0;
  let adsUnknown = 0;
  for (const c of campaigns) {
    if (c.unknown.length > 0) {
      campaignsUnknown++;
      offenders.push({ kind: "campaign", name: c.raw, tokens: c.unknown });
    }
  }
  for (const g of adGroups) {
    if (g.unknown.length > 0) {
      adGroupsUnknown++;
      offenders.push({ kind: "ad_group", name: g.raw, tokens: g.unknown });
    }
  }
  for (const a of ads) {
    if (a.unknown.length > 0) {
      adsUnknown++;
      offenders.push({ kind: "ad", name: a.raw, tokens: a.unknown });
    }
  }
  return { campaignsUnknown, adGroupsUnknown, adsUnknown, offenders };
}
