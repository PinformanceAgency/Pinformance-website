/**
 * Welk sóórt creative een design is, en welke vier een cyclus zou moeten
 * dragen.
 *
 * Geen database hier, net als video.ts en automation.ts: de panelen in fase 4
 * zijn client-componenten en importeren deze labels, en pg mag niet in een
 * client bundle terechtkomen.
 *
 * **Één taxonomie** (Tristan, 22-09-2026). `grid_analyses` legt per keyword al
 * vast wat pagina één van Pinterest voor dat woord laat zien, in vijf vlaggen.
 * Die vijf zijn de eerste vijf formats, in dezelfde woorden, zodat het lezen
 * van het grid en het kiezen van onze eigen designs geen twee stelsels zijn.
 * FLATLAY en COLLAGE meet het grid niet; die kunnen dus alleen met de hand
 * gekozen worden en komen nooit uit een voorstel.
 *
 * De reden dat dit bestaat: de creatives waren kale productfoto's, en niemand
 * kon zien dát ze dat waren. Een format op het design maakt het zichtbaar
 * vóór publicatie, en maakt na publicatie de vraag beantwoordbaar of
 * infographics beter presteren dan productfoto's.
 */

export const CREATIVE_FORMATS = [
  "PRODUCT_SIMPLE",
  "INFOGRAPHIC",
  "LIFESTYLE",
  "TEXT_OVERLAY",
  "VIDEO",
  "FLATLAY",
  "COLLAGE",
  "OTHER",
] as const;

export type CreativeFormat = (typeof CREATIVE_FORMATS)[number];

/** Wat er op het scherm staat. Kort, want ze staan naast elkaar in een rij. */
export const FORMAT_LABEL: Record<CreativeFormat, string> = {
  PRODUCT_SIMPLE: "Product, plain",
  INFOGRAPHIC: "Infographic",
  LIFESTYLE: "Lifestyle",
  TEXT_OVERLAY: "Text overlay",
  VIDEO: "Video",
  FLATLAY: "Flatlay",
  COLLAGE: "Collage",
  OTHER: "Other",
};

/** Eén regel uitleg per format, voor de keuzelijst. */
export const FORMAT_HINT: Record<CreativeFormat, string> = {
  PRODUCT_SIMPLE: "the product on a plain background",
  INFOGRAPHIC: "numbers, steps or a comparison, drawn",
  LIFESTYLE: "the product in use, in a scene",
  TEXT_OVERLAY: "a photo with a headline over it, and a CTA",
  VIDEO: "an mp4 — only on the CLICK pin",
  FLATLAY: "shot from above, arranged",
  COLLAGE: "several images in one frame",
  OTHER: "none of these",
};

/** De vijf die het niche-grid meet, in de volgorde waarin het ze vastlegt. */
const GRID_FLAG_TO_FORMAT: Array<[string, CreativeFormat]> = [
  ["fmt_pure_aesthetic", "LIFESTYLE"],
  ["fmt_simple_pins", "PRODUCT_SIMPLE"],
  ["fmt_infographics", "INFOGRAPHIC"],
  ["fmt_text_heavy", "TEXT_OVERLAY"],
  ["fmt_video_916", "VIDEO"],
];

export interface GridFormatFlags {
  fmt_simple_pins?: boolean | null;
  fmt_infographics?: boolean | null;
  fmt_video_916?: boolean | null;
  fmt_pure_aesthetic?: boolean | null;
  fmt_text_heavy?: boolean | null;
}

/**
 * Wat pagina één voor dit keyword belóónt, in formats.
 *
 * Een mapping en geen vertaling: dit zijn dezelfde vijf dingen die Clarisse
 * aanvinkt als ze het grid leest (P2.1.3).
 */
export function formatsFromGrid(grid: GridFormatFlags | null): CreativeFormat[] {
  if (!grid) return [];
  const out: CreativeFormat[] = [];
  for (const [flag, format] of GRID_FLAG_TO_FORMAT) {
    if ((grid as Record<string, boolean | null | undefined>)[flag]) out.push(format);
  }
  return out;
}

export interface FormatSuggestion {
  design_number: number;
  intent: "SAVE" | "CLICK";
  format: CreativeFormat;
  /** Waarom dit format hier, in één regel. Een voorstel zonder reden is een
   *  zwarte doos, en dan wordt hij overgenomen zonder gelezen te zijn. */
  reason: string;
}

export interface FormatMix {
  suggestions: FormatSuggestion[];
  /** Waar het voorstel op staat: het grid van dit keyword, of de terugval. */
  basis: string;
  /** True als er geen gridrij voor dit keyword was. Dan is dit de methode uit
   *  het boek en niet wat deze niche laat zien — en dat hoort op het scherm. */
  is_fallback: boolean;
}

/**
 * Vier formats voor de vier designs van een cyclus.
 *
 * Twee regels van de methode staan hierboven en zijn niet van het grid:
 *
 *   - **D1 tot D3 zijn SAVE-pins en dragen geen tekstoverlay.** De build
 *     reference is expliciet: save is 2:3, lifestyle, nul overlay; de overlay
 *     en de CTA horen bij de CLICK-pin. Een grid dat vol tekst staat verandert
 *     dus wél hoe de CLICK-pin wordt getekend, maar maakt geen overlay van een
 *     save-pin. Dat is de fout die `splitFromGrid` ook niet maakt.
 *   - **D4 is de CLICK-pin**, dus TEXT_OVERLAY — of VIDEO, als daar een mp4 op
 *     staat, want dat is de enige plek waar video mag.
 *
 * Wat het grid wél doet is de drie save-pins kiezen: uit de formats die pagina
 * één voor dit keyword belóónt, in die volgorde, aangevuld met lifestyle.
 * INFOGRAPHIC mag op een save-pin — dat is geen overlay op een foto maar een
 * getekend format — en dat staat in de reden, zodat niemand er per ongeluk
 * tekst over een productfoto van maakt.
 */
export function proposeFormatMix(input: {
  gridFormats: CreativeFormat[];
  gridKeyword: string | null;
  /** Het designnummer dat al een video draagt, als er een is. */
  videoDesignNumber: number | null;
}): FormatMix {
  const { gridFormats, gridKeyword, videoDesignNumber } = input;
  const isFallback = gridFormats.length === 0;

  // Voor de save-pins: wat het grid beloont, zonder de overlay (die hoort bij
  // de click-pin) en zonder video (alleen D4).
  const saveCandidates: CreativeFormat[] = gridFormats.filter(
    (f) => f !== "TEXT_OVERLAY" && f !== "VIDEO"
  );
  // Aangevuld in de volgorde die de methode voorschrijft als het grid niets
  // zegt: lifestyle eerst, dan het product, dan een infographic.
  const filler: CreativeFormat[] = ["LIFESTYLE", "PRODUCT_SIMPLE", "INFOGRAPHIC"];
  const savePlan: CreativeFormat[] = [];
  for (const f of [...saveCandidates, ...filler]) {
    if (savePlan.length >= 3) break;
    if (!savePlan.includes(f)) savePlan.push(f);
  }

  const gridNote = gridKeyword
    ? `page one for "${gridKeyword}" rewards it`
    : "the grid rewards it";

  const suggestions: FormatSuggestion[] = savePlan.map((format, i) => ({
    design_number: i + 1,
    intent: "SAVE" as const,
    format,
    reason: isFallback
      ? format === "LIFESTYLE"
        ? "no grid reading for this keyword, so the method's default: 2:3 lifestyle, no text over it"
        : `no grid reading for this keyword — ${FORMAT_LABEL[format].toLowerCase()} keeps the four designs distinct`
      : saveCandidates.includes(format)
        ? format === "INFOGRAPHIC"
          ? `${gridNote} — keep the words inside the graphic, never as an overlay on a photo`
          : `${gridNote}`
        : `to keep the four distinct; the grid did not ask for it`,
  }));

  suggestions.push(
    videoDesignNumber === 4
      ? {
          design_number: 4,
          intent: "CLICK",
          format: "VIDEO",
          reason: "an mp4 is on this design, and the CLICK pin is the only one that takes video",
        }
      : {
          design_number: 4,
          intent: "CLICK",
          format: "TEXT_OVERLAY",
          reason:
            "the CLICK pin carries the overlay and the CTA — 9:16, and the only design where text " +
            "belongs over the image",
        }
  );

  return {
    suggestions,
    basis: isFallback
      ? "the method's own split — no grid reading for this URL's primary keyword yet (P2.1.3)"
      : `the grid reading for "${gridKeyword}": ${gridFormats.map((f) => FORMAT_LABEL[f].toLowerCase()).join(", ")}`,
    is_fallback: isFallback,
  };
}

/* ------------------------------------------------------------------ */
/* Resolutie en verhouding                                             */
/* ------------------------------------------------------------------ */

/** Wat de methode per intent vraagt — dezelfde maten die ratioForIntent()
 *  aan de beeldgenerator geeft. */
export const RATIO_FOR_INTENT: Record<string, { ratio: string; w: number; h: number }> = {
  SAVE: { ratio: "2:3", w: 1000, h: 1500 },
  CLICK: { ratio: "9:16", w: 1080, h: 1920 },
};

export interface DimensionVerdict {
  /** Niet blokkerend. Een waarschuwing die je kunt negeren is precies wat hier
   *  hoort: de manager mag altijd overrulen, en een pin tegenhouden op een
   *  ratio is een beslissing van een mens. */
  warnings: string[];
}

/**
 * Is dit bestand groot genoeg en van de juiste verhouding voor deze pin?
 *
 * Waarschuwt, weigert nooit. Twee dingen worden bekeken: de korte zijde tegen
 * wat de methode voor die intent vraagt (1000 px bij een save-pin, 1080 bij
 * een click-pin), en de verhouding. Een afwijking van meer dan vijf procent op
 * de ratio is met het oog te zien in de feed; daaronder is het ruis.
 */
export function checkDimensions(input: {
  intent: string;
  width: number | null;
  height: number | null;
}): DimensionVerdict {
  const { intent, width, height } = input;
  const want = RATIO_FOR_INTENT[intent] ?? RATIO_FOR_INTENT.SAVE;
  const warnings: string[] = [];
  if (!width || !height) return { warnings };

  if (width < want.w || height < want.h) {
    warnings.push(
      `${width}×${height} is under the ${want.w}×${want.h} a ${intent === "CLICK" ? "click" : "save"} ` +
      `pin should be. Pinterest upscales it and it reads soft in the feed.`
    );
  }
  const wanted = want.w / want.h;
  const actual = width / height;
  if (Math.abs(actual - wanted) / wanted > 0.05) {
    warnings.push(
      `${width}×${height} is not ${want.ratio} (${actual.toFixed(2)} against ${wanted.toFixed(2)}). ` +
      `Pinterest crops to fit, so the edges of the design can disappear.`
    );
  }
  return { warnings };
}
