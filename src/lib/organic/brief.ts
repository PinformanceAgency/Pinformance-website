/**
 * Everything the account knows about itself, in one object.
 *
 * WHY THIS EXISTS
 * ---------------
 * Phases 1 to 3 are three months of research. Phase 4 was reading four
 * values out of it: the keywords, three hex codes, the brand rules and the
 * three-by-three from the taste graph. Everything else was captured and
 * never read again — the grid's format findings, the competitor exports,
 * the approved Steal List, the intake, the potential rating.
 *
 * The cause was structural rather than anyone forgetting. Each downstream
 * feature wrote its own queries against whichever tables its author had in
 * mind, so the amount of research reaching a decision was however much that
 * one author happened to remember. The next feature would do the same and
 * leave the same things behind.
 *
 * So there is one loader. Every decision downstream — the design brief,
 * board assignment, URL selection, copy and image prompts — reads from this
 * rather than querying research tables itself. Adding a research input to a
 * decision becomes a field on an object somebody is already holding, which
 * is the only version of this that survives the next six features.
 *
 * ABSENCE IS EXPLICIT
 * -------------------
 * Every section is nullable and says why it is missing, per the provenance
 * contract. A store with no grid analysis must not silently receive the
 * defaults of a store that has one — that is how a hardcoded 80/20 split
 * ends up looking like a considered decision for 40 accounts.
 */
import { organicPool } from "./db";

/* ------------------------------------------------------------------ */

/** Present, or absent with the reason a reader needs. */
export type Known<T> = { value: T; known: true } | { value: null; known: false; why: string };

const known = <T>(value: T): Known<T> => ({ value, known: true });
const absent = <T>(why: string): Known<T> => ({ value: null, known: false, why });

/** What page one looked like for one seed keyword (P2.1.2 / P2.1.3). */
export interface GridFinding {
  keyword: string;
  /** The formats that dominate page one, most useful first. */
  dominant_formats: string[];
  has_visible_ctas: boolean | null;
  /** NONE | MINIMAL | HALF | MOST | ALL — how many top pins carry text. */
  text_overlay_bucket: string | null;
  look_and_feel: string | null;
  colors: string[];
}

export interface AccountBrief {
  org_id: string;
  name: string;
  niche: string | null;
  domain: string | null;
  daily_pin_target: number | null;
  urls_per_month: number | null;

  /** P1.0.4 — how much room the account has, and the reasoning. */
  potential: Known<{ rating: string; rationale: string | null }>;
  /** P1.1.1 — what the client told us about themselves. */
  intake: Known<{
    products_services: string | null;
    ideal_audience: string | null;
    brand_personality: string | null;
    evergreen_topics: string[];
    seasonal_promos: string[];
    best_performing_content: string | null;
    primary_goals: string[];
  }>;
  /** P1.1.6 — the brand book, turned into rules. */
  brand: Known<{
    positioning: string | null;
    tone_descriptors: string[];
    brand_pillars: string[];
    never_include: string[];
    banned_words: string[];
    approved_ctas: string[];
    dominant_colors: string[];
    typography: string | null;
  }>;
  /** P2.3.3 — the three-by-three the whole content plan hangs off. */
  taste: Known<{ content_angles: string[]; visual_worlds: string[]; key_moments: string[] }>;
  /** P2.1.3 / P2.1.4 — one per seed keyword. */
  grid: Known<GridFinding[]>;
  /** P2.1.5 / P2.4.1 — who we are up against and how fast they publish. */
  competitors: Known<Array<{ name: string | null; handle: string | null; niche_fit: string | null; pins_per_day: number | null }>>;
  /** P2.2.2 — only the items a human approved. */
  market: Known<{ steal_list: string[]; board_gaps: string[]; content_angles: string[] }>;
  /** P5.2.2 — what has actually worked on this account so far. */
  proven: Known<Array<{ board_name: string | null; intent: string | null; route: string | null; clicks: number; saves: number }>>;
}

/* ------------------------------------------------------------------ */

const FORMAT_LABELS: Array<[keyof GridRow, string]> = [
  ["fmt_pure_aesthetic", "pure aesthetic / lifestyle"],
  ["fmt_simple_pins", "simple product pins"],
  ["fmt_text_heavy", "text-heavy"],
  ["fmt_infographics", "infographics"],
  ["fmt_video_916", "9:16 video"],
];

interface GridRow {
  target_keyword: string;
  fmt_simple_pins: boolean | null;
  fmt_infographics: boolean | null;
  fmt_video_916: boolean | null;
  fmt_pure_aesthetic: boolean | null;
  fmt_text_heavy: boolean | null;
  has_visible_ctas: boolean | null;
  text_overlay_bucket: string | null;
  look_and_feel: string | null;
  hex_1: string | null;
  hex_2: string | null;
  hex_3: string | null;
}

/**
 * A Postgres array column, whatever shape node-pg hands it over in.
 *
 * A `text[]` arrives as a JS array. An array of a CUSTOM enum does not —
 * node-pg has no parser registered for that type OID, so it arrives as the
 * raw literal `{TRAFFIC,SALES}` and `.filter` throws. The queries below cast
 * those columns to text[] for exactly this reason; this stays defensive
 * because the next enum array added upstream will not remember to.
 */
function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter(Boolean) as string[];
  if (typeof v === "string" && v.startsWith("{")) {
    return v.slice(1, -1).split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

export async function loadAccountBrief(orgId: string): Promise<AccountBrief | null> {
  const pool = organicPool();

  const [org, settings, viability, intake, brand, taste, grid, comps, market, proven] =
    await Promise.all([
      pool.query<{ name: string }>(`SELECT name FROM public.organizations WHERE id = $1`, [orgId]),
      pool.query(
        `SELECT niche, domain, daily_pin_target, urls_per_month
           FROM organic.client_settings WHERE org_id = $1`, [orgId]),
      pool.query<{ verdict: string | null; rationale: string | null }>(
        `SELECT verdict::text AS verdict, rationale
           FROM organic.client_viability WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT products_services, ideal_audience, brand_personality, evergreen_topics,
                seasonal_promos, best_performing_content, primary_goals::text[] AS primary_goals
           FROM organic.client_intake WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT positioning, tone_descriptors, brand_pillars, never_include,
                banned_words, approved_ctas, dominant_colors, asset_locations
           FROM organic.brand_rules WHERE org_id = $1`, [orgId]),
      pool.query(
        `SELECT content_angles, visual_worlds, key_moments
           FROM organic.taste_graph WHERE org_id = $1`, [orgId]),
      pool.query<GridRow>(
        `SELECT target_keyword, fmt_simple_pins, fmt_infographics, fmt_video_916,
                fmt_pure_aesthetic, fmt_text_heavy, has_visible_ctas,
                text_overlay_bucket, look_and_feel, hex_1, hex_2, hex_3
           FROM organic.grid_analyses WHERE org_id = $1 ORDER BY target_keyword`, [orgId]),
      pool.query(
        `SELECT name, handle, niche_fit, pins_per_day_4mo
           FROM organic.competitors WHERE org_id = $1 ORDER BY pins_per_day_4mo DESC NULLS LAST`, [orgId]),
      // Only what a human approved. A rejected Steal List item reaching the
      // board plan would make the review step decorative.
      pool.query<{ kind: string; title: string }>(
        `SELECT kind, title FROM organic.market_analysis_items
          WHERE org_id = $1 AND status = 'APPROVED'`, [orgId]),
      pool.query(
        `SELECT board_name, intent::text AS intent, route::text AS route,
                total_clicks, total_saves
           FROM organic.winning_combinations WHERE org_id = $1
          ORDER BY total_clicks DESC NULLS LAST LIMIT 20`, [orgId]),
    ]);

  if (org.rowCount === 0) return null;
  const s = settings.rows[0];

  const v = viability.rows[0];
  const i = intake.rows[0];
  const b = brand.rows[0];
  const t = taste.rows[0];

  return {
    org_id: orgId,
    name: org.rows[0].name,
    niche: s?.niche ?? null,
    domain: s?.domain ?? null,
    daily_pin_target: s?.daily_pin_target ?? null,
    urls_per_month: s?.urls_per_month ?? null,

    potential: v?.verdict
      ? known({ rating: v.verdict, rationale: v.rationale })
      : absent("P1.0.4 not recorded — the account's potential has not been assessed"),

    intake: i
      ? known({
          products_services: i.products_services ?? null,
          ideal_audience: i.ideal_audience ?? null,
          brand_personality: i.brand_personality ?? null,
          evergreen_topics: arr(i.evergreen_topics),
          seasonal_promos: arr(i.seasonal_promos),
          best_performing_content: i.best_performing_content ?? null,
          primary_goals: arr(i.primary_goals),
        })
      : absent("P1.1.1 not returned — the client has not filled in the questionnaire"),

    brand: b
      ? known({
          positioning: b.positioning ?? null,
          tone_descriptors: arr(b.tone_descriptors),
          brand_pillars: arr(b.brand_pillars),
          never_include: arr(b.never_include),
          banned_words: arr(b.banned_words),
          approved_ctas: arr(b.approved_ctas),
          dominant_colors: arr(b.dominant_colors),
          typography: (b.asset_locations as { typography?: string } | null)?.typography ?? null,
        })
      : absent("P1.1.6 not collected — no brand book, so nothing constrains colour or tone"),

    taste: t
      ? known({
          content_angles: arr(t.content_angles),
          visual_worlds: arr(t.visual_worlds),
          key_moments: arr(t.key_moments),
        })
      : absent("P2.3.3 not done — no angles, worlds or moments to build against"),

    grid: grid.rowCount
      ? known(grid.rows.map(toFinding))
      : absent("P2.1.3 not recorded — we do not know what Pinterest rewards for these keywords"),

    competitors: comps.rowCount
      ? known(comps.rows.map((c) => ({
          name: c.name ?? null,
          handle: c.handle ?? null,
          niche_fit: c.niche_fit ?? null,
          pins_per_day: c.pins_per_day_4mo ?? null,
        })))
      : absent("P2.1.5 not done — no competitor set for this account"),

    market: market.rowCount
      ? known({
          steal_list: market.rows.filter((r) => r.kind === "STEAL_LIST").map((r) => r.title),
          board_gaps: market.rows.filter((r) => r.kind === "BOARD_GAP").map((r) => r.title),
          content_angles: market.rows.filter((r) => r.kind === "CONTENT_ANGLE").map((r) => r.title),
        })
      : absent("P2.2.2 has no approved items — the AI analysis was not run or nothing was approved"),

    proven: proven.rowCount
      ? known(proven.rows.map((p) => ({
          board_name: p.board_name ?? null,
          intent: p.intent ?? null,
          route: p.route ?? null,
          clicks: Number(p.total_clicks ?? 0),
          saves: Number(p.total_saves ?? 0),
        })))
      : absent("no cycle has been reviewed yet — nothing is proven on this account"),
  };
}

function toFinding(g: GridRow): GridFinding {
  return {
    keyword: g.target_keyword,
    dominant_formats: FORMAT_LABELS.filter(([k]) => g[k] === true).map(([, label]) => label),
    has_visible_ctas: g.has_visible_ctas,
    text_overlay_bucket: g.text_overlay_bucket,
    look_and_feel: g.look_and_feel,
    colors: [g.hex_1, g.hex_2, g.hex_3].filter(Boolean) as string[],
  };
}

/* ------------------------------------------------------------------ *
 * Grid → production settings
 * ------------------------------------------------------------------ */

/**
 * How the split between save pins and click pins follows the grid.
 *
 * The split used to be a constant: 80% save, 20% click, for every account
 * and every keyword. Meanwhile P2.1.2 exists purely to go and look at what
 * page one rewards for that keyword, and P2.1.3 records the answer. Not
 * reading it back made both tasks busywork.
 *
 * `text_overlay_bucket` is how many of the top fifteen to twenty pins carry
 * text. Text-carrying pins are click pins; clean lifestyle pins are save
 * pins. So the market's own share is the starting point — which is the
 * "fitting in beats standing out" rule from P4.2.1, applied with numbers
 * instead of by feel.
 *
 * The floor and the cap are not decoration. All save pins earns reach and
 * sends nobody anywhere; all click pins gets traffic that never compounds.
 * Neither end is ever correct, whatever page one looks like.
 */
const CLICK_SHARE_BY_OVERLAY: Record<string, number> = {
  NONE: 10,     // floor — never zero click pins
  MINIMAL: 20,
  HALF: 40,
  MOST: 55,
  ALL: 65,      // cap — never abandon save pins
};

/** The bucket as a phrase that reads in a sentence. */
const OVERLAY_PHRASE: Record<string, string> = {
  NONE: "none of the top pins",
  MINIMAL: "very few of the top pins",
  HALF: "about half the top pins",
  MOST: "most of the top pins",
  ALL: "nearly every top pin",
};

export interface ProductionSplit {
  save_split_pct: number;
  click_split_pct: number;
  /** Why it is these numbers, in one line the designer can read. */
  basis: string;
}

export function splitFromGrid(finding: GridFinding | null): ProductionSplit {
  const bucket = finding?.text_overlay_bucket ?? null;
  const click = bucket ? CLICK_SHARE_BY_OVERLAY[bucket] : undefined;

  if (click === undefined) {
    return {
      save_split_pct: 80,
      click_split_pct: 20,
      basis: finding
        ? "No text-overlay reading on the grid for this keyword, so the 80/20 default applies."
        : "No grid analysis for this keyword (P2.1.3), so the 80/20 default applies rather than the market's own share.",
    };
  }
  const phrase = OVERLAY_PHRASE[bucket!] ?? bucket!.toLowerCase();
  // Say "matches the default" when it does. Claiming a contrast that is not
  // there is how a reader learns to stop trusting the explanation.
  const tail =
    click === 20
      ? "which lands on the same 80/20 the default would have used."
      : `so the split follows the market at ${100 - click}/${click} rather than the 80/20 default.`;
  return {
    save_split_pct: 100 - click,
    click_split_pct: click,
    basis: `Page one for "${finding!.keyword}" carries text on ${phrase}, ${tail}`,
  };
}

/** The format guidance for one keyword, written from what the grid saw. */
export function formatNotesFromGrid(finding: GridFinding | null, split: ProductionSplit): string {
  const lines: string[] = [];
  if (finding && finding.dominant_formats.length > 0) {
    lines.push(`Page one is dominated by ${finding.dominant_formats.join(", ")}.`);
  }
  if (finding?.has_visible_ctas === true) {
    lines.push("Competing pins carry visible CTAs — the click pins should too.");
  } else if (finding?.has_visible_ctas === false) {
    lines.push("No visible CTAs on page one; a loud CTA will stand out for the wrong reason.");
  }
  if (finding?.look_and_feel) {
    lines.push(`Look and feel: ${finding.look_and_feel}`);
  }
  lines.push(
    `${split.save_split_pct}% save pins (2:3 lifestyle, no text), ` +
    `${split.click_split_pct}% click pins (9:16 with keyword-front text + CTA). ${split.basis}`
  );
  return lines.join(" ");
}
