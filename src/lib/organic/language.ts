/**
 * Which language every AI-generated surface writes in, for one store.
 *
 * WHY THIS IS A SETTING AND NOT A GUESS
 * -------------------------------------
 * May Cosmetics, 16-09-2026: inside a single cycle, two of the four copy
 * sets came back in Dutch and two in English. No prompt in the app had ever
 * named a language, so each call inferred one from whatever context weighed
 * most that time — the brand book, the primary keyword, the intake prose.
 * Four calls, four independent inferences, and nothing on any screen said
 * which language the store writes in. A client reading their own pins is
 * the first place that shows up.
 *
 * ABSENCE IS NAMED, NOT DEFAULTED SILENTLY
 * ----------------------------------------
 * `primary_language` is nullable and an unset store falls back to English —
 * deterministic, which is the fix — but `is_default` travels with the value
 * so the design brief can list it under gaps and the settings and cycle
 * screens can say "not set for this store". Same contract as everything
 * else in provenance.ts: a store with no brand book must not be
 * indistinguishable from one whose brand book says English.
 *
 * KEYWORDS ARE NOT TRANSLATED
 * ---------------------------
 * The one rule that needs stating in every prompt. The keyword bank holds
 * what people actually type into Pinterest, and in a Dutch market plenty of
 * those terms are English ("skincare routine", "lipgloss"). A model told to
 * write Dutch will otherwise helpfully translate the primary keyword out of
 * the title, which is the one word the title has to open with — and the
 * validator would then reject four drafts in a row for a reason nobody
 * could see.
 */

export interface WritingLanguage {
  /** ISO-639-1 as stored. */
  code: string;
  /** What the prompt calls it. */
  label: string;
  /** ISO-3166-1 alpha-2, or null when nobody set a market. */
  market: string | null;
  market_label: string | null;
  /** True when no language was chosen for this store and English is standing in. */
  is_default: boolean;
}

export const ORGANIC_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "da", label: "Danish" },
  { code: "sv", label: "Swedish" },
  { code: "nb", label: "Norwegian" },
  { code: "pl", label: "Polish" },
];

export const ORGANIC_MARKETS: ReadonlyArray<{ code: string; label: string }> = [
  { code: "NL", label: "Netherlands" },
  { code: "BE", label: "Belgium" },
  { code: "DE", label: "Germany" },
  { code: "AT", label: "Austria" },
  { code: "CH", label: "Switzerland" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "PT", label: "Portugal" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DK", label: "Denmark" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "PL", label: "Poland" },
];

const LANGUAGE_LABEL = new Map(ORGANIC_LANGUAGES.map((l) => [l.code, l.label]));
const MARKET_LABEL = new Map(ORGANIC_MARKETS.map((m) => [m.code, m.label]));

/** The fallback, in one place, so every surface agrees on what "not set" means. */
export const DEFAULT_LANGUAGE_CODE = "en";

export function writingLanguage(row: {
  primary_language?: string | null;
  market_country?: string | null;
} | null | undefined): WritingLanguage {
  const raw = (row?.primary_language ?? "").trim().toLowerCase();
  const code = raw || DEFAULT_LANGUAGE_CODE;
  const market = (row?.market_country ?? "").trim().toUpperCase() || null;
  return {
    code,
    // An unknown code is still honoured — better a prompt that says "write
    // in fi" than one that quietly writes English because the list here is
    // short.
    label: LANGUAGE_LABEL.get(code) ?? code,
    market,
    market_label: market ? MARKET_LABEL.get(market) ?? market : null,
    is_default: raw === "",
  };
}

/** One line for a screen: "Dutch · Netherlands" / "English (not set)". */
export function languageSummary(l: WritingLanguage): string {
  const base = l.market_label ? `${l.label} · ${l.market_label}` : l.label;
  return l.is_default ? `${base} — not set for this store` : base;
}

/**
 * The block every generation prompt carries, first, before the brand
 * context. First on purpose: the model reads it as the frame everything
 * else sits in rather than as one requirement among twenty.
 */
/** "in the Netherlands", not "in Netherlands". The dropdown reads better
 *  without the article; a sentence in a prompt reads worse. */
function inMarket(label: string): string {
  return /^(Netherlands|United Kingdom|United States)$/.test(label) ? `the ${label}` : label;
}

export function languageDirective(l: WritingLanguage): string {
  const lines = [
    `LANGUAGE — write every word of the output in ${l.label}.` +
      (l.market_label ? ` The reader is in ${inMarket(l.market_label)}; use that market's spelling, date and price conventions.` : ""),
    `Do not mix languages inside one piece of copy, and do not switch language between one output and the next.`,
    `Keywords are the exception: use every keyword given below EXACTLY as it is written, even where it is in another language. ` +
      `Those are the terms people actually search for, and translating one breaks the search match the whole pin is built on.`,
    `Brand names, product names and the store's own wording stay as the brand writes them.`,
  ];
  return lines.join("\n");
}

/**
 * The same thing for an image model.
 *
 * Deliberately different: an image prompt is a machine instruction and stays
 * in English, because that is what every image model is trained on and a
 * Dutch prompt measurably degrades the result. What the market changes is
 * who is in the picture and what the setting looks like — and any text that
 * ends up rendered has to be in the store's language, which is why it is
 * said here rather than left to the copy step.
 */
export function imageAudienceDirective(l: WritingLanguage): string {
  const who = l.market_label ? inMarket(l.market_label) : `${l.label}-speaking`;
  return (
    `Audience: ${who}. Write the prompt itself in English — it is an instruction to an image model — but ` +
    `everything it describes should read as native to that market (people, interiors, seasons, styling). ` +
    `The image carries no text; any wording is added later, in ${l.label}.`
  );
}
