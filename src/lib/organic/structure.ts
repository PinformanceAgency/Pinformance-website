/**
 * What the research says a choice should be, and what it costs to differ.
 *
 * THE RULE THIS ENFORCES — AND THE ONE IT REFUSES TO
 * --------------------------------------------------
 * The manager may always overrule. Nothing here blocks a save, disables a
 * control or rejects a choice. The media buyer regularly knows something
 * the research does not, and a tool that argues with them is a tool they
 * route around.
 *
 * What it will not allow is an *unmarked* departure. Three months later a
 * deliberate exception and a mistake look identical, and by then nobody
 * remembers which it was. So every deviation is named, together with the
 * research it contradicts, and it goes through.
 *
 * WHY THIS IS A SEPARATE MODULE
 * -----------------------------
 * Advice and checking are the same knowledge read in two directions: what
 * should be picked, and what it means that something else was. Splitting
 * them across the surfaces that need them is how the two drift apart until
 * the app suggests one thing and warns about another.
 */
import type { AccountBrief } from "./brief";

/* ------------------------------------------------------------------ */

export interface Deviation {
  /** Short label for the thing that differs. */
  what: string;
  /** Which piece of research it goes against, in the manager's words. */
  why: string;
  /** `structure` — departs from a documented rule of the method.
   *  `research` — departs from what this account's own research found. */
  kind: "structure" | "research";
}

export interface Advice<T> {
  /** What the research points at, best first. */
  suggested: T[];
  /** One line per suggestion, in the same order, saying why. */
  reasons: string[];
  /** Named gaps in the research this advice had to work around. */
  gaps: string[];
}

/* ------------------------------------------------------------------ *
 * Boards
 * ------------------------------------------------------------------ */

export interface BoardOption {
  id: string;
  name: string;
  topic_id: string | null;
  status: string | null;
  pin_count: number | null;
}

/**
 * Which boards a URL should go on.
 *
 * The method's rule is five or more, semantically relevant to the URL's
 * topic. On top of that the account's own research has two things to say:
 * the approved Steal List (board names competitors run that work) and the
 * Board Gap (what nobody covers), both from P2.2.2. A board matching either
 * is a stronger choice than one that merely shares the topic.
 */
export function adviseBoards(
  brief: AccountBrief,
  boards: BoardOption[],
  urlTopicId: string | null
): Advice<BoardOption> {
  const steal = brief.market.value?.steal_list ?? [];
  const gaps = brief.market.value?.board_gaps ?? [];
  // What this account has already proven, from organic.winning_combinations
  // — the phase-5 view over published pins and their performance. A board
  // that has carried a winner outranks any amount of theory about it.
  const provenClicks = new Map<string, number>();
  for (const p of brief.proven.value ?? []) {
    if (!p.board_name) continue;
    const k = p.board_name.toLowerCase();
    provenClicks.set(k, (provenClicks.get(k) ?? 0) + p.clicks + p.saves);
  }
  const noise = noiseWords(boards.map((b) => b.name));

  const scored = boards.map((b) => {
    const name = b.name.toLowerCase();
    const onTopic = urlTopicId != null && b.topic_id === urlTopicId;
    const isSteal = steal.some((s) => overlaps(name, s, noise));
    const isGap = gaps.some((g) => overlaps(name, g, noise));
    const proven = provenClicks.get(name) ?? 0;
    // Under ten pins a board gives the algorithm no context, so pinning
    // there under-distributes whatever lands on it (P1.2.9).
    const thin = (b.pin_count ?? 0) < 10;

    let score = 0;
    if (proven > 0) score += 4;
    if (onTopic) score += 3;
    if (isSteal) score += 2;
    if (isGap) score += 2;
    if (thin) score -= 2;

    const reason = [
      proven > 0 ? `has carried a winner here (${proven.toLocaleString("en-US")} clicks + saves)` : null,
      onTopic ? "same topic as the URL" : null,
      isSteal ? "on the approved Steal List" : null,
      isGap ? "covers an approved Board Gap" : null,
      thin ? "under 10 pins — thin context" : null,
    ].filter(Boolean).join(", ") || "no research signal either way";

    return { b, score, reason };
  });

  scored.sort((x, y) => y.score - x.score || x.b.name.localeCompare(y.b.name));

  return {
    suggested: scored.map((s) => s.b),
    reasons: scored.map((s) => s.reason),
    gaps: brief.market.known ? [] : [brief.market.why],
  };
}

export function checkBoards(
  brief: AccountBrief,
  chosen: BoardOption[],
  urlTopicId: string | null
): Deviation[] {
  const out: Deviation[] = [];

  if (chosen.length < 5) {
    out.push({
      kind: "structure",
      what: `${chosen.length} board${chosen.length === 1 ? "" : "s"} selected, the method asks for at least five`,
      why: "Fewer boards means the same design lands in fewer contexts, which is the whole point of the sixteen-pin rotation.",
    });
  }

  const offTopic = chosen.filter((b) => urlTopicId != null && b.topic_id !== urlTopicId);
  if (offTopic.length > 0 && urlTopicId != null) {
    out.push({
      kind: "structure",
      what: `${offTopic.length} board${offTopic.length === 1 ? " is" : "s are"} outside this URL's topic: ${offTopic.map((b) => b.name).join(", ")}`,
      why: "Semantic relevance is what the board contributes. Swimwear does not belong on a strapless bra board, even where both are lingerie (P4.1.7).",
    });
  }

  const thin = chosen.filter((b) => (b.pin_count ?? 0) < 10);
  if (thin.length > 0) {
    out.push({
      kind: "structure",
      what: `${thin.length} board${thin.length === 1 ? "" : "s"} under 10 pins: ${thin.map((b) => b.name).join(", ")}`,
      why: "A board with too few pins gives the algorithm no context, so everything pinned there under-distributes (P1.2.9).",
    });
  }

  const steal = brief.market.value?.steal_list ?? [];
  if (steal.length > 0) {
    const noise = noiseWords(chosen.map((b) => b.name));
    const used = chosen.some((b) => steal.some((s) => overlaps(b.name.toLowerCase(), s, noise)));
    if (!used) {
      out.push({
        kind: "research",
        what: "None of the approved Steal List boards are in this selection",
        why: `P2.2.2 approved these because competitors run them and they work: ${steal.join(", ")}.`,
      });
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Keywords
 * ------------------------------------------------------------------ */

export interface KeywordOption {
  id: string;
  term: string;
  type: string | null;
  volume: number | null;
  client_forbidden: boolean | null;
}

/**
 * Which keywords a URL should carry.
 *
 * The method's rule is at most five, a mix of short and long tail, from the
 * bank. The research adds two hard signals: a term the client vetoed in
 * P3.1.14 must not go on a pin at all, and a term the grid was run against
 * (P2.1.3) is one we actually know the market for — the design brief can
 * only set format and colour from a keyword that has a grid row.
 */
export function adviseKeywords(
  brief: AccountBrief,
  keywords: KeywordOption[]
): Advice<KeywordOption> {
  const gridded = new Set((brief.grid.value ?? []).map((g) => g.keyword.toLowerCase()));

  const scored = keywords
    .filter((k) => !k.client_forbidden)
    .map((k) => {
      const hasGrid = gridded.has(k.term.toLowerCase());
      const vol = k.volume ?? 0;
      let score = 0;
      if (hasGrid) score += 3;
      if (vol > 0) score += 1;
      const reason = [
        hasGrid ? "gridded — we know what page one rewards for it" : null,
        vol > 0 ? `volume ${vol.toLocaleString("en-US")}` : "no cached volume",
      ].filter(Boolean).join(", ");
      return { k, score, vol, reason };
    });

  scored.sort((x, y) => y.score - x.score || y.vol - x.vol);

  return {
    suggested: scored.map((s) => s.k),
    reasons: scored.map((s) => s.reason),
    gaps: brief.grid.known ? [] : [brief.grid.why],
  };
}

export function checkKeywords(
  brief: AccountBrief,
  chosen: KeywordOption[],
  primaryId: string | null
): Deviation[] {
  const out: Deviation[] = [];

  if (chosen.length > 5) {
    out.push({
      kind: "structure",
      what: `${chosen.length} keywords selected, the method caps a URL at five`,
      why: "Past five the pin stops being about anything in particular and Pinterest ranks it for none of them.",
    });
  }

  const forbidden = chosen.filter((k) => k.client_forbidden);
  if (forbidden.length > 0) {
    out.push({
      kind: "research",
      what: `Client-forbidden term${forbidden.length === 1 ? "" : "s"} selected: ${forbidden.map((k) => k.term).join(", ")}`,
      why: "P3.1.14 recorded these as terms the client does not want associated with the brand.",
    });
  }

  const primary = chosen.find((k) => k.id === primaryId);
  const gridded = new Set((brief.grid.value ?? []).map((g) => g.keyword.toLowerCase()));
  if (primary && brief.grid.known && !gridded.has(primary.term.toLowerCase())) {
    out.push({
      kind: "research",
      what: `No grid analysis for the primary keyword "${primary.term}"`,
      why: "Without a grid row the design brief falls back to the 80/20 default instead of what page one actually rewards for this term (P2.1.3).",
    });
  }

  const noVolume = chosen.filter((k) => k.volume == null);
  if (noVolume.length > 0) {
    out.push({
      kind: "structure",
      what: `${noVolume.length} keyword${noVolume.length === 1 ? " has" : "s have"} no cached volume: ${noVolume.map((k) => k.term).join(", ")}`,
      why: "A term with no volume reading may have no audience at all — it has not been through the P3.1 lookup.",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

export interface UrlOption {
  id: string;
  name: string;
  funnel_stage: string | null;
  is_seasonal: boolean | null;
  reason: string | null;
}

/**
 * Which URLs to run this cycle.
 *
 * The candidate list already filters on cooldown and board coverage. What
 * the research adds is preference: the client named their evergreen topics
 * and seasonal promotions in the intake (P1.1.1), and phase 5 recorded what
 * has actually worked on this account. Those beat an arbitrary pick from
 * whatever happens to be out of cooldown.
 */
export function adviseUrls(brief: AccountBrief, candidates: UrlOption[]): Advice<UrlOption> {
  const evergreen = brief.intake.value?.evergreen_topics ?? [];
  const seasonal = brief.intake.value?.seasonal_promos ?? [];
  const provenBoards = (brief.proven.value ?? []).map((p) => (p.board_name ?? "").toLowerCase());

  const noise = noiseWords(candidates.map((u) => u.name));
  const scored = candidates.map((u) => {
    const name = u.name.toLowerCase();
    const isEvergreen = evergreen.some((t) => overlaps(name, t, noise));
    const isSeasonal = seasonal.some((t) => overlaps(name, t, noise)) || u.is_seasonal === true;
    const nearProven = provenBoards.some((b) => b && overlaps(name, b, noise));

    let score = 0;
    if (isEvergreen) score += 2;
    if (isSeasonal) score += 2;
    if (nearProven) score += 3;

    const reason = [
      nearProven ? "close to something that has already won on this account" : null,
      isEvergreen ? "an evergreen topic the client named" : null,
      isSeasonal ? "seasonal — timing matters" : null,
    ].filter(Boolean).join(", ") || "out of cooldown, no research signal either way";

    return { u, score, reason };
  });

  scored.sort((x, y) => y.score - x.score || x.u.name.localeCompare(y.u.name));

  const gaps: string[] = [];
  if (!brief.intake.known) gaps.push(brief.intake.why);
  if (!brief.proven.known) gaps.push(brief.proven.why);

  return { suggested: scored.map((s) => s.u), reasons: scored.map((s) => s.reason), gaps };
}

export function checkUrls(brief: AccountBrief, chosen: UrlOption[]): Deviation[] {
  const out: Deviation[] = [];

  // The frequency plan is not advisory: it is what the retainer was priced
  // against, and it is what keeps every URL inside its cooldown.
  const target = brief.urls_per_month;
  if (target != null && chosen.length > 0 && chosen.length !== target) {
    out.push({
      kind: "structure",
      what: `${chosen.length} URLs selected, the frequency plan says ${target} a month`,
      why: chosen.length > target
        ? "Above the plan the URL pool runs dry and pages come back before their cooldown clears, competing with their own pins (P2.4.2)."
        : "Below the plan the account publishes less than the retainer was priced against (P2.4.2).",
    });
  }

  const stages = new Set(chosen.map((u) => u.funnel_stage).filter(Boolean));
  if (chosen.length >= 3 && stages.size === 1) {
    out.push({
      kind: "structure",
      what: `Every URL this cycle is ${[...stages][0]?.toLowerCase()} of funnel`,
      why: "The content bank is counted per funnel stage for a reason (P1.3.14) — a cycle at one stage only either earns reach with nowhere to convert, or converts to an audience nobody built.",
    });
  }

  const noReason = chosen.filter((u) => !u.reason);
  if (noReason.length > 0) {
    out.push({
      kind: "structure",
      what: `${noReason.length} URL${noReason.length === 1 ? " has" : "s have"} no selection reason recorded`,
      why: "P4.1.5 is mandatory: the reason is the only thing that makes next month's selection better than this one.",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */

/**
 * Loose containment either way, lowercased.
 *
 * Board names and client topics are written by different people at
 * different times — "Bridal" against "Bridal Inspiration 2", "Ring Stacking
 * Ideas" against "Everyday stacking". Exact matching finds none of those,
 * and the advice would then quietly have no research behind it.
 *
 * `noise` is what stops the shared-word fallback from matching everything.
 * On a jewellery account almost every board name contains "jewellery", so
 * "Gold jewellery Edit 5" matched the Steal List item "Jewellery Care &
 * Storage" and every board scored identically — advice that ranks
 * everything first ranks nothing. Words that appear across most of the
 * account's own board names are structural, not signal.
 */
function overlaps(a: string, b: string, noise?: Set<string>): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const words = (s: string) => s.split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !noise?.has(w));
  const wy = new Set(words(y));
  return words(x).some((w) => wy.has(w));
}

/**
 * The words this account uses everywhere, which therefore mean nothing.
 *
 * A word in more than a fifth of the names is how the account labels things
 * — the niche, the brand, a house convention — not what any one board is
 * about. On the demo store "jewellery" sits in a quarter of the board names,
 * and at a laxer cut every single board matched every Steal List item and
 * the ranking became noise.
 *
 * Erring strict is deliberate. A missed match costs one signal on a board
 * that still ranks on topic and on what it has proven. A false match costs
 * the whole ranking, because advice that puts everything first puts nothing
 * first.
 */
function noiseWords(names: string[]): Set<string> {
  if (names.length < 3) return new Set();
  const seen = new Map<string, number>();
  for (const n of names) {
    for (const w of new Set(n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4))) {
      seen.set(w, (seen.get(w) ?? 0) + 1);
    }
  }
  const cut = names.length / 5;
  return new Set([...seen].filter(([, c]) => c > cut).map(([w]) => w));
}
