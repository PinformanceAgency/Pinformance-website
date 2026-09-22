// Pitch canvas content + world coordinates.
//
// De inhoud komt uit de Pinformance salespresentatie. Elke pagina is een lane
// op het canvas; elke sectie binnen die pagina is een node in die lane.
// Daaronder staat per pagina een hub die alle punten uitklapt.
//
// Het deck telt vier pagina's. De cijfers, de werkzaamheden en de calculator
// staan samen op pagina 4: eerst wat het opleverde, dan wat we doen, en pas
// daarna een bedrag. De calculator stelt eerst zijn vragen.
//
// Alle coördinaten zijn absoluut in wereldruimte en veranderen nooit; alleen de
// camera beweegt. De oorsprong (0,0) ligt linksboven in de middelste lane.
//
// Twee regels gelden voor elke string in dit bestand:
//   1. Geen em-dashes in tekst die op het scherm komt. Komma, punt of
//      herschrijven.
//   2. Elke sectie heeft een `visual`. Geen enkele kaart gaat zonder beeld
//      naar buiten, dus een sectie zonder aangeleverd beeld houdt een zichtbare
//      lege plek in plaats van stilletjes zonder te verschijnen.

/**
 * Ronde 3: de resultaatbalk is overal weg. Of de zin zelf als gewone regel
 * onder de opsomming terugkomt is nog een besluit (B14); dit is de schakelaar.
 */
export const SHOW_RESULT_LINE = false;

export type SectionId =
  | "totaal"
  | "pinterest"
  | "wie"
  | "hoe"
  | "resultaten";

export interface Section {
  id: SectionId;
  index: string;
  label: string;
  /** Wereldruimte waar de camera op inzoomt als deze sectie wordt gekozen. */
  bounds: { x: number; y: number; w: number; h: number };
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------
export const HERO = {
  x: -822,
  y: -360,
  w: 660,
  h: 200,
  title: "Pinformance",
};

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------
export const LANE = { w: 940, h: 820, y: 0, titleY: -84, titleH: 58 };

export interface Lane {
  n: string;
  x: number;
  title: string;
  days: string;
}

export const LANES: Lane[] = [
  { n: "Pagina 1", x: -2438, title: "Pinterest", days: "Het kanaal" },
  { n: "Pagina 2", x: -1454, title: "Wie wij zijn", days: "Het bureau" },
  { n: "Pagina 3", x: -470, title: "Hoe wij werken", days: "De uitvoering" },
  { n: "Pagina 4", x: 514, title: "Resultaten + pricing", days: "De cijfers en het aanbod" },
];

// ---------------------------------------------------------------------------
// Werkzaamheden
// ---------------------------------------------------------------------------
// Eén lijst, twee plekken: de sectie Werkzaamheden en de uitleg van de fees bij
// Pricing. Ronde 5 vraagt daar expliciet om, zodat wat er in de fee zit nooit
// iets anders kan zeggen dan wat we doen.
//
// De groepen staan los van elkaar omdat de knip tussen setup en base fee er
// dwars doorheen loopt: het startwerk gebeurt eenmalig, paid, organic en het
// contact lopen elke maand door.
const PAID = {
  title: "Paid",
  items: [
    "Analyse van wat je merk al draait",
    "Campagnestructuur op jouw merk en catalogus",
    "Catalog ads bij een brede catalogus",
    "Creatives kiezen uit je bestaande materiaal",
    "Media buying en schalen",
  ],
};

const ORGANIC = {
  title: "Organic",
  items: [
    "Volledige profielopzet met SEO",
    "Borden, structuur en zoektermen",
    "Dagelijkse plaatsingen",
    "Doorlopend beheer van het profiel",
  ],
};

const START = {
  title: "Start",
  items: [
    "Merk- en concurrentieonderzoek op Pinterest",
    "Benchmarks uit onze portfolio",
    "Volledige organic opzet: keyword research, borden, structuur",
    "Opzet van het advertentieaccount",
    "Creative gameplan",
    "Kick-off call",
  ],
};

const CONTACT = {
  title: "Contact",
  items: ["Wekelijkse rapportage", "Maandelijkse call"],
};

/** De sectie Werkzaamheden: alles wat we doen, in drie kolommen. */
export const WERKZAAMHEDEN = [
  PAID,
  ORGANIC,
  { title: "Start en contact", items: [...START.items, ...CONTACT.items] },
];

/** Wat de setup fee dekt: alles wat eenmalig bij de start gebeurt. */
export const SETUP_WERK = START.items;

/** Wat de base fee dekt: het werk dat elke maand doorloopt. */
export const BASE_WERK = [PAID, ORGANIC, CONTACT];

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
export const NODE_SIZE = { w: 200, h: 71 };

/** Wat er op een banner staat. Per modus dezelfde vier regels, zodat het
 *  omschakelen niets laat verspringen. */
export interface CaseFigures {
  /** De periode waar de cijfers over gaan. */
  label: string;
  value: string;
  /** Wat het getal is. */
  unit: string;
  /** De regel eronder. Bij organic bestaan ROAS en CPA niet, dus staat daar
   *  waar de omzet vandaan komt. */
  metric: string;
}

export type CaseMode = "paid" | "organic";

export interface CaseRow {
  brand: string;
  paid: CaseFigures;
  organic: CaseFigures;
  /** Wat er bij de cijfers komt te staan, en het beeld zodra het er is. */
  visual: string;
  src?: string;
  /** Het woordmerk dat op de banner komt. Zonder logo valt het terug op de naam. */
  logo?: string;
}

export interface RoadmapNode {
  id: string;
  x: number;
  y: number;
  name: string;
  /** De pagina waar deze sectie bij hoort. Staat boven de titel in de modal. */
  cat: string;
  /** Optioneel: de calculator opent meteen met zijn eigen vragen. */
  desc?: string;
  bullets: string[];
  /** Optioneel accentblok rechts in de modal. */
  highlight?: { k: string; v: string; s?: string; f?: string };
  /** Optionele tweekolomsopdeling in plaats van één lijst. */
  columns?: { title: string; items: string[] }[];
  /** Optionele sleutel/waarde-tabel in plaats van de opsomming. */
  rows?: { k: string; v: string }[];
  /** Kaartenrij met cases, in plaats van een opsomming. */
  cases?: CaseRow[];
  /** De subtitel zodra de cases op organic staan. */
  descOrganic?: string;
  /**
   * Een vraag die bewust geen statement is. Staat los onder de opsomming,
   * zonder vinkje, als cue om hem mondeling te beantwoorden.
   */
  question?: string;
  /**
   * Wat er aan beeld bij deze sectie hoort. `src` zodra het er is.
   * `light` zet het beeld op een witte plaat: een logo met zwarte letters en
   * een transparante achtergrond valt op het zwarte canvas anders weg.
   */
  visual: {
    note: string;
    by?: string;
    src?: string;
    light?: boolean;
    /** Sleutel in FIGURES (figures.tsx), voor beeld dat wij zelf tekenen. */
    figure?: string;
    /**
     * Over de volle breedte onder de tekst in plaats van ernaast. Alleen voor
     * beeld dat van links naar rechts gelezen wordt: een grafiek, een tijdlijn,
     * een brede tabel. Alles wat staand of vierkant is hoort naast de tekst.
     */
    wide?: boolean;
    /**
     * Tijdelijk niet tonen. De tekst loopt dan over de volle breedte; zodra
     * het beeld er is gaat deze vlag eraf en staat het vanzelf weer naast de
     * tekst. Geen aparte opmaak die later teruggedraaid moet worden.
     */
    parked?: boolean;
    /**
     * Beelden die onder het eerste staan, in volgorde. Voor een sectie die
     * een verloop laat zien: eerst wat we opzetten, dan wat het oplevert.
     */
    extra?: string[];
  };
  /** Gezet zolang de sectie nog niet af is. Zichtbaar op kaart en in modal. */
  pending?: string;
  /** Deze sectie draagt de werkende calculator in plaats van een opsomming. */
  calculator?: true;
  /**
   * De kernzin van de sectie. Staat sinds ronde 3 niet meer op het scherm (de
   * resultaatbalk leidde af tijdens de oefenpitch); zie SHOW_RESULT_LINE.
   */
  result?: string;
}

export const ROADMAP_NODES: RoadmapNode[] = [
  // --- Pagina 1 · Pinterest ------------------------------------------------
  {
    id: "geen-tweede-meta",
    x: -2398,
    y: 660,
    name: "Geen tweede Meta",
    cat: "Pagina 1 · Pinterest",
    desc: "Pinterest is een inspiratieplatform, geen doomscroll. Dat verandert wie je bereikt en op welk moment.",
    bullets: [
      "Inspiratieplatform, geen doomscroll",
      "Mensen zoeken actief naar ideeën: interieur, outfit, cadeau",
      "Vroeger in de funnel dan Meta, veel vroeger dan Google",
    ],
    visual: {
      note: "Een Pinterest feed op mobiel, zoals je hem ziet tijdens het scrollen.",
      src: "/pitch/feed-mobile.png",
    },
    result:
      "Je bereikt mensen terwijl ze nog aan het kiezen zijn, niet als ze al gekozen hebben.",
  },
  {
    id: "schaal-eerlijk",
    x: -1738,
    y: 180,
    name: "Schaalbaarheid",
    cat: "Pagina 1 · Pinterest",
    desc: "Kleiner dan Meta, en dat is precies het punt: minder concurrentie en lagere CPM's.",
    bullets: [
      "NL + BE: 7 tot 8 mln gebruikers",
      "Duitsland: ongeveer 20 mln",
      "VS: ongeveer 100 mln, tegenover 300 tot 400 mln op Meta",
      "Wereldwijd: ongeveer 600 mln, groeiend",
      "Minder concurrentie dan op Meta, in vrijwel elke markt",
      "CPM's liggen fors onder die van Meta",
    ],
    highlight: {
      k: "Realistisch aandeel",
      v: "15–30%",
      s: "van je advertentieomzet",
      f: "Opgebouwd over maanden, niet in week één",
    },
    visual: {
      note: "Het bereik per markt, en daaronder hoe Pinterest zich in de VS tot Meta verhoudt.",
      figure: "scale",
      // Breed: balken die van links naar rechts lopen.
      wide: true,
    },
    result:
      "Een tweede kanaal dat 15 tot 30% van je advertentieomzet kan dragen, tegen lagere kosten per duizend.",
  },

  // --- Pagina 2 · Wie wij zijn ---------------------------------------------
  {
    id: "pinterest-verder-niets",
    x: -1414,
    y: 660,
    name: "Enkel focus op Pinterest",
    cat: "Pagina 2 · Wie wij zijn",
    desc: "Eén kanaal, volledig. Geen tweede kanaal om op terug te vallen.",
    bullets: [
      "5 jaar Pinterest",
      "2 jaar volledig gericht op merken",
      "Geen Meta, geen Google, geen TikTok",
      "Andere bureaus doen Pinterest erbij, wij hebben geen tweede kanaal",
    ],
    visual: {
      note: "De kanalen die wij niet doen, en het ene dat we wel doen.",
      figure: "onlyPinterest",
    },
    result:
      "Alles wat wij op tientallen accounts leren, komt op één kanaal terecht: het jouwe.",
  },
  {
    id: "nederlands-team",
    x: -1084,
    y: 420,
    name: "Nederlands team",
    cat: "Pagina 2 · Wie wij zijn",
    desc: "Senior media buyers in Nederland, met ervaring op grotere DTC merken.",
    bullets: [
      "Eigen kantoor in Hengelo, Nederland",
      "Alleen senior media buyers, geen juniors die het erbij doen",
      "Ervaring met DTC merken die maandelijks zes cijfers aan advertentiebudget draaien",
      "Nederlandse projectmanager als vast aanspreekpunt",
    ],
    visual: { note: "Teamfoto.", by: "Tycho levert aan", parked: true },
    result:
      "Jouw account wordt gedraaid door iemand die dit dagelijks op schaal doet.",
  },
  {
    id: "communicatie",
    x: -754,
    y: 180,
    name: "Communicatie",
    cat: "Pagina 2 · Wie wij zijn",
    desc: "Kort en direct. Geen calls om het houden van calls.",
    bullets: [
      "Slack",
      "Altijd binnen 3 uur reactie",
      "Maandelijkse check-in call, door ons voorbereid",
      "Optie tot meer calls als daar vraag naar is",
    ],
    visual: {
      note: "Slack, het kanaal waar alles langsgaat.",
      src: "/pitch/slack.png",
      light: true,
    },
    result: "Je hoort van ons als er iets te melden is, niet omdat het dinsdag is.",
  },

  // --- Pagina 3 · Hoe wij werken -------------------------------------------
  {
    id: "verwachtingen",
    x: -430,
    y: 660,
    name: "Verwachtingen",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Wat je in de eerste weken mag verwachten, en waar het over maanden heen gaat.",
    bullets: [
      "Het algoritme leert op tijd, niet op spend",
      "Budget dumpen levert slechte data op",
      "Start op €100 tot €200 per dag totaal",
      "Schalen zodra de ROAS het toelaat",
      "Geen beloftes",
      "15 tot 30% van je advertentieomzet, opgebouwd over maanden",
      "Bij het ene merk gaat het binnen weken, bij het andere duurt het langer",
    ],
    question: "Maar wat is er mogelijk?",
    highlight: {
      k: "Waar het heen gaat",
      v: "15–30%",
      s: "van je advertentieomzet",
      f: "Start op €100 tot €200 per dag, omhoog zodra de ROAS het toelaat",
    },
    visual: {
      note: "Eerst de eerste twaalf weken budget, daarna het aandeel over twaalf maanden als bandbreedte.",
      figure: "expectations",
      // Breed: twee curves onder elkaar, allebei van links naar rechts.
      wide: true,
    },
    result:
      "Rustig starten kost je twee weken, en waar het heen gaat is 15 tot 30% van je advertentieomzet.",
  },
  {
    id: "werkzaamheden",
    x: -265,
    y: 540,
    name: "Werkzaamheden",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Wat wij concreet doen.",
    bullets: [],
    columns: WERKZAAMHEDEN,
    visual: {
      note: "De opsomming is de pagina. Geen bedrag hier: dat trekt alle aandacht weg van wat er gedaan wordt.",
      parked: true,
    },
  },

  {
    id: "geen-eigen-content",
    x: -100,
    y: 420,
    name: "Creatives",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Je bestaande materiaal is genoeg om mee te starten. Er zijn geen aparte Pinterest-creatives nodig.",
    bullets: [
      "Wij gebruiken je bestaande Meta- en TikTok-materiaal",
      "Wij bepalen wat er live gaat",
      "Toegang tot je drive of creative-systeem is genoeg",
      "Op volume: gericht creative-advies uit onze data",
    ],
    visual: {
      note: "De Meta Ads Library: het materiaal dat je al draait, en waar wij mee starten.",
      src: "/pitch/meta-ads-library.png",
      // Breed: Meta Ads Library, een breed raster.
      wide: true,
    },
    result: "Je hoeft niets extra te laten maken om te kunnen starten.",
  },
  {
    id: "organic",
    x: 65,
    y: 300,
    name: "Organic",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Pinterest is een zoekmachine. Organic is daarom geen bijzaak.",
    bullets: [
      "Pinterest is een zoekmachine, dus SEO",
      "Volledige profielopzet: borden, structuur, zoektermen",
      "Dagelijkse plaatsingen",
      "Vindbaarheid zonder advertentiebudget",
      "Een sterker profiel betekent hogere conversie op paid",
      "Omzet vanaf 3 tot 6 maanden",
      "Standaard inbegrepen, paid presteert zonder organic slechter",
    ],
    visual: {
      note: "Een volledig opgezet Pinterest-profiel: borden per zoekterm, 6 mln maandelijkse weergaven.",
      src: "/pitch/organic-profile-1800.jpg",
      // Een swipe: eerst de opzet, dan wat die opzet in 30 dagen opleverde.
      // Beide op 1800 x 1000, zodat er bij het swipen niets verspringt.
      extra: ["/pitch/organic-results-1800.jpg"],
      // Breed: een lijngrafiek over zes maanden.
      wide: true,
    },
    result:
      "Dit profiel leverde FitCherries in 30 dagen US$ 5.010 omzet op uit organic, 110% meer dan de 30 dagen ervoor. Zonder advertentiebudget.",
  },
  {
    id: "paid",
    x: 230,
    y: 180,
    name: "Paid",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Eerst onderzoeken wat er al werkt, daarna pas bouwen.",
    bullets: [
      "We analyseren eerst wat je merk al draait: Meta-resultaten, welke creatives presteren en welke landingspagina's in Shopify converteren",
      "Op basis daarvan bouwen we de campagnestructuur, afgestemd op jouw merk en catalogus",
      "Bij meerdere sterke producten of een brede catalogus zetten we catalog ads in",
      "Pas daarna gaan we live, met de sterkste markten en collecties eerst",
    ],
    visual: {
      note: "Pinterest Ads Manager, dit jaar: €721.927 spend, ROAS 2,37, CPA €28,43, €1,7 mln orderwaarde. Campagnenamen staan buiten beeld, dus het account is niet herleidbaar.",
      src: "/pitch/ads-manager.png",
      // Breed: Ads Manager, een brede tabel.
      wide: true,
    },
    result: "We starten waar je al wint, niet waar het spannend is.",
  },
  // --- Pagina 4 · Resultaten + pricing -------------------------------------
  // De cijfers en het aanbod staan op één pagina: eerst wat het opleverde,
  // dan wat we doen en wat het kost. Meten en attributie is geschrapt (ronde
  // 3): een Triple Whale dashboard tonen stuurt erop aan dat we op
  // TW-attributie worden afgerekend, en de vraag komt mondeling toch wel.
  {
    id: "de-cases",
    x: 554,
    y: 660,
    name: "Resultaten",
    cat: "Pagina 4 · Resultaten + pricing",
    desc: "Vier accounts, grootste eerst. Alle cijfers over dit jaar.",
    // De volgorde blijft in beide modi gelijk, zodat er bij het omschakelen
    // geen banner van plek wisselt. Daarom noemt de organic-subtitel geen
    // volgorde.
    descOrganic: "Organic omzet over de laatste 30 dagen, in USD.",
    bullets: [],
    cases: [
      {
        brand: "Fashion merk (anoniem)",
        paid: {
          label: "Dit jaar",
          value: "1,8 mln",
          unit: "Revenue",
          metric: "ROAS 2,37 · CPA €28",
        },
        organic: {
          label: "Laatste 30 dagen",
          value: "$2,9k",
          unit: "Organic revenue",
          metric: "Zonder advertentiebudget",
        },
        // Sfeerbeeld zonder logo, en het bestand is naar de niche genoemd en
        // niet naar het merk: een bestandsnaam staat in de broncode van de
        // pagina, en daarmee zou de anonimisering niets meer waard zijn.
        visual: "Sfeerbeeld zonder logo",
        src: "/pitch/case-fashion.jpg",
      },
      {
        brand: "Celestia",
        paid: {
          label: "Dit jaar",
          value: "692k",
          unit: "Revenue",
          metric: "ROAS 2,42 · CPA €33",
        },
        organic: {
          label: "Laatste 30 dagen",
          value: "$4,29k",
          unit: "Organic revenue",
          metric: "Zonder advertentiebudget",
        },
        visual: "Merkbanner",
        src: "/pitch/case-celestia.jpg",
        logo: "/pitch/brand-celestia.png",
      },
      {
        brand: "FitCherries",
        paid: {
          label: "Dit jaar",
          value: "420k",
          unit: "Revenue",
          metric: "ROAS 2,20 · CPA €34",
        },
        organic: {
          label: "Laatste 30 dagen",
          value: "$3,8k",
          unit: "Organic revenue",
          metric: "Zonder advertentiebudget",
        },
        visual: "Merkbanner",
        src: "/pitch/case-fitcherries.jpg",
        logo: "/pitch/brand-fitcherries.png",
      },
      {
        brand: "May Cosmetics",
        paid: {
          label: "Dit jaar",
          value: "389k",
          unit: "Revenue",
          metric: "ROAS 2,31 · CPA €17",
        },
        organic: {
          label: "Laatste 30 dagen",
          value: "$3,75k",
          unit: "Organic revenue",
          metric: "Zonder advertentiebudget",
        },
        visual: "Merkbanner",
        src: "/pitch/case-may-cosmetics.jpg",
        logo: "/pitch/brand-may.png",
      },
    ],
    visual: {
      note: "Elke case draagt zijn eigen merkbeeld. Voor het anonieme fashion merk een sfeerbeeld zonder logo.",
      // Breed: de casekaarten dragen hun eigen beeld, hier staat alleen het
      // bijschrift eronder.
      wide: true,
    },
    result:
      "Vier merken in vier categorieën, ROAS tussen 2,20 en 2,42. De kracht zit in de consistentie, niet in één uitschieter.",
  },
  {
    id: "pricing-uitleg",
    x: 719,
    y: 500,
    name: "Pricing",
    cat: "Pagina 4 · Resultaten + pricing",
    desc: "Hoe het model werkt, in drie onderdelen.",
    bullets: [
      "Setup fee: eenmalig, bij de start",
      "Base fee: vast, elke maand",
      "Performance fee: over je ad spend, en alleen als de afgesproken KPI gehaald wordt",
    ],
    visual: {
      // Bewust zonder bedragen (ronde 5). Die staan alleen in de calculator,
      // een kaart verderop.
      note: "Per onderdeel wat erbij komt kijken. Geen bedragen: die komen pas bij de calculator.",
      figure: "pricingExplainer",
      wide: true,
    },
  },
  {
    id: "de-calculator",
    x: 884,
    y: 340,
    name: "Calculator",
    cat: "Pagina 4 · Resultaten + pricing",
    bullets: [],
    calculator: true,
    visual: {
      note: "De calculator is de visual. Hij rekent live mee tijdens de call, met de cijfers van de prospect zelf.",
    },
  },
  {
    id: "garanties",
    x: 1049,
    y: 180,
    name: "Garanties",
    cat: "Pagina 4 · Resultaten + pricing",
    desc: "Wat er contractueel vastligt.",
    bullets: [
      "KPI en target leggen we vooraf samen vast",
      "Niet gehaald: de performance fee vervalt",
      "We meten over de hele maand, niet per losse campagne",
      "De maandfactuur is gemaximeerd",
      "Altijd achteraf gefactureerd, nooit vooraf",
      "2 maanden, daarna maandelijks opzegbaar",
    ],
    visual: {
      note: "De afspraken zoals ze in de overeenkomst komen te staan.",
      figure: "guarantees",
      wide: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Secties waar de tabbalk tussen navigeert
// ---------------------------------------------------------------------------
export const SECTIONS: Section[] = [
  {
    id: "totaal",
    index: "00",
    label: "Totaaloverzicht",
    bounds: { x: -2578, y: -360, w: 4100, h: 1240 },
  },
  {
    id: "pinterest",
    index: "01",
    label: "Pinterest",
    bounds: { x: -2438, y: -84, w: 940, h: 904 },
  },
  {
    id: "wie",
    index: "02",
    label: "Wie wij zijn",
    bounds: { x: -1454, y: -84, w: 940, h: 904 },
  },
  {
    id: "hoe",
    index: "03",
    label: "Hoe wij werken",
    bounds: { x: -470, y: -84, w: 940, h: 904 },
  },
  {
    id: "resultaten",
    index: "04",
    label: "Resultaten + pricing",
    bounds: { x: 514, y: -84, w: 940, h: 904 },
  },
];
