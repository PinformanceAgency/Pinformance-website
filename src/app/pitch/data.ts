// Pitch canvas content + world coordinates.
//
// Every node is placed in a world coordinate space that the canvas pans and
// zooms over. Coordinates are absolute and never change; only the camera moves.
// The origin (0,0) sits at the top-left of the middle phase lane, so the three
// lanes straddle it symmetrically.

export type SectionId =
  | "roadmap"
  | "phase1"
  | "phase2"
  | "phase3"
  | "systems"
  | "results"
  | "support";

export interface Section {
  id: SectionId;
  index: string;
  label: string;
  /** World-space bounds the camera fits when this section is selected. */
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
  eyebrow: "PINFORMANCE",
  title: ["Growth", "Engine™"],
  sub: ["Jouw roadmap voor de komende 4 maanden", "van START naar schaalbaar — in 3 fases"],
};

export const START_NODE = {
  x: -1774,
  y: 590,
  w: 220,
  h: 160,
  eyebrow: "Kickoff",
  title: "START",
};

// ---------------------------------------------------------------------------
// Phase lanes
// ---------------------------------------------------------------------------
export const LANE = { w: 940, h: 820, y: 0, titleY: -84, titleH: 58 };

export interface Lane {
  n: string;
  x: number;
  title: string;
  days: string;
}

export const LANES: Lane[] = [
  { n: "Fase 1", x: -1454, title: "Fix je fundament", days: "Dag 0–30" },
  { n: "Fase 2", x: -470, title: "We vullen je agenda", days: "Dag 30–60" },
  { n: "Fase 3", x: 514, title: "We halen je uit de operatie", days: "Dag 60–120" },
];

// ---------------------------------------------------------------------------
// Roadmap nodes — the zigzag chain of highlighted systems
// ---------------------------------------------------------------------------
export const NODE_SIZE = { w: 200, h: 71 };

export interface RoadmapNode {
  id: string;
  x: number;
  y: number;
  name: string;
  /** Category shown above the title in the detail modal. */
  cat: string;
  desc: string;
  result: string;
}

export const ROADMAP_NODES: RoadmapNode[] = [
  {
    id: "zero-resistance-offer",
    x: -1469.4,
    y: 656.8,
    name: "Zero Resistance Offer",
    cat: "Aanbod & deep dive",
    desc: "Een onweerstaanbaar aanbod op papier — zo gepositioneerd dat 'ja' logischer voelt dan 'nee', ongeacht de prijs.",
    result: "Direct meer verkopen — je doelgroep weet exact wat ze kopen én wat het ze oplevert.",
  },
  {
    id: "objection-framework",
    x: -1281.4,
    y: 517.4,
    name: "Objection Framework",
    cat: "Sales systems",
    desc: "Elk bezwaar dat je ooit krijgt, vooraf uitgeschreven met het antwoord dat werkt — geen improvisatie meer in de call.",
    result: "Hogere closing rate omdat twijfel wordt weggenomen voordat die ontstaat.",
  },
  {
    id: "magic-lantern",
    x: -1084,
    y: 394.4,
    name: "Magic Lantern",
    cat: "Aanbod & deep dive",
    desc: "De verhaalstructuur die je prospect zichzelf laat overtuigen — van huidige situatie naar gewenste uitkomst.",
    result: "Prospects verkopen zichzelf de samenwerking in plaats van dat jij moet duwen.",
  },
  {
    id: "dfy-crm-system",
    x: -886.6,
    y: 287.8,
    name: "DFY CRM System",
    cat: "CEO dashboard & CRM",
    desc: "Een volledig ingerichte CRM met pipelines, automations en opvolging — done-for-you opgeleverd.",
    result: "Geen lead valt meer tussen wal en schip; alles wordt automatisch opgevolgd.",
  },
  {
    id: "ceo-kpi-dashboard",
    x: -698.6,
    y: 181.2,
    name: "CEO KPI Dashboard",
    cat: "CEO dashboard & CRM",
    desc: "Eén scherm met de cijfers die er echt toe doen — omzet, pipeline, marge en capaciteit, live bijgewerkt.",
    result: "Je stuurt op cijfers in plaats van op gevoel, elke week opnieuw.",
  },
  {
    id: "outbound-video-system",
    x: -485.4,
    y: 476.4,
    name: "Outbound Video System",
    cat: "Outbound",
    desc: "Gepersonaliseerde video-outreach op schaal — met scripts, opnamestructuur en verzendflow.",
    result: "Respons-percentages die tekst-outbound niet haalt, zonder dat het uren kost.",
  },
  {
    id: "dm-outbound",
    x: -297.4,
    y: 386.2,
    name: "DM Outbound",
    cat: "Outbound",
    desc: "Een DM-machine met openers, opvolgstappen en kwalificatie — zo ingericht dat gesprekken vanzelf lopen.",
    result: "Voorspelbaar gevulde agenda zonder afhankelijk te zijn van advertentiebudget.",
  },
  {
    id: "content-media-kit",
    x: -100,
    y: 312.4,
    name: "Content Media Kit",
    cat: "Inbound",
    desc: "Alles wat je nodig hebt om consistent content te maken: templates, hooks, formats en een publicatieritme.",
    result: "Je wordt zichtbaar bij je doelgroep zonder elke week opnieuw te moeten bedenken wat je post.",
  },
  {
    id: "lead-nurture-os",
    x: 97.4,
    y: 238.6,
    name: "Lead Nurture OS",
    cat: "Lead gen",
    desc: "Het systeem dat koude en lauwe leads warm houdt tot ze klaar zijn om te kopen.",
    result: "Leads die vroeger verdwenen, komen maanden later alsnog binnen als klant.",
  },
  {
    id: "ads-accelerator",
    x: 285.4,
    y: 164.8,
    name: "Ads Accelerator",
    cat: "Paid ads",
    desc: "De campagnestructuur, creatives en optimalisatieritmes die betaald verkeer winstgevend maken.",
    result: "Schaalbare instroom van gekwalificeerde leads tegen een voorspelbare kostprijs.",
  },
  {
    id: "sop-hub",
    x: 564.4,
    y: 328.8,
    name: "SOP Hub",
    cat: "Operations OS",
    desc: "Elk proces in je bedrijf vastgelegd, vindbaar en overdraagbaar — de basis om te kunnen delegeren.",
    result: "Nieuwe teamleden draaien binnen dagen mee in plaats van weken.",
  },
  {
    id: "retention-mastery",
    x: 884,
    y: 214,
    name: "Retention Mastery",
    cat: "Path to profit",
    desc: "Het systeem dat klanten langer laat blijven: onboarding, succesmomenten en proactieve check-ins.",
    result: "Hogere lifetime value zonder dat je één extra lead hoeft te kopen.",
  },
  {
    id: "ai-agents",
    x: 1194.2,
    y: 99.2,
    name: "AI Agents",
    cat: "AI agents",
    desc: "Agents die het repetitieve werk overnemen — van research en opvolging tot rapportage.",
    result: "Je team doet het werk dat telt; de rest draait vanzelf op de achtergrond.",
  },
];

// ---------------------------------------------------------------------------
// "More systems" label
// ---------------------------------------------------------------------------
export const SYS_LABEL = {
  x: -580,
  y: 1030,
  w: 1160,
  h: 78,
  eyebrow: "Nog veel meer klaarstaan",
  title: "Alle overige systemen die we klaar hebben staan",
  hint: "Klik een fase open om alles te zien →",
};

// ---------------------------------------------------------------------------
// Phase hubs + their full system catalogues
// ---------------------------------------------------------------------------
export const HUB = { w: 760, h: 230, y: 1134 };
export const CAT = { w: 210, h: 40, y: 1404 };
export const SYS = { w: 210, h: 46, y: 1466, stride: 56 };

export interface Category {
  name: string;
  systems: string[];
}

export interface PhaseHub {
  key: "fn01" | "fn02" | "fn03";
  n: string;
  x: number;
  /** X where the category columns for this phase start. */
  catX: number;
  meta: string;
  title: string;
  desc: string;
  count: string;
  cats: Category[];
}

export const PHASE_HUBS: PhaseHub[] = [
  {
    key: "fn01",
    n: "01",
    x: -1560,
    catX: -1645,
    meta: "Dag 0–30 · Maand 1",
    title: "Fix je fundament",
    desc: "Je aanbod, sales en cijfers op orde — de basis waar alles op draait.",
    count: "31 systemen",
    cats: [
      {
        name: "Aanbod & deep dive",
        systems: [
          "Expert Domination",
          "Zero Resistance Offer",
          "Dream Buyer Avatar",
          "Acquisition Architect",
          "Reactivation Sequence",
        ],
      },
      {
        name: "Lead nurture",
        systems: [
          "Show Up Follow Up",
          "Thank You Page OS",
          "Pre Call Sequence",
          "Four Pillars of Lead Nurture",
          "Outbound Reminder Script",
          "Inbound Reminder Script",
        ],
      },
      {
        name: "Sales systems",
        systems: [
          "Discovery Framework",
          "Zero Resistance Pitch",
          "No Close Sequence",
          "No Show Sequence",
          "Objection Handeling OS",
          "BAMFAM",
          "Referral OS",
          "Script Hub",
          "Sales Tracking Sheet",
          "SOP Hub",
        ],
      },
      {
        name: "CEO dashboard & CRM",
        systems: [
          "DFY CRM System",
          "Automation OS",
          "AI Agents",
          "CEO KPI Dashboard",
          "Client Management Dashboard",
          "Sales Dashboard",
          "Finance Dashboard",
          "Outbound Dashboard",
          "Content Dashboard",
          "Paid Ads Dashboard",
        ],
      },
    ],
  },
  {
    key: "fn02",
    n: "02",
    x: -500,
    catX: -585,
    meta: "Dag 30–60 · Maand 2",
    title: "We vullen je agenda",
    desc: "Geautomatiseerde systemen die voorspelbaar gekwalificeerde calls in je agenda zetten.",
    count: "25 systemen",
    cats: [
      {
        name: "Lead gen",
        systems: ["Lead Nurture OS", "AI Lead Sourcing Agent", "Scraping Tools", "Lead Sourcer OS"],
      },
      {
        name: "Outbound",
        systems: [
          "Outbound Mastery",
          "Outbound Video System",
          "DM Pitch System",
          "Cold Call Combat",
          "Reply Flow Hub",
          "AI Agents Hub",
        ],
      },
      {
        name: "Inbound",
        systems: [
          "Inbound Incubator",
          "Content Compass",
          "Organic YouTube",
          "Email Neutron",
          "Give Aways",
          "Story Sequences",
          "Referral Engine",
          "Claude Creative Hub",
        ],
      },
      {
        name: "Paid ads",
        systems: [
          "Ads Accelerator",
          "Lead Magnet Lab",
          "Landing Page Playbook",
          "Follow Up Formula",
          "Optimalisatie Mastery",
          "VSL OS",
          "Retargeting Rate",
        ],
      },
    ],
  },
  {
    key: "fn03",
    n: "03",
    x: 680,
    catX: 475,
    meta: "Dag 60–120 · Maand 3–4",
    title: "We halen je uit de operatie",
    desc: "Team, SOP's en automatisering runnen de show — zonder jou.",
    count: "35 systemen",
    cats: [
      {
        name: "Founder freedom",
        systems: [
          "The Vision",
          "Reverse Engineering",
          "Automation Hub",
          "Productivity Tracker",
          "Communication Pro",
          "Mindset Mastery",
        ],
      },
      {
        name: "AI agents",
        systems: [
          "AI Video Editor Agent",
          "AI Designer Agent",
          "AI Copywriter Agent",
          "AI Media Buying Agent",
          "AI Customer Success Manager Agent",
        ],
      },
      {
        name: "Team building",
        systems: [
          "Hiring + Training COO",
          "Hiring + Training Ops Manager",
          "Hiring + Training Ops Assistant",
          "Hiring + Training CMO",
          "Hiring + Training Sales Manager",
          "Hiring + Training Closers",
          "Hiring + Training Inbound Setters",
          "Hiring + Training Outbound Setters",
          "Hiring + Training VA",
          "Hiring + Training CSM",
        ],
      },
      {
        name: "Operations OS",
        systems: [
          "Client Success",
          "Tracking Data",
          "Managing Clients Problems",
          "Managing Failed Payments",
          "Single Source of Truth",
          "Client Onboarding",
          "Slack Support",
          "Contract OS",
        ],
      },
      {
        name: "Path to profit",
        systems: [
          "Retention Mastery",
          "Upsell Unity",
          "Downsell Play",
          "Cross-sell Code",
          "Pricing Playbook",
          "LTV Maximizer",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
export const RESULTS_CARD = { x: -836, y: 2276, w: 1672, h: 821 };
export const TESTI = { w: 300, h: 169 };

export interface Testimonial {
  name: string;
  from: string;
  to: string;
  role?: string;
}

export const TESTIMONIALS: Testimonial[] = [
  { name: "Floris van Vleuten", from: "€50k", to: "€110k" },
  { name: "Julia de Jong", from: "€5k", to: "€20k" },
  { name: "Sharon & Tim", from: "€12k", to: "€45k" },
  { name: "Geert Hopman", from: "€200", to: "€12k" },
  { name: "Merijn Snippert", from: "€8k", to: "€32k" },
  { name: "Yannick van Lee", from: "€12k", to: "€42k" },
  { name: "Manita de Ceuninck", from: "€5k", to: "€15k" },
  { name: "Thierry", from: "€12k", to: "€43k" },
  { name: "Eran de Silva", from: "€11k", to: "€51k" },
  { name: "Niels Buist", from: "€12k", to: "€28k" },
  { name: "Emil & Dre", from: "€11k", to: "€36k" },
  { name: "Jaaf & Sherwin", from: "€40k", to: "€135k" },
  { name: "Yoah Konar", from: "€9k", to: "€32k", role: "Online fitness coach" },
];

export const RESULTS_TITLE = "Wat onze klanten al bereikt hebben";
export const RESULTS_MORE = { title: "Nog meer social proof", hint: "Bekijk alle testimonials →" };

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------
export const SUPPORT_CARD = { x: -836, y: 3287, w: 1672, h: 576 };
export const SHOT = { w: 512, h: 330, y: 3405 };

export const SUPPORT_TITLE = "Support mechanisme";

export interface SupportShot {
  title: string;
  role: string;
  sub?: string;
}

export const SUPPORT_SHOTS: SupportShot[] = [
  { title: "Yorden van de Lagemaat", role: "Frontend coach" },
  { title: "Micky Vennings", role: "Backend coach" },
  {
    title: "Private Slack-channel",
    role: "Al je vragen — direct met het team dat je helpt",
    sub: "SOP's op maat + we kijken met je mee · Looms wanneer je vastloopt",
  },
];

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------
export const CTA = {
  x: 1934,
  y: 170,
  w: 600,
  h: 250,
  eyebrow: "Volgende stap",
  title: "Laten we samen jouw roadmap bouwen.",
  desc: "In je Blueprint-sessie tekenen we samen je Agency/Consulting OS uit en kiezen we welk systeem als eerste omzet oplevert. Wij bouwen, jij draait — in 120 dagen.",
  button: "Claim jouw plek →",
};

// ---------------------------------------------------------------------------
// Sections the tab bar navigates between
// ---------------------------------------------------------------------------
export const SECTIONS: Section[] = [
  {
    id: "roadmap",
    index: "00",
    label: "De roadmap",
    bounds: { x: -1774, y: -360, w: 3228, h: 1508 },
  },
  {
    id: "phase1",
    index: "01",
    label: "Fase 1 · Fix je fundament",
    bounds: { x: -1454, y: -84, w: 940, h: 904 },
  },
  {
    id: "phase2",
    index: "02",
    label: "Fase 2 · We vullen je agenda",
    bounds: { x: -470, y: -84, w: 940, h: 904 },
  },
  {
    id: "phase3",
    index: "03",
    label: "Fase 3 · We halen je uit de operatie",
    bounds: { x: 514, y: -84, w: 940, h: 904 },
  },
  {
    id: "systems",
    index: "04",
    label: "Alle systemen",
    bounds: { x: -1645, y: 1030, w: 3290, h: 986 },
  },
  {
    id: "results",
    index: "05",
    label: "Resultaten",
    bounds: { x: -836, y: 2276, w: 1672, h: 821 },
  },
  {
    id: "support",
    index: "06",
    label: "Support",
    bounds: { x: -836, y: 3287, w: 1672, h: 576 },
  },
];

export const TOOLBAR_HINT = [
  { k: "Rechtermuis", v: "slepen" },
  { k: "Scroll", v: "zoomen" },
  { k: "Pen", v: "tekenen" },
  { k: "←→", v: "fases" },
  { k: "⌘Z", v: "ongedaan" },
];
