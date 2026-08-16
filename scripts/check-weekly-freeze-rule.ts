/**
 * Controleert isAlreadySynced() uit weekly-update-sync.ts.
 *
 * WAAROM DIT APART STAAT
 * ----------------------
 * Deze regel bepaalt of een bestaande weekregel op het Monday-bord met rust
 * gelaten of overschreven wordt. Fout in de ene richting = de cijfers blijven
 * leeg (dat gebeurde vóór 16-08-2026 bij media buyers die vroeg begonnen);
 * fout in de andere richting = handmatig werk van een buyer wordt overschreven.
 *
 * Een droogloop van de sync laat dit niet zien: die kan alleen de gevallen
 * tonen die op dat moment toevallig op het bord staan, en juist het geval
 * "regel bestaat maar is leeg" bestaat pas nadat de seed-cron heeft gedraaid.
 * Daarom hier alle gevallen expliciet, zonder Monday of Pinterest.
 *
 * DRAAIEN
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-weekly-freeze-rule.ts
 *
 * (De env-var is nodig omdat weekly-update-sync.ts op modulenivo op
 * MONDAY_API_TOKEN controleert; er wordt geen enkele API-call gedaan.)
 */
import 'dotenv/config';
import { isAlreadySynced } from './weekly-update-sync';

interface Case {
  naam: string;
  spend: string | null;
  revenue: string | null;
  spendOnly: boolean;
  verwacht: boolean;
}

const CASES: Case[] = [
  // Aanvullen: wij hebben hier nog geen cijfers geschreven.
  { naam: 'seed: beide leeg', spend: '', revenue: '', spendOnly: false, verwacht: false },
  { naam: 'buyer vulde alleen zone/tekst', spend: null, revenue: null, spendOnly: false, verwacht: false },
  { naam: 'halve run: spend wel, revenue niet', spend: '1234', revenue: '', spendOnly: false, verwacht: false },
  { naam: 'spend-only, spend nog leeg', spend: '', revenue: '', spendOnly: true, verwacht: false },

  // Bevriezen: de cijfers staan er al, late conversies mogen ze niet muteren.
  { naam: 'normale store, beide gevuld', spend: '1234', revenue: '5678', spendOnly: false, verwacht: true },
  { naam: 'spend-only, spend gevuld (revenue komt met de hand)', spend: '1234', revenue: '', spendOnly: true, verwacht: true },
  { naam: 'spend-only met handmatig ingevulde revenue', spend: '900', revenue: '4200.50', spendOnly: true, verwacht: true },
  // '0' is gevuld: een store die stilstond krijgt 0 geschreven en die 0 moet
  // daarna net zo goed bevriezen als elk ander bedrag.
  { naam: 'store stond stil: spend 0, revenue 0', spend: '0', revenue: '0', spendOnly: false, verwacht: true },
];

let fouten = 0;
for (const c of CASES) {
  const uit = isAlreadySynced({ spend: c.spend, revenue: c.revenue }, c.spendOnly);
  const ok = uit === c.verwacht;
  if (!ok) {
    fouten += 1;
  }
  console.log(
    `${ok ? 'OK  ' : 'FOUT'}  ${c.naam.padEnd(52)} bevroren=${String(uit).padEnd(5)} verwacht=${c.verwacht}`,
  );
}

if (fouten > 0) {
  console.error(`\n${fouten} van de ${CASES.length} gevallen fout.`);
  process.exit(1);
}
console.log(`\nAlle ${CASES.length} gevallen goed.`);
