// Pitch canvas content + world coordinates.
//
// De inhoud komt uit de Pinformance salespresentatie (5 pagina's). Elke pagina
// is een lane op het canvas; elke sectie binnen die pagina is een node in die
// lane. Daaronder staat per pagina een hub die alle punten van die pagina
// uitklapt, en onderaan de cases, het team en de afsluiting.
//
// Alle coördinaten zijn absoluut in wereldruimte en veranderen nooit; alleen de
// camera beweegt. De oorsprong (0,0) ligt linksboven in de middelste lane, dus
// de vijf lanes liggen symmetrisch om het nulpunt.

export type SectionId =
  | "totaal"
  | "pinterest"
  | "wie"
  | "hoe"
  | "resultaten"
  | "prijs"
  | "afsluiting";

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
    "Vijf pagina's: het kanaal, wie wij zijn, hoe wij werken, de cijfers en het model",
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
// Lanes — één per pagina uit de presentatie
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
  { n: "Pagina 5", x: 1498, title: "Prijs en garanties", days: "Het model" },
];

// ---------------------------------------------------------------------------
// Nodes — de secties van elke pagina, als ketting van links naar rechts
// ---------------------------------------------------------------------------
export const NODE_SIZE = { w: 200, h: 71 };

export interface RoadmapNode {
  id: string;
  x: number;
  y: number;
  name: string;
  /** De pagina waar deze sectie bij hoort — staat boven de titel in de modal. */
  cat: string;
  desc: string;
  bullets: string[];
  /** Optioneel accentblok rechts in de modal. */
  highlight?: { k: string; v: string; s?: string; f?: string };
  /** Optionele tweekolomsopdeling in plaats van één lijst. */
  columns?: { title: string; items: string[] }[];
  /** Optionele sleutel/waarde-tabel in plaats van de opsomming. */
  rows?: { k: string; v: string }[];
  /** Wat je uit deze sectie meeneemt. */
  result: string;
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
      "Mensen komen om te ontdekken en te plannen",
      "Ze zoeken actief naar ideeën: interieur, outfit, cadeau",
      "Oriëntatie duurt weken tot maanden voor de aankoop",
      "Positieve omgeving, geen nieuws en geen discussie",
      "Vroeger in de funnel dan Meta, veel vroeger dan Google",
    ],
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
      "Andere bureaus doen Pinterest erbij; wij hebben geen tweede kanaal",
    ],
    result:
      "Alles wat wij op tientallen accounts leren, komt op één kanaal terecht: het jouwe.",
  },
  {
    id: "nederlands-team",
    x: -1194,
    y: 500,
    name: "Nederlands team",
    cat: "Pagina 2 · Wie wij zijn",
    desc: "Eigen kantoor, eigen mensen, niets uitbesteed.",
    bullets: [
      "Eigen kantoor in Hengelo",
      "Geen offshore media buyers",
      "Iedereen heeft zelf een merk gerund of media buying gedaan",
    ],
    result: "De persoon die jouw account draait heeft zelf een webshop gerund.",
  },
  {
    id: "wie-jij-krijgt",
    x: -974,
    y: 340,
    name: "Wie jij krijgt",
    cat: "Pagina 2 · Wie wij zijn",
    desc: "Twee vaste mensen op jouw account, geen wisselende poule.",
    bullets: [],
    rows: [
      { k: "Tristan", v: "Projectmanager en jouw vaste aanspreekpunt" },
      { k: "Media buyer", v: "Nederlands, draait jouw account, kent jouw niche" },
    ],
    result: "Twee namen, twee gezichten. Je weet altijd bij wie je moet zijn.",
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
      "Snelle reactie",
      "Eén call per maand, door ons voorbereid",
      "Meer bij volume, minder als er niets te bespreken is",
    ],
    result: "Je hoort van ons als er iets te melden is, niet omdat het dinsdag is.",
  },

  // --- Pagina 3 · Hoe wij werken -------------------------------------------
  {
    id: "rolverdeling",
    x: -430,
    y: 660,
    name: "Rolverdeling",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Wie levert wat.",
    bullets: [],
    rows: [
      { k: "Paid ads", v: "Jij levert de creatives" },
      { k: "Organic", v: "Wij maken het" },
    ],
    result: "Eén duidelijke grens, zodat er nooit iets tussen wal en schip valt.",
  },
  {
    id: "geen-pinterest-content",
    x: -298,
    y: 564,
    name: "Geen eigen content nodig",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Je bestaande materiaal is genoeg om mee te starten.",
    bullets: [
      "Wij gebruiken je bestaande Meta- en TikTok-materiaal",
      "Wij bepalen wat er live gaat",
      "Toegang tot je drive of creative-systeem is genoeg",
      "Op volume: gericht creative-advies uit onze data",
    ],
    result: "Je hoeft niets extra te laten maken om te kunnen starten.",
  },
  {
    id: "paid",
    x: -166,
    y: 468,
    name: "Paid",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Waar we beginnen en hoe we de campagnes opbouwen.",
    bullets: [
      "Sterkste markten en collecties eerst",
      "Campagnestructuur afgestemd op jouw merk en catalogus",
      "Targeting op interesses en zoektermen",
    ],
    result: "We starten waar je al wint, niet waar het spannend is.",
  },
  {
    id: "verwachtingen",
    x: -34,
    y: 372,
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
    result: "Rustig starten kost je twee weken. Te hard starten kost je het kanaal.",
  },
  {
    id: "organic",
    x: 98,
    y: 276,
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
      "Standaard inbegrepen — paid presteert zonder organic slechter",
    ],
    result: "Een kanaal dat blijft opleveren op de dagen dat je advertenties uitstaan.",
  },
  {
    id: "onboarding",
    x: 230,
    y: 180,
    name: "Onboarding",
    cat: "Pagina 3 · Hoe wij werken",
    desc: "Van akkoord naar live in vier stappen.",
    bullets: [
      "Setup fee betaald",
      "Slack en onboarding in Notion, 15 tot 20 minuten van jouw tijd",
      "Kick-off call: tracking, contracten, toegang",
      "Live",
    ],
    result: "Vier stappen, en 15 tot 20 minuten werk aan jouw kant.",
  },

  // --- Pagina 4 · Resultaten -----------------------------------------------
  {
    id: "hoe-wij-meten",
    x: 554,
    y: 660,
    name: "Hoe wij meten",
    cat: "Pagina 4 · Resultaten",
    desc: "Het meten staat vast vóór de eerste euro spend.",
    bullets: [
      "Attributievenster en UTM's goed vóór de eerste euro spend",
      "Bij volume: een third-party tool zoals Triple Whale, Converge of Billy Grace",
      "Wijkt het platform af van de third-party, dan zoeken we het uit",
      "Jouw P&L is de enige volledige waarheid",
    ],
    result: "Geen discussie achteraf over wiens cijfer klopt.",
  },
  {
    id: "de-cases",
    x: 884,
    y: 420,
    name: "De cases",
    cat: "Pagina 4 · Resultaten",
    desc: "Drie tot maximaal vier accounts, met de cijfers erbij.",
    bullets: [
      "Per case: start, markten, uitgangspunt, aanpak, waar het nu staat en organic",
      "Merknaam alleen waar de klant daar expliciet toestemming voor geeft",
      "Anders geanonimiseerd naar niche en markt",
    ],
    result: "Vergelijkbare merken met hun cijfers erbij, geen losse screenshots.",
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
    ],
    highlight: {
      k: "Waar het heen gaat",
      v: "15–30%",
      s: "van je advertentieomzet",
      f: "Opgebouwd over maanden",
    },
    result: "Eén getal om ons op af te rekenen, en de tijd die het kost om er te komen.",
  },

  // --- Pagina 5 · Prijs en garanties ---------------------------------------
  {
    id: "je-betaalt-niet",
    x: 1538,
    y: 660,
    name: "Niet gehaald, niet betaald",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Het vaste werk is laag geprijsd. De rest moeten wij verdienen.",
    bullets: [
      "Een lage vaste vergoeding voor het vaste werk",
      "Performance fee alleen bij het halen van vooraf afgesproken targets",
      "Target niet gehaald? De performance fee vervalt volledig, ook bij hoge spend",
    ],
    result: "Als het niet werkt, betaal je alleen de base fee.",
  },
  {
    id: "garanties",
    x: 1670,
    y: 564,
    name: "Garanties",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Wat er contractueel vastligt.",
    bullets: [],
    rows: [
      { k: "Minimale ROAS", v: "Daaronder betaal je alleen de base fee" },
      { k: "Omzetdrempel", v: "Onder €20.000 per maand geen performance fee" },
      { k: "Maximum", v: "Je factuur is gemaximeerd op €10.000 per maand" },
      { k: "Facturatie", v: "Altijd achteraf, nooit vooraf" },
      { k: "Looptijd", v: "2 maanden, daarna maandelijks opzegbaar" },
    ],
    result: "Vijf afspraken die in het contract staan, niet in een verkooppraatje.",
  },
  {
    id: "kpi",
    x: 1802,
    y: 468,
    name: "Op welke KPI sturen we?",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Jij kiest vooraf waarop we sturen. Het target moet aan beide kanten realistisch zijn, en seizoen mag meewegen.",
    bullets: [],
    rows: [
      { k: "Blended ROAS", v: "Voor de meeste merken" },
      { k: "New customer ROAS", v: "Focus op nieuwe klanten, bestaande basis" },
      { k: "CPA / CAC", v: "Abonnementen en hoge LTV" },
      { k: "Cost per session", v: "Bewust top-of-funnel, sturen op verkeer" },
    ],
    result: "Eén KPI waar we allebei op afgerekend worden, vooraf gekozen.",
  },
  {
    id: "prijs",
    x: 1934,
    y: 372,
    name: "Prijs",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Een eenmalige setup, een lage base fee en een performance fee op resultaat.",
    bullets: [],
    rows: [
      { k: "Eenmalige setup", v: "€1.000" },
      { k: "Base fee", v: "€1.000 per maand" },
      { k: "Performance fee", v: "Nog in te vullen" },
      { k: "Maximum", v: "€10.000 per maand" },
    ],
    highlight: {
      k: "Maximum per maand",
      v: "€10.000",
      s: "hard gemaximeerd",
      f: "Altijd achteraf gefactureerd",
    },
    result: "Een vaste ondergrens die laag is, en een bovengrens die vaststaat.",
  },
  {
    id: "wat-zit-erin",
    x: 2066,
    y: 276,
    name: "Wat zit erin",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Wat de setup fee dekt, en wat er maandelijks in de base fee zit.",
    bullets: [],
    columns: [
      {
        title: "In de setup fee",
        items: [
          "Merk- en concurrentieonderzoek op Pinterest",
          "Benchmarks uit onze portfolio",
          "Volledige organic opzet met SEO",
          "Opzet van het advertentieaccount",
          "Creative gameplan",
          "Kick-off call",
        ],
      },
      {
        title: "In de base fee",
        items: [
          "Media buying",
          "Organic beheer met dagelijkse plaatsingen",
          "Wekelijkse rapportage",
          "Maandelijkse call",
        ],
      },
    ],
    result: "Tien concrete onderdelen, zodat je weet waar je base fee heen gaat.",
  },
  {
    id: "waarom-dit-model",
    x: 2198,
    y: 180,
    name: "Waarom dit model",
    cat: "Pagina 5 · Prijs en garanties",
    desc: "Waarom wij niet op ad spend factureren.",
    bullets: [
      "Bureaus die op spend factureren verdienen aan uitgeven, niet aan resultaat",
      "Bij ons geldt: hogere ROAS is een hogere vergoeding",
      "De prikkel is eerst rendement, dan pas schaal",
      "Werkt het niet, dan stoppen wij er zelf mee",
    ],
    result: "Ons belang en jouw belang wijzen dezelfde kant op.",
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
// Pagina-hubs + de volledige opsomming per pagina
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
    count: "17 punten",
    cats: [
      {
        name: "Geen tweede Meta",
        systems: [
          "Inspiratieplatform, geen doomscroll",
          "Komen om te ontdekken en plannen",
          "Zoeken actief naar ideeën",
          "Oriëntatie: weken tot maanden",
          "Positieve omgeving",
          "Vroeger in de funnel dan Meta",
        ],
      },
      {
        name: "Schaal, eerlijk",
        systems: [
          "NL + BE: 7 tot 8 mln",
          "Duitsland: ±20 mln",
          "VS: ±100 mln vs 300–400 mln Meta",
          "Wereldwijd: ±600 mln, groeiend",
          "Aandeel: 15 tot 30%",
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
    catX: -1449,
    meta: "Pagina 2 · Het bureau",
    title: "Wie wij zijn",
    desc: "Eén kanaal, een Nederlands team en twee vaste mensen op jouw account.",
    count: "13 punten",
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
          "Geen offshore media buyers",
          "Zelf een merk gerund of media buying gedaan",
        ],
      },
      {
        name: "Wie jij krijgt",
        systems: [
          "Tristan — projectmanager, jouw aanspreekpunt",
          "Media buyer — draait jouw account, kent jouw niche",
        ],
      },
      {
        name: "Communicatie",
        systems: [
          "Slack",
          "Snelle reactie",
          "Eén call per maand, voorbereid",
          "Meer bij volume, minder als er niets is",
        ],
      },
    ],
  },
  {
    key: "p3",
    n: "03",
    x: -380,
    catX: -705,
    meta: "Pagina 3 · De uitvoering",
    title: "Hoe wij werken",
    desc: "Wie wat levert, wat je van paid mag verwachten en waarom organic standaard meegaat.",
    count: "24 punten",
    cats: [
      {
        name: "Rolverdeling",
        systems: ["Paid ads — jij levert creatives", "Organic — wij maken het"],
      },
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
          "Sterkste markten en collecties eerst",
          "Structuur op jouw merk en catalogus",
          "Targeting op interesses en zoektermen",
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
          "Setup fee betaald",
          "Slack en Notion, 15 tot 20 min",
          "Kick-off: tracking, contracten, toegang",
          "Live",
        ],
      },
    ],
  },
  {
    key: "p4",
    n: "04",
    x: 604,
    catX: 639,
    meta: "Pagina 4 · De cijfers",
    title: "Resultaten",
    desc: "Hoe we meten, welke cases we laten zien en wat realistisch is.",
    count: "9 punten",
    cats: [
      {
        name: "Hoe wij meten",
        systems: [
          "Attributievenster en UTM's vooraf",
          "Bij volume: third-party tool",
          "Afwijking uitzoeken, niet volhouden",
          "Jouw P&L is de waarheid",
        ],
      },
      {
        name: "De cases",
        systems: [
          "Drie tot maximaal vier cases",
          "Merknaam alleen met toestemming",
          "Anders naar niche en markt",
        ],
      },
      {
        name: "Wat realistisch is",
        systems: ["Geen beloftes", "15 tot 30%, opgebouwd over maanden"],
      },
    ],
  },
  {
    key: "p5",
    n: "05",
    x: 1588,
    catX: 1263,
    meta: "Pagina 5 · Het model",
    title: "Prijs en garanties",
    desc: "Lage vaste vergoeding, performance fee alleen op gehaalde targets.",
    count: "30 punten",
    cats: [
      {
        name: "Niet gehaald, niet betaald",
        systems: [
          "Lage vaste vergoeding",
          "Fee alleen bij gehaalde targets",
          "Niet gehaald? Fee vervalt volledig",
        ],
      },
      {
        name: "Garanties",
        systems: [
          "Minimale ROAS — eronder alleen base",
          "Onder €20.000 geen performance fee",
          "Maximum €10.000 per maand",
          "Altijd achteraf, nooit vooraf",
          "2 maanden, daarna maandelijks op",
        ],
      },
      {
        name: "KPI-keuze",
        systems: [
          "Blended ROAS — de meeste merken",
          "New customer ROAS",
          "CPA / CAC — abonnementen, hoge LTV",
          "Cost per session — top-of-funnel",
        ],
      },
      {
        name: "Prijs",
        systems: [
          "Eenmalige setup €1.000",
          "Base fee €1.000 per maand",
          "Performance fee nog in te vullen",
          "Maximum €10.000 per maand",
        ],
      },
      {
        name: "Wat zit erin",
        systems: [
          "Merk- en concurrentieonderzoek",
          "Benchmarks uit onze portfolio",
          "Volledige organic opzet met SEO",
          "Opzet advertentieaccount",
          "Creative gameplan",
          "Kick-off call",
          "Media buying",
          "Organic beheer, dagelijks",
          "Wekelijkse rapportage",
          "Maandelijkse call",
        ],
      },
      {
        name: "Waarom dit model",
        systems: [
          "Spend-facturatie beloont uitgeven",
          "Bij ons: hogere ROAS, hogere fee",
          "Prikkel is rendement, dan schaal",
          "Werkt het niet, dan stoppen wij",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Cases (pagina 4) — template, nog te vullen met de echte cijfers
// ---------------------------------------------------------------------------
export const RESULTS_CARD = { x: -836, y: 2276, w: 1672, h: 620 };
export const CASE = { w: 512, h: 380, y: 2432 };
export const CASE_GAP = 30;
export const CASE_LEFT = -798;

export interface CaseStudy {
  brand: string;
  niche: string;
  rows: { k: string; v: string }[];
}

const CASE_TEMPLATE_ROWS = [
  { k: "Start", v: "Maand, jaar" },
  { k: "Markten", v: "Landen" },
  { k: "Bij start", v: "Uitgangspunt" },
  { k: "Aanpak", v: "Catalogs, organic, et cetera" },
  { k: "Nu", v: "Omzet p/m · ROAS · aandeel van totaal" },
  { k: "Organic", v: "Impressies · omzet" },
];

export const CASES: CaseStudy[] = [
  { brand: "Case 1", niche: "Niche en markt", rows: CASE_TEMPLATE_ROWS },
  { brand: "Case 2", niche: "Niche en markt", rows: CASE_TEMPLATE_ROWS },
  { brand: "Case 3", niche: "Niche en markt", rows: CASE_TEMPLATE_ROWS },
];

export const RESULTS_TITLE = "De cases";
export const RESULTS_SUB =
  "Drie tot maximaal vier accounts · cijfers nog in te vullen";

// ---------------------------------------------------------------------------
// Team (pagina 2 — "Wie jij krijgt")
// ---------------------------------------------------------------------------
export const SUPPORT_CARD = { x: -836, y: 2996, w: 1672, h: 530 };
export const SHOT = { w: 512, h: 300, y: 3114 };

export const SUPPORT_TITLE = "Wie jij krijgt";
export const SUPPORT_SUB = "Twee vaste mensen en één kanaal om ons te bereiken";

export interface SupportShot {
  title: string;
  role: string;
  sub?: string;
}

export const SUPPORT_SHOTS: SupportShot[] = [
  {
    title: "Tristan",
    role: "Projectmanager",
    sub: "Jouw vaste aanspreekpunt. Bereidt de maandelijkse call voor.",
  },
  {
    title: "Media buyer",
    role: "Nederlands, vast op jouw account",
    sub: "Draait jouw account en kent jouw niche. Geen offshore.",
  },
  {
    title: "Slack",
    role: "Direct contact",
    sub: "Snelle reactie. Eén call per maand — meer bij volume, minder als er niets te bespreken is.",
  },
];

// ---------------------------------------------------------------------------
// Afsluiting
// ---------------------------------------------------------------------------
export const CTA = {
  x: -300,
  y: 3626,
  w: 600,
  h: 250,
  eyebrow: "Volgende stap",
  title: "Van akkoord naar live.",
  desc: "Setup fee betaald, Slack en onboarding in Notion (15 tot 20 minuten), kick-off call voor tracking, contracten en toegang. Daarna live.",
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
    bounds: { x: -2758, y: -360, w: 5196, h: 1724 },
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
    id: "prijs",
    index: "05",
    label: "Prijs en garanties",
    bounds: { x: 1498, y: -84, w: 940, h: 904 },
  },
  {
    id: "afsluiting",
    index: "06",
    label: "Cases, team en start",
    bounds: { x: -836, y: 2276, w: 1672, h: 1600 },
  },
];

export const TOOLBAR_HINT = [
  { k: "Slepen", v: "verschuiven" },
  { k: "Scrollen", v: "zoomen" },
  { k: "Pen", v: "tekenen" },
  { k: "←→", v: "pagina's" },
  { k: "⌘Z", v: "ongedaan maken" },
];
