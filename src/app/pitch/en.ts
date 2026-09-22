// De Engelse inhoud van het deck.
//
// Alleen tekst: geen coördinaten, geen beelden, geen figuurnamen. Die staan
// één keer in data.ts, en `nodesFor("en")` legt deze woorden eroverheen. Zo
// kan de Engelse pitch niet anders gaan staan dan de Nederlandse, en levert
// een nieuwe sectie hier hooguit een ontbrekende vertaling op in plaats van
// een kaart die op de verkeerde plek belandt.
//
// Een sleutel die hier ontbreekt valt terug op het Nederlands, zichtbaar in
// het deck. Dat is bewust: een gat moet opvallen, niet stilletjes verdwijnen.

import type { CaseFigures } from "./data";

export interface NodeCopy {
  name?: string;
  cat?: string;
  desc?: string;
  descOrganic?: string;
  bullets?: string[];
  question?: string;
  highlight?: { k: string; v: string; s?: string; f?: string };
  columns?: { title: string; items: string[] }[];
  /** Per case, op merknaam: de cijfers in beide standen. */
  cases?: Record<string, { brand?: string; paid: CaseFigures; organic: CaseFigures }>;
}

/** De titel boven elke pagina. */
export const EN_LANES: Record<string, { title: string; days: string }> = {
  "Pagina 1": { title: "Pinterest", days: "The channel" },
  "Pagina 2": { title: "Who we are", days: "The agency" },
  "Pagina 3": { title: "How we work", days: "The execution" },
  "Pagina 4": { title: "Results + pricing", days: "The numbers and the offer" },
};

/** De tabbalk bovenaan. */
export const EN_SECTIONS: Record<string, string> = {
  totaal: "Overview",
  pinterest: "Pinterest",
  wie: "Who we are",
  hoe: "How we work",
  resultaten: "Results + pricing",
};

/** De sectie Werkzaamheden, en daarmee ook wat er in de base fee zit. */
const EN_PAID = {
  title: "Paid",
  items: [
    "Analysis of what your brand already runs",
    "Campaign structure built on your brand and catalogue",
    "Catalogue ads for a broad catalogue",
    "Creatives picked from the material you have",
    "Media buying and scaling",
  ],
};

const EN_ORGANIC = {
  title: "Organic",
  items: [
    "Full profile setup with SEO",
    "Boards, structure and search terms",
    "Daily pins",
    "Ongoing management of the profile",
  ],
};

const EN_START = {
  title: "Start",
  items: [
    "Brand and competitor research on Pinterest",
    "Benchmarks from our portfolio",
    "Full organic setup: keyword research, boards, structure",
    "Setup of the ad account",
    "Creative game plan",
    "Kick-off call",
  ],
};

const EN_CONTACT = {
  title: "Contact",
  items: ["Weekly reporting", "Monthly call"],
};

export const EN_WERKZAAMHEDEN = [
  EN_PAID,
  EN_ORGANIC,
  { title: "Start and contact", items: [...EN_START.items, ...EN_CONTACT.items] },
];

export const EN_SETUP_WERK = EN_START.items;
export const EN_BASE_WERK = [EN_PAID, EN_ORGANIC, EN_CONTACT];

const PAGE1 = "Page 1 · Pinterest";
const PAGE2 = "Page 2 · Who we are";
const PAGE3 = "Page 3 · How we work";
const PAGE4 = "Page 4 · Results + pricing";

export const EN_NODES: Record<string, NodeCopy> = {
  "geen-tweede-meta": {
    name: "Not a second Meta",
    cat: PAGE1,
    desc: "Pinterest is a platform for inspiration, not for doomscrolling. That changes who you reach, and when.",
    bullets: [
      "A place for inspiration, not for doomscrolling",
      "People actively search for ideas: interiors, outfits, gifts",
      "Earlier in the funnel than Meta, far earlier than Google",
    ],
  },
  "schaal-eerlijk": {
    name: "Scale",
    cat: PAGE1,
    desc: "Smaller than Meta, and that is exactly the point: less competition and lower CPMs.",
    bullets: [
      "NL + BE: 7 to 8 million users",
      "Germany: around 20 million",
      "US: around 100 million, against 300 to 400 million on Meta",
      "Worldwide: around 600 million, and growing",
      "Less competition than on Meta, in almost every market",
      "CPMs sit well below Meta's",
    ],
    highlight: {
      k: "Realistic share",
      v: "15–30%",
      s: "of your ad revenue",
      f: "Built up over months, not in week one",
    },
  },
  "pinterest-verder-niets": {
    name: "Pinterest only",
    cat: PAGE2,
    desc: "One channel, all the way. No second channel to fall back on.",
    bullets: [
      "5 years on Pinterest",
      "2 years fully focused on brands",
      "No Meta, no Google, no TikTok",
      "Other agencies do Pinterest on the side, we have no second channel",
    ],
  },
  "nederlands-team": {
    name: "Dutch team",
    cat: PAGE2,
    desc: "Senior media buyers in the Netherlands, with experience on larger DTC brands.",
    bullets: [
      "Our own office in Hengelo, the Netherlands",
      "Senior media buyers only, no juniors doing it on the side",
      "Experience with DTC brands spending six figures a month",
      "A Dutch project manager as your fixed point of contact",
    ],
  },
  communicatie: {
    name: "Communication",
    cat: PAGE2,
    desc: "Short and direct. No calls for the sake of calls.",
    bullets: [
      "Slack",
      "Always a reply within 3 hours",
      "A monthly check-in call, prepared by us",
      "More calls whenever you want them",
    ],
  },
  verwachtingen: {
    name: "Expectations",
    cat: PAGE3,
    desc: "What to expect in the first weeks, and where it goes over the months after that.",
    bullets: [
      "The algorithm learns on time, not on spend",
      "Dumping budget produces bad data",
      "Start at €100 to €200 per day in total",
      "Scale as soon as ROAS allows it",
      "No promises",
      "15 to 30% of your ad revenue, built up over months",
      "For one brand it takes weeks, for another it takes longer",
    ],
    question: "So what is possible?",
    highlight: {
      k: "Where it goes",
      v: "15–30%",
      s: "of your ad revenue",
      f: "Start at €100 to €200 per day, up as soon as ROAS allows",
    },
  },
  werkzaamheden: {
    name: "What we do",
    cat: PAGE3,
    desc: "The work itself.",
    columns: EN_WERKZAAMHEDEN,
  },
  "geen-eigen-content": {
    name: "Creatives",
    cat: PAGE3,
    desc: "The material you already have is enough to start with. No separate Pinterest creatives needed.",
    bullets: [
      "We use the Meta and TikTok material you already run",
      "We decide what goes live",
      "Access to your drive or creative system is enough",
      "At volume: specific creative advice from our data",
    ],
  },
  organic: {
    name: "Organic",
    cat: PAGE3,
    desc: "Pinterest is a search engine. That makes organic anything but a side note.",
    bullets: [
      "Pinterest is a search engine, so SEO",
      "Full profile setup: boards, structure, search terms",
      "Daily pins",
      "Found without any ad budget",
      "A stronger profile means paid converts better",
      "Revenue from month 3 to 6 onwards",
      "Included as standard, paid performs worse without it",
    ],
  },
  paid: {
    name: "Paid",
    cat: PAGE3,
    desc: "First find out what already works, then build.",
    bullets: [
      "We start by analysing what your brand already runs: Meta results, which creatives perform, and which landing pages convert in Shopify",
      "On that basis we build the campaign structure, shaped around your brand and catalogue",
      "With several strong products or a broad catalogue we use catalogue ads",
      "Only then do we go live, strongest markets and collections first",
    ],
  },
  "de-cases": {
    name: "Results",
    cat: PAGE4,
    desc: "Four accounts, largest first. All figures for this year.",
    descOrganic: "Organic revenue over the last 30 days, in euros.",
    cases: {
      "Fashion merk (anoniem)": {
        brand: "Fashion brand (anonymous)",
        paid: {
          label: "This year",
          value: "€ 1.8m",
          unit: "Revenue",
          metric: "ROAS 2.37 · CPA €28",
        },
        organic: {
          label: "Last 30 days",
          value: "€ 2,530",
          unit: "Organic revenue",
          metric: "Without any ad budget",
        },
      },
      Celestia: {
        paid: {
          label: "This year",
          value: "€ 692k",
          unit: "Revenue",
          metric: "ROAS 2.42 · CPA €33",
        },
        organic: {
          label: "Last 30 days",
          value: "€ 3,740",
          unit: "Organic revenue",
          metric: "Without any ad budget",
        },
      },
      FitCherries: {
        paid: {
          label: "This year",
          value: "€ 420k",
          unit: "Revenue",
          metric: "ROAS 2.20 · CPA €34",
        },
        organic: {
          label: "Last 30 days",
          value: "€ 3,320",
          unit: "Organic revenue",
          metric: "Without any ad budget",
        },
      },
      "May Cosmetics": {
        paid: {
          label: "This year",
          value: "€ 389k",
          unit: "Revenue",
          metric: "ROAS 2.31 · CPA €17",
        },
        organic: {
          label: "Last 30 days",
          value: "€ 3,270",
          unit: "Organic revenue",
          metric: "Without any ad budget",
        },
      },
    },
  },
  "pricing-uitleg": {
    name: "Pricing",
    cat: PAGE4,
    desc: "How the model works, in three parts.",
    bullets: [
      "Setup fee: once, at the start",
      "Base fee: fixed, every month",
      "Performance fee: over your ad spend, and only when the agreed KPI is met",
    ],
  },
  "de-calculator": { name: "Calculator", cat: PAGE4 },
  garanties: {
    name: "Guarantees",
    cat: PAGE4,
    desc: "What the contract says.",
    bullets: [
      "We set the KPI and the target together, upfront",
      "Target missed: the performance fee is waived",
      "We measure over the full month, not per campaign",
      "The monthly invoice is capped",
      "Always invoiced afterwards, never upfront",
      "2 months, monthly thereafter",
    ],
  },
};

/** De vijf artikelen van de overeenkomst, voor de garantiesectie. */
export const EN_CLAUSES = (cap: string): [string, string][] => [
  ["KPI and target", "Agreed together, upfront. You choose what we steer on: ROAS or CPA."],
  [
    "Target missed",
    "The performance fee is waived. Measured over the full month, not per campaign.",
  ],
  ["Cap", `The monthly invoice is capped at ${cap}.`],
  ["Invoicing", "Always afterwards, never upfront."],
  ["Term", "2 months, monthly thereafter."],
];
