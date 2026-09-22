// Alle vaste tekst van het deck, per taal.
//
// De pitch draait op twee adressen: /pitch is Nederlands, /pitch/en is
// Engels. Eén canvas, één opmaak, twee woordenboeken. De inhoud van de
// secties staat niet hier maar in data.ts (Nederlands) en en.ts (Engels),
// omdat die per sectie loopt; hier staat wat de schermen zelf zeggen.
//
// Regel voor beide talen: geen em-dashes in tekst die op het scherm komt.

export type Lang = "nl" | "en";

export interface Strings {
  /** Op elke kaart op het canvas. */
  card: { eyebrow: string; cta: string };
  /** Het blok links in een geopende sectie. */
  modal: { whatsThere: string; close: string; brandArt: string };
  /** De knoppen rechtsonder en de tabbalk. */
  toolbar: {
    present: string;
    draw: string;
    zoomOut: string;
    zoomIn: string;
    fit: string;
    prev: string;
    next: string;
    otherLanguage: string;
  };
  carousel: { prev: string; next: string; slide: (i: number, n: number) => string };
  cases: { paid: string; organic: string; group: string };
  calc: {
    questionsTitle: string;
    questionsLead: string;
    q1: string;
    q2Roas: string;
    q2Cpa: string;
    q3: string;
    roasHint: string;
    cpaHint: string;
    minHintRoas: string;
    minHintCpa: string;
    minPlaceholderRoas: string;
    minPlaceholderCpa: string;
    adspendPlaceholder: string;
    try: string;
    show: string;
    missing: (items: string[]) => string;
    missingRoas: string;
    missingCpa: string;
    missingAdspend: string;
    guaranteesTitle: string;
    guaranteesLead: string;
    labelGuarantee: string;
    labelSetup: string;
    labelInvoicing: string;
    setupHeadline: (fee: string) => string;
    invoicingHeadline: string;
    minRoas: (v: string) => string;
    maxCpa: (v: string) => string;
    notFilledIn: string;
    offerTitle: string;
    offerLeadRoas: (spend: string, roas: string) => string;
    offerLeadCpa: (spend: string, cpa: string) => string;
    editAnswers: string;
    hitRoas: string;
    hitCpa: string;
    hitSub: string;
    missed: string;
    missedSub: string;
    capNote: (cap: string) => string;
    brackets: string;
    atSpend: (spend: string) => string;
    baseFee: string;
    total: string;
    totalCapped: string;
    chartTitle: string;
    chartLead: (spend: string) => string;
    axisSpend: string;
    axisFee: string;
    tooltipFee: string;
    tooltipSpend: string;
    impliesRevenue: (v: string) => string;
    impliesOrders: (v: string) => string;
  };
  fig: {
    usersPerMarket: string;
    vsMeta: string;
    markets: { nlbe: string; de: string; us: string; world: string };
    millions: string;
    firstWeeks: string;
    twelveMonths: string;
    learning: string;
    perDay: string;
    scaleWhenRoas: string;
    week: (n: number) => string;
    month: (n: number) => string;
    budgetAria: string;
    bandAria: string;
    pricing: {
      once: string;
      setup: string;
      setupLead: string;
      monthly: string;
      base: string;
      baseLead: string;
      onResult: string;
      performance: string;
      performanceLead: string;
      performanceItems: string[];
    };
    doc: { head: string; brand: string };
  };
}

const nl: Strings = {
  card: { eyebrow: "Sectie", cta: "Klik om te openen →" },
  modal: { whatsThere: "Wat er staat", close: "Sluiten", brandArt: "Merkbeeld" },
  toolbar: {
    present: "Presenteren / navigeren",
    draw: "Tekenen",
    zoomOut: "Uitzoomen",
    zoomIn: "Inzoomen",
    fit: "Alles in beeld",
    prev: "Vorige",
    next: "Volgende",
    otherLanguage: "EN",
  },
  carousel: {
    prev: "Vorige",
    next: "Volgende",
    slide: (i, n) => `Beeld ${i} van ${n}`,
  },
  cases: { paid: "Paid", organic: "Organic", group: "Paid of organic" },
  calc: {
    questionsTitle: "Eerst drie vragen",
    questionsLead:
      "Het aanbod rekent met jouw antwoorden, niet met een aanname van ons.",
    q1: "01 · Waarop sturen we",
    q2Roas: "02 · Welke ROAS heb je minimaal nodig?",
    q2Cpa: "02 · Welke CPA mag het maximaal zijn?",
    q3: "03 · Ad spend per maand",
    roasHint: "Omzet gedeeld door spend. Voor de meeste merken.",
    cpaHint: "Kosten per order. Bij abonnementen en hoge LTV.",
    minHintRoas: "Het getal waarop jouw merk winstgevend is",
    minHintCpa: "De CPA waarop jouw merk winstgevend is",
    minPlaceholderRoas: "bijv. 3,5",
    minPlaceholderCpa: "bijv. 30",
    adspendPlaceholder: "bijv. 25.000",
    try: "Probeer:",
    show: "Toon het aanbod →",
    missing: (items) => `Nog in te vullen: ${items.join(" en ")}`,
    missingRoas: "je minimale ROAS",
    missingCpa: "je maximale CPA",
    missingAdspend: "je ad spend",
    guaranteesTitle: "Garanties en voorwaarden",
    guaranteesLead: "Vastgelegd in de overeenkomst.",
    labelGuarantee: "Garantie",
    labelSetup: "Setup fee",
    labelInvoicing: "Facturatie",
    setupHeadline: (fee) => `${fee} eenmalig, bij de start`,
    invoicingHeadline: "Achteraf, nooit vooraf",
    minRoas: (v) => `Minimale ROAS ${v}`,
    maxCpa: (v) => `Maximale CPA ${v}`,
    notFilledIn: "Nog in te vullen",
    offerTitle: "Jouw aanbod",
    offerLeadRoas: (spend, roas) =>
      `Bij ${spend} ad spend per maand, met een minimale ROAS van ${roas}.`,
    offerLeadCpa: (spend, cpa) =>
      `Bij ${spend} ad spend per maand, met een maximale CPA van ${cpa}.`,
    editAnswers: "← Antwoorden aanpassen",
    hitRoas: "ROAS gehaald",
    hitCpa: "CPA gehaald",
    hitSub: "per maand, base fee plus performance fee",
    missed: "Niet gehaald",
    missedSub: "per maand, de performance fee vervalt volledig",
    capNote: (cap) =>
      `Maximum bereikt. Onze fee blijft op ${cap} per maand staan.`,
    brackets: "Staffel over de ad spend",
    atSpend: (spend) => `Bij ${spend} ad spend`,
    baseFee: "Base fee",
    total: "Totaal",
    totalCapped: "Totaal (maximum)",
    chartTitle: "Performance fee per staffel",
    chartLead: (spend) => `Bij een ad spend van ${spend}`,
    axisSpend: "AD SPEND",
    axisFee: "PERFORMANCE FEE",
    tooltipFee: "Performance fee",
    tooltipSpend: "Ad spend",
    impliesRevenue: (v) => `Dat is minimaal ${v} omzet per maand`,
    impliesOrders: (v) => `Dat is minimaal ${v} orders per maand`,
  },
  fig: {
    usersPerMarket: "Gebruikers per markt",
    vsMeta: "In de Verenigde Staten, naast Meta",
    markets: {
      nlbe: "NL + BE",
      de: "Duitsland",
      us: "Verenigde Staten",
      world: "Wereldwijd",
    },
    millions: "mln",
    firstWeeks: "De eerste twaalf weken, budget",
    twelveMonths: "Twaalf maanden, aandeel van je advertentieomzet",
    learning: "Leerperiode",
    perDay: "€ 100–200 per dag",
    scaleWhenRoas: "Schalen zodra de ROAS het toelaat",
    week: (n) => `Week ${n}`,
    month: (n) => `Maand ${n}`,
    budgetAria: "Budget blijft de eerste weken vlak en loopt daarna op",
    bandAria:
      "Aandeel van de advertentieomzet loopt over twaalf maanden op naar 15 tot 30 procent",
    pricing: {
      once: "Eenmalig",
      setup: "Setup fee",
      setupLead: "Bij de start, voordat er iets live gaat.",
      monthly: "Vast, per maand",
      base: "Base fee",
      baseLead: "Het werk dat elke maand doorloopt.",
      onResult: "Op resultaat",
      performance: "Performance fee",
      performanceLead:
        "Gekoppeld aan je ad spend, en alleen als de afgesproken KPI gehaald wordt.",
      performanceItems: [
        "Het target leggen we vooraf samen vast",
        "Niet gehaald, dan vervalt de performance fee",
        "Altijd achteraf gefactureerd",
      ],
    },
    doc: { head: "Overeenkomst", brand: "Pinformance" },
  },
};

const en: Strings = {
  card: { eyebrow: "Section", cta: "Click to open →" },
  modal: { whatsThere: "What it says", close: "Close", brandArt: "Brand image" },
  toolbar: {
    present: "Present / navigate",
    draw: "Draw",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fit: "Fit to screen",
    prev: "Previous",
    next: "Next",
    otherLanguage: "NL",
  },
  carousel: {
    prev: "Previous",
    next: "Next",
    slide: (i, n) => `Image ${i} of ${n}`,
  },
  cases: { paid: "Paid", organic: "Organic", group: "Paid or organic" },
  calc: {
    questionsTitle: "Three questions first",
    questionsLead: "The offer uses your numbers, not an assumption of ours.",
    q1: "01 · What do we steer on",
    q2Roas: "02 · What ROAS do you need at a minimum?",
    q2Cpa: "02 · What is the highest CPA you accept?",
    q3: "03 · Monthly ad spend",
    roasHint: "Revenue divided by spend. For most brands.",
    cpaHint: "Cost per order. For subscriptions and high LTV.",
    minHintRoas: "The number your brand is profitable at",
    minHintCpa: "The CPA your brand is profitable at",
    minPlaceholderRoas: "e.g. 3.5",
    minPlaceholderCpa: "e.g. 30",
    adspendPlaceholder: "e.g. 25,000",
    try: "Try:",
    show: "Show the offer →",
    missing: (items) => `Still to fill in: ${items.join(" and ")}`,
    missingRoas: "your minimum ROAS",
    missingCpa: "your maximum CPA",
    missingAdspend: "your ad spend",
    guaranteesTitle: "Guarantees and terms",
    guaranteesLead: "Written into the agreement.",
    labelGuarantee: "Guarantee",
    labelSetup: "Setup fee",
    labelInvoicing: "Invoicing",
    setupHeadline: (fee) => `${fee} once, at the start`,
    invoicingHeadline: "Afterwards, never upfront",
    minRoas: (v) => `Minimum ROAS ${v}`,
    maxCpa: (v) => `Maximum CPA ${v}`,
    notFilledIn: "Still to fill in",
    offerTitle: "Your offer",
    offerLeadRoas: (spend, roas) =>
      `At ${spend} ad spend per month, with a minimum ROAS of ${roas}.`,
    offerLeadCpa: (spend, cpa) =>
      `At ${spend} ad spend per month, with a maximum CPA of ${cpa}.`,
    editAnswers: "← Change your answers",
    hitRoas: "ROAS achieved",
    hitCpa: "CPA achieved",
    hitSub: "per month, base fee plus performance fee",
    missed: "Not achieved",
    missedSub: "per month, the performance fee is waived in full",
    capNote: (cap) => `Cap reached. Our fee stays at ${cap} per month.`,
    brackets: "Rate over your ad spend",
    atSpend: (spend) => `At ${spend} ad spend`,
    baseFee: "Base fee",
    total: "Total",
    totalCapped: "Total (cap)",
    chartTitle: "Performance fee per tier",
    chartLead: (spend) => `At an ad spend of ${spend}`,
    axisSpend: "AD SPEND",
    axisFee: "PERFORMANCE FEE",
    tooltipFee: "Performance fee",
    tooltipSpend: "Ad spend",
    impliesRevenue: (v) => `That is at least ${v} revenue per month`,
    impliesOrders: (v) => `That is at least ${v} orders per month`,
  },
  fig: {
    usersPerMarket: "Users per market",
    vsMeta: "In the United States, next to Meta",
    markets: {
      nlbe: "NL + BE",
      de: "Germany",
      us: "United States",
      world: "Worldwide",
    },
    millions: "m",
    firstWeeks: "The first twelve weeks, budget",
    twelveMonths: "Twelve months, share of your ad revenue",
    learning: "Learning period",
    perDay: "€ 100–200 per day",
    scaleWhenRoas: "Scale as soon as ROAS allows",
    week: (n) => `Week ${n}`,
    month: (n) => `Month ${n}`,
    budgetAria: "Budget stays flat for the first weeks and rises after that",
    bandAria:
      "Share of ad revenue grows to 15 to 30 percent over twelve months",
    pricing: {
      once: "One-off",
      setup: "Setup fee",
      setupLead: "At the start, before anything goes live.",
      monthly: "Fixed, per month",
      base: "Base fee",
      baseLead: "The work that runs every month.",
      onResult: "On results",
      performance: "Performance fee",
      performanceLead:
        "Tied to your ad spend, and only when the agreed KPI is met.",
      performanceItems: [
        "We set the target together, upfront",
        "Target missed, performance fee waived",
        "Always invoiced afterwards",
      ],
    },
    doc: { head: "Agreement", brand: "Pinformance" },
  },
};

export const STRINGS: Record<Lang, Strings> = { nl, en };
