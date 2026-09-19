// Pitch canvas content + world coordinates.
//
// De inhoud komt uit de Pinformance salespresentatie. Elke pagina is een lane
// op het canvas; elke sectie binnen die pagina is een node in die lane.
// Daaronder staat per pagina een hub die alle punten uitklapt.
//
// Pagina 5 is het aanbod: wat we concreet doen. Pricing en garanties staan
// niet meer als eigen kaart in het deck; de calculator ernaast stelt eerst zijn
// vragen en laat pas daarna een bedrag zien.
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
  | "resultaten"
  | "garanties"
  | "prijs";

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
  x: -330,
  y: -360,
  w: 660,
  h: 262,
  title: "Pinformance",
  line1: "Pinterest, en verder niets",
  line2:
    "Het kanaal, wie wij zijn, hoe wij werken, de cijfers, het aanbod en de calculator",
};

export const START_NODE = {
  x: -2758,
  y: 560,
  w: 220,
  h: 160,
  eyebrow: "Begin hier",
  title: "START",
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
  { n: "Pagina 4", x: 514, title: "Resultaten", days: "De cijfers" },
  { n: "Pagina 5", x: 1498, title: "Werkzaamheden", days: "Het aanbod" },
  { n: "Eigen gebied", x: 2482, title: "Calculator", days: "Jouw cijfers" },
];

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
export const NODE_SIZE = { w: 200, h: 71 };

export interface CaseRow {
  brand: string;
  revenue: string;
  roas: string;
  cpa: string;
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
  desc: string;
  bullets: string[];
  /** Optioneel accentblok rechts in de modal. */
  highlight?: { k: string; v: string; s?: string; f?: string };
  /** Optionele tweekolomsopdeling in plaats van één lijst. */
  columns?: { title: string; items: string[] }[];
  /** Optionele sleutel/waarde-tabel in plaats van de opsomming. */
  rows?: { k: string; v: string }[];
  /** Kaartenrij met cases, in plaats van een opsomming. */
  cases?: CaseRow[];
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
    x: -2068,
    y: 420,
    name: "Schaal, eerlijk",
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
  {
    id: "werkt-goed-bij",
    x: -1738,
    y: 180,
    name: "Werkt goed bij",
    cat: "Pagina 1 · Pinterest",
    desc: "Waar het kanaal het hardst aanslaat.",
    bullets: [
      "Een visueel product",
      "Een overwegend vrouwelijke doelgroep",
      "Bewezen resultaat op een ander kanaal",
      "Meerdere producten of varianten",
    ],
    visual: {
      note: "Staande sfeerbeelden in de sfeer van beauty, fashion en home decor, in een grid of strip zoals de feed. Puur decoratief, geen labels of nichenamen: we claimen geen niches.",
      by: "Geparkeerd tot besluit B13",
    },
    result: "Vier signalen. Hoe meer je er herkent, hoe sneller het kanaal rendeert.",
  },

  // --- Pagina 2 · Wie wij zijn ---------------------------------------------
  {
    id: "pinterest-verder-niets",
    x: -1414,
    y: 660,
    name: "Pinterest, en verder niets",
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
    id: "geen-eigen-content",
    x: -430,
    y: 660,
    name: "Geen eigen content nodig",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Je bestaande materiaal is genoeg om mee te starten.",
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
    id: "paid",
    x: -265,
    y: 540,
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
  {
    id: "verwachtingen",
    x: -100,
    y: 420,
    name: "Verwachtingen",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Wat je in de eerste weken wel en niet moet verwachten.",
    bullets: [
      "Het algoritme leert op tijd, niet op spend",
      "Budget dumpen levert slechte data op",
      "Start op €100 tot €200 per dag totaal",
      "Schalen zodra de ROAS het toelaat",
    ],
    highlight: {
      k: "Startbudget",
      v: "€100–200",
      s: "per dag, totaal",
      f: "Omhoog zodra de ROAS het toelaat",
    },
    visual: {
      note: "Het budget blijft de eerste weken vlak en loopt daarna pas op.",
      figure: "expectations",
      // Breed: een curve over twaalf weken.
      wide: true,
    },
    result: "Rustig starten kost je twee weken. Te hard starten kost je het kanaal.",
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
    id: "onboarding",
    x: 230,
    y: 180,
    name: "Onboarding",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Van akkoord naar live in drie stappen.",
    bullets: [
      "Slack en onboarding in Notion, 15 tot 20 minuten van jouw tijd",
      "Kick-off call: tracking, contracten, toegang",
      "Eerste campagnes live binnen 48 uur, als jij snel schakelt",
    ],
    visual: {
      note: "De drie stappen, met per stap wat het jou aan tijd kost.",
      figure: "onboarding",
      // Breed: een tijdlijn van links naar rechts.
      wide: true,
    },
    result: "Drie stappen, en 15 tot 20 minuten werk aan jouw kant.",
  },

  // --- Pagina 4 · Resultaten -----------------------------------------------
  // Meten en attributie is geschrapt (ronde 3): een Triple Whale dashboard
  // tonen stuurt erop aan dat we op TW-attributie worden afgerekend, en de
  // vraag komt mondeling toch wel.
  {
    id: "de-cases",
    x: 554,
    y: 660,
    name: "De cases",
    cat: "Pagina 4 · Resultaten",
    desc: "Vier accounts, grootste eerst. Alle cijfers over dit jaar.",
    bullets: [],
    cases: [
      {
        brand: "Fashion merk (anoniem)",
        revenue: "1,8 mln",
        roas: "2,37",
        cpa: "€28",
        // Sfeerbeeld zonder logo, en het bestand is naar de niche genoemd en
        // niet naar het merk: een bestandsnaam staat in de broncode van de
        // pagina, en daarmee zou de anonimisering niets meer waard zijn.
        visual: "Sfeerbeeld zonder logo",
        src: "/pitch/case-fashion.jpg",
      },
      {
        brand: "Celestia",
        revenue: "692k",
        roas: "2,42",
        cpa: "€33",
        visual: "Merkbanner",
        src: "/pitch/case-celestia.jpg",
        logo: "/pitch/brand-celestia.png",
      },
      {
        brand: "FitCherries",
        revenue: "420k",
        roas: "2,20",
        cpa: "€34",
        visual: "Merkbanner",
        src: "/pitch/case-fitcherries.jpg",
        logo: "/pitch/brand-fitcherries.png",
      },
      {
        brand: "May Cosmetics",
        revenue: "389k",
        roas: "2,31",
        cpa: "€17",
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
    id: "wat-realistisch-is",
    x: 1214,
    y: 180,
    name: "Wat realistisch is",
    cat: "Pagina 4 · Resultaten",
    desc: "Wat je ervan mag verwachten, zonder het mooier te maken dan het is.",
    bullets: [
      "Geen beloftes",
      "15 tot 30% van je advertentieomzet, opgebouwd over maanden",
      "Bij het ene merk gaat het binnen weken, bij het andere duurt het langer",
    ],
    question: "Maar wat is er mogelijk?",
    highlight: {
      k: "Waar het heen gaat",
      v: "15–30%",
      s: "van je advertentieomzet",
      f: "Opgebouwd over maanden",
    },
    visual: {
      note: "De opbouw over twaalf maanden, als bandbreedte en niet als één lijn.",
      figure: "realistic",
      // Breed: een curve over twaalf maanden.
      wide: true,
    },
    result: "Eén getal om ons op af te rekenen, en de tijd die het kost om er te komen.",
  },

  // --- Pagina 5 · Werkzaamheden --------------------------------------------
  // Eerst wat we doen, dan wat het kost. Organic en paid staan hier nog een
  // keer als werk, zodat de value vlak voor de prijs staat en niet drie
  // pagina's eerder.
  {
    id: "werkzaamheden",
    x: 1868,
    y: 420,
    name: "Werkzaamheden",
    cat: "Pagina 5 · Het aanbod",
    desc: "Wat wij concreet doen.",
    bullets: [],
    columns: [
      {
        title: "Paid",
        items: [
          "Analyse van wat je merk al draait",
          "Campagnestructuur op jouw merk en catalogus",
          "Catalog ads bij een brede catalogus",
          "Creatives kiezen uit je bestaande materiaal",
          "Media buying en schalen",
        ],
      },
      {
        title: "Organic",
        items: [
          "Volledige profielopzet met SEO",
          "Borden, structuur en zoektermen",
          "Dagelijkse plaatsingen",
          "Doorlopend beheer van het profiel",
        ],
      },
      {
        title: "Start en contact",
        items: [
          "Merk- en concurrentieonderzoek",
          "Benchmarks uit onze portfolio",
          "Opzet van het advertentieaccount",
          "Creative gameplan en kick-off call",
          "Wekelijkse rapportage",
          "Maandelijkse call",
        ],
      },
    ],
    visual: {
      note: "De opsomming is de pagina. Geen bedrag hier: dat trekt alle aandacht weg van wat er gedaan wordt.",
      parked: true,
    },
  },

  // --- Eigen gebied · Calculator -------------------------------------------
  {
    id: "de-calculator",
    x: 2852,
    y: 420,
    name: "De calculator",
    cat: "Calculator",
    desc: "Eerst een paar vragen. Daarna het aanbod, gerekend met jouw eigen cijfers.",
    bullets: [],
    calculator: true,
    visual: {
      note: "De calculator is de visual. Hij rekent live mee tijdens de call, met de cijfers van de prospect zelf.",
    },
  },
];

// ---------------------------------------------------------------------------
// Label boven de pagina-hubs
// ---------------------------------------------------------------------------
export const SYS_LABEL = {
  x: -580,
  y: 1030,
  w: 1160,
  h: 78,
  eyebrow: "De volledige presentatie",
  title: "Alles wat er per pagina staat",
  hint: "Klik een pagina open om alle punten te zien →",
};

// ---------------------------------------------------------------------------
// Pagina-hubs
// ---------------------------------------------------------------------------
export const HUB = { w: 760, h: 230, y: 1134 };
export const CAT = { w: 210, h: 40, y: 1404 };
export const SYS = { w: 210, h: 46, y: 1466, stride: 56 };

export interface Category {
  name: string;
  systems: string[];
}

export interface PhaseHub {
  key: string;
  n: string;
  x: number;
  /** X waar de kolommen met categorieën van deze pagina beginnen. */
  catX: number;
  meta: string;
  title: string;
  desc: string;
  count: string;
  cats: Category[];
}

export const PHASE_HUBS: PhaseHub[] = [
  {
    key: "p1",
    n: "01",
    x: -2348,
    catX: -2313,
    meta: "Pagina 1 · Het kanaal",
    title: "Pinterest",
    desc: "Waarom Pinterest een ander kanaal is dan Meta, hoe groot het is en voor wie het werkt.",
    count: "13 punten",
    cats: [
      {
        name: "Geen tweede Meta",
        systems: [
          "Inspiratieplatform, geen doomscroll",
          "Zoeken actief naar ideeën",
          "Vroeger in de funnel dan Meta",
        ],
      },
      {
        name: "Schaal, eerlijk",
        systems: [
          "NL + BE: 7 tot 8 mln",
          "Duitsland: ±20 mln",
          "VS: ±100 mln vs 300 tot 400 mln Meta",
          "Wereldwijd: ±600 mln, groeiend",
          "Minder concurrentie dan Meta",
          "CPM's fors onder Meta",
        ],
      },
      {
        name: "Werkt goed bij",
        systems: [
          "Visueel product",
          "Overwegend vrouwelijke doelgroep",
          "Bewezen op een ander kanaal",
          "Meerdere producten of varianten",
        ],
      },
    ],
  },
  {
    key: "p2",
    n: "02",
    x: -1364,
    catX: -1329,
    meta: "Pagina 2 · Het bureau",
    title: "Wie wij zijn",
    desc: "Eén kanaal, senior media buyers in Nederland en korte lijnen via Slack.",
    count: "11 punten",
    cats: [
      {
        name: "Pinterest, verder niets",
        systems: [
          "5 jaar Pinterest",
          "2 jaar volledig op merken",
          "Geen Meta, Google of TikTok",
          "Geen tweede kanaal",
        ],
      },
      {
        name: "Nederlands team",
        systems: [
          "Eigen kantoor in Hengelo",
          "Alleen senior media buyers",
          "Ervaring met zes cijfers per maand",
          "Nederlandse projectmanager",
        ],
      },
      {
        name: "Communicatie",
        systems: [
          "Slack",
          "Altijd binnen 3 uur reactie",
          "Maandelijkse check-in call",
          "Meer calls als daar vraag naar is",
        ],
      },
    ],
  },
  {
    key: "p3",
    n: "03",
    x: -380,
    catX: -585,
    meta: "Pagina 3 · De uitvoering",
    title: "Hoe wij werken",
    desc: "Wat je aanlevert, hoe we paid opbouwen en waarom organic standaard meegaat.",
    count: "22 punten",
    cats: [
      {
        name: "Geen eigen content nodig",
        systems: [
          "Bestaand Meta- en TikTok-materiaal",
          "Wij bepalen wat live gaat",
          "Toegang tot je drive is genoeg",
          "Op volume: creative-advies uit data",
        ],
      },
      {
        name: "Paid",
        systems: [
          "Eerst analyseren wat je al draait",
          "Structuur op jouw merk en catalogus",
          "Catalog ads bij brede catalogus",
          "Pas daarna live, sterkste eerst",
        ],
      },
      {
        name: "Verwachtingen",
        systems: [
          "Algoritme leert op tijd, niet op spend",
          "Budget dumpen geeft slechte data",
          "Start €100 tot €200 per dag",
          "Schalen zodra de ROAS het toelaat",
        ],
      },
      {
        name: "Organic",
        systems: [
          "Pinterest is een zoekmachine, dus SEO",
          "Volledige profielopzet",
          "Dagelijkse plaatsingen",
          "Vindbaarheid zonder budget",
          "Sterker profiel is hogere conversie",
          "Omzet vanaf 3 tot 6 maanden",
          "Standaard inbegrepen",
        ],
      },
      {
        name: "Onboarding",
        systems: [
          "Slack en Notion, 15 tot 20 min",
          "Kick-off: tracking, contracten, toegang",
          "Eerste campagnes live binnen 48 uur",
        ],
      },
    ],
  },
  {
    key: "p4",
    n: "04",
    x: 604,
    catX: 759,
    meta: "Pagina 4 · De cijfers",
    title: "Resultaten",
    desc: "Vier cases met hun cijfers, en wat realistisch is.",
    count: "8 punten",
    cats: [
      {
        name: "De cases",
        systems: [
          "Fashion (anoniem): 1,8 mln · 2,37 · €28",
          "Celestia: 692k · 2,42 · €33",
          "FitCherries: 420k · 2,20 · €34",
          "May Cosmetics: 389k · 2,31 · €17",
        ],
      },
      {
        name: "Wat realistisch is",
        systems: [
          "Geen beloftes",
          "15 tot 30%, opgebouwd over maanden",
          "Soms weken, soms langer",
          "Maar wat is er mogelijk?",
        ],
      },
    ],
  },
  {
    key: "p5",
    n: "05",
    x: 1588,
    catX: 1863,
    meta: "Pagina 5 · Het aanbod",
    title: "Werkzaamheden",
    desc: "Wat we concreet doen, paid en organic.",
    count: "8 punten",
    cats: [
      {
        name: "Werkzaamheden",
        systems: [
          "Paid: analyse, structuur, catalog ads",
          "Paid: creatives kiezen, media buying",
          "Organic: profielopzet met SEO",
          "Organic: dagelijkse plaatsingen",
          "Onderzoek, benchmarks, accountopzet",
          "Creative gameplan en kick-off",
          "Wekelijkse rapportage",
          "Maandelijkse call",
        ],
      },
    ],
  },
  {
    key: "p6",
    n: "06",
    x: 2572,
    catX: 2847,
    meta: "Eigen gebied · Jouw cijfers",
    title: "Calculator",
    desc: "Eerst de vragen, daarna het aanbod met je eigen cijfers.",
    count: "4 punten",
    cats: [
      {
        name: "De calculator",
        systems: [
          "Eerst de vragenlijst",
          "Rekent met jouw eigen ROAS of CPA",
          "Organic omzet tegenover de base fee",
          "Spend fee pas vanaf jouw target",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Afsluiting
// ---------------------------------------------------------------------------
export const CTA = {
  x: -300,
  y: 2200,
  w: 600,
  h: 250,
  eyebrow: "Volgende stap",
  title: "Van akkoord naar live.",
  desc: "Slack en onboarding in Notion (15 tot 20 minuten), kick-off call voor tracking, contracten en toegang. Eerste campagnes live binnen 48 uur.",
  button: "Plan de kick-off →",
};

// ---------------------------------------------------------------------------
// Secties waar de tabbalk tussen navigeert
// ---------------------------------------------------------------------------
export const SECTIONS: Section[] = [
  {
    id: "totaal",
    index: "00",
    label: "Totaaloverzicht",
    bounds: { x: -2758, y: -360, w: 6180, h: 2810 },
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
    label: "Resultaten",
    bounds: { x: 514, y: -84, w: 940, h: 904 },
  },
  {
    id: "garanties",
    index: "05",
    label: "Werkzaamheden",
    bounds: { x: 1498, y: -84, w: 940, h: 904 },
  },
  {
    id: "prijs",
    index: "06",
    label: "Calculator",
    bounds: { x: 2482, y: -84, w: 940, h: 904 },
  },
];
