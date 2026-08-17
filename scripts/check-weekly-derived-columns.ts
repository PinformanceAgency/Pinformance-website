/**
 * Controleert derivedColumnValues() uit weekly-update-sync.ts.
 *
 * WAAROM DIT APART STAAT
 * ----------------------
 * Vier kolommen op het weekregel-bord volgen uit de regel van vorige week en de
 * regel van deze week: "Spend last week", "Revenue last week", "ROAS last week"
 * en "ROAS (for update)". Ze zijn niet cosmetisch -- de formulekolommen ernaast
 * (Spend/Revenue/ROAS +/- %) rekenen ermee, en de ROAS-percentages rekenen met
 * de AFGERONDE ROAS. Eén decimaal verkeerd afgerond en het percentage in de
 * klantupdate klopt niet met de cijfers die eronder staan.
 *
 * De verwachte waarden hieronder zijn geen bedachte voorbeelden: het zijn regels
 * die op 17-08-2026 op het bord stonden, met de waarden die de media buyers daar
 * met de hand in hebben gezet. Dit script pint dus vast dat de automatisering
 * exact hetzelfde uitrekent als het handwerk dat het vervangt -- inclusief de
 * kolom-ID's, want een fout ID schrijft stil in de verkeerde kolom.
 *
 * DRAAIEN
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-weekly-derived-columns.ts
 *
 * (De env-var is nodig omdat weekly-update-sync.ts op modulenivo op
 * MONDAY_API_TOKEN controleert; er wordt geen enkele API-call gedaan.)
 */
import 'dotenv/config';
import { derivedColumnValues, type WeekNumbers } from './weekly-update-sync';

// Kolom-ID's op het subitem-bord, bewust als letterlijke tekst en niet
// geïmporteerd: zo valt het op als iemand een ID in de sync omzet.
const SPEND_PREV = 'numeric_mm0qz9qs';
const REVENUE_PREV = 'numeric_mm1cwqpp';
const ROAS_PREV = 'numeric_mm1cde88';
const ROAS = 'numeric_mm1c77w2';

interface Case {
  naam: string;
  prev: WeekNumbers;
  current: WeekNumbers;
  verwacht: Record<string, number>;
}

const CASES: Case[] = [
  // --- Echte regels van het bord (week 03-08 t/m 09-08-2026) ---------------
  {
    naam: 'May Cosmetics NL',
    prev: { spend: 3330.66, revenue: 6783.37 },
    current: { spend: 2916.69, revenue: 10668.99 },
    // Bord: ROAS last week 2, ROAS (for update) 3.7
    verwacht: {
      [SPEND_PREV]: 3330.66,
      [REVENUE_PREV]: 6783.37,
      [ROAS_PREV]: 2,
      [ROAS]: 3.7,
    },
  },
  {
    naam: 'FitCherries',
    prev: { spend: 4420, revenue: 10890 },
    current: { spend: 4023.59, revenue: 7575.91 },
    // Bord: 2.5 en 1.9 -- let op: 1,88 moet 1,9 worden, niet 1,8.
    verwacht: {
      [SPEND_PREV]: 4420,
      [REVENUE_PREV]: 10890,
      [ROAS_PREV]: 2.5,
      [ROAS]: 1.9,
    },
  },
  {
    naam: 'Icon-Amsterdam',
    prev: { spend: 2032, revenue: 6423 },
    current: { spend: 2077, revenue: 3667 },
    // Bord: 3.2 en 1.8
    verwacht: {
      [SPEND_PREV]: 2032,
      [REVENUE_PREV]: 6423,
      [ROAS_PREV]: 3.2,
      [ROAS]: 1.8,
    },
  },
  {
    naam: 'The Longevity Store (ROAS onder 1)',
    prev: { spend: 744.35, revenue: 186.6 },
    current: { spend: 930.93, revenue: 294 },
    // Bord: 0.3 en 0.3
    verwacht: {
      [SPEND_PREV]: 744.35,
      [REVENUE_PREV]: 186.6,
      [ROAS_PREV]: 0.3,
      [ROAS]: 0.3,
    },
  },

  // --- Randgevallen --------------------------------------------------------
  {
    // Shopify Revenue + Refunds: de revenue van deze week vult Tristan met de
    // hand, dus wij kennen de ROAS van deze week niet. De cijfers van vorige
    // week staan wél op het bord en gaan dus gewoon mee.
    naam: 'spend-only: geen ROAS deze week',
    prev: { spend: 1000, revenue: 2500 },
    current: { spend: 1200, revenue: null },
    verwacht: {
      [SPEND_PREV]: 1000,
      [REVENUE_PREV]: 2500,
      [ROAS_PREV]: 2.5,
    },
  },
  {
    // Pas geonboarde store: de week ervoor bestaat niet. Niets van vorige week
    // schrijven -- een 0 daar maakt van de WoW-formule een sprong van +oneindig.
    naam: 'eerste week van een nieuwe store',
    prev: { spend: null, revenue: null },
    current: { spend: 800, revenue: 1600 },
    verwacht: { [ROAS]: 2 },
  },
  {
    // Week stilgezet, daarna nog een late conversie: spend 0 met revenue erop.
    // De formulekolom geeft daar een deelfout; wij laten ROAS leeg.
    naam: 'vorige week spend 0',
    prev: { spend: 0, revenue: 120 },
    current: { spend: 500, revenue: 1000 },
    verwacht: {
      [SPEND_PREV]: 0,
      [REVENUE_PREV]: 120,
      [ROAS]: 2,
    },
  },
  {
    // Store stond helemaal stil. 0 is een echte waarde en moet mee, maar er is
    // geen ROAS.
    naam: 'deze week helemaal stil',
    prev: { spend: 400, revenue: 0 },
    current: { spend: 0, revenue: 0 },
    verwacht: {
      [SPEND_PREV]: 400,
      [REVENUE_PREV]: 0,
      [ROAS_PREV]: 0,
    },
  },
];

const LABEL: Record<string, string> = {
  [SPEND_PREV]: 'spendLW',
  [REVENUE_PREV]: 'revLW',
  [ROAS_PREV]: 'roasLW',
  [ROAS]: 'roas',
};

function show(cols: Record<string, number>): string {
  const keys = Object.keys(cols);
  if (keys.length === 0) return '(niets)';
  return keys.map((k) => `${LABEL[k] ?? k}=${cols[k]}`).join(' ');
}

let fouten = 0;
for (const c of CASES) {
  const uit = derivedColumnValues(c.prev, c.current);
  const ok = JSON.stringify(uit) === JSON.stringify(c.verwacht);
  if (!ok) {
    fouten += 1;
  }
  console.log(`${ok ? 'OK  ' : 'FOUT'}  ${c.naam.padEnd(38)} ${show(uit)}`);
  if (!ok) {
    console.log(`      verwacht:                          ${show(c.verwacht)}`);
  }
}

if (fouten > 0) {
  console.error(`\n${fouten} van de ${CASES.length} gevallen fout.`);
  process.exit(1);
}
console.log(`\nAlle ${CASES.length} gevallen goed.`);
