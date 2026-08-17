#!/usr/bin/env -S npx tsx
/**
 * Vult de afgeleide kolommen van een AL BESTAANDE week op het Weekly
 * Updates-bord bij: "Spend last week", "Revenue last week", "ROAS last week" en
 * "ROAS (for update)".
 *
 * WAAROM DIT NAAST DE CRON BESTAAT
 * --------------------------------
 * De sync van 17-08-2026 schreef alleen "Spend last week"; de andere drie bleven
 * week na week leeg (8, 3 en 0 van de 49 regels in de week van 10-08). De cron
 * vult ze vanaf nu mee, maar hij komt niet terug op weken die hij al gedaan
 * heeft: zodra spend en revenue erin staan is de regel bevroren, zodat late
 * conversies de cijfers van een verstuurde klantupdate niet meer muteren. Dit
 * script is het gereedschap voor die weken.
 *
 * WAT HET NIET DOET
 * -----------------
 *  - Het praat niet met Pinterest. Alles wordt gerekend met wat er OP HET BORD
 *    staat, dus spend en revenue blijven per definitie ongemoeid en een late
 *    conversie kan de cijfers niet meer verschuiven. Daarom werkt het ook voor
 *    spend-only stores: die revenue is handwerk en staat alleen op het bord.
 *  - Het overschrijft niets. Een kolom waar al iets in staat wordt overgeslagen,
 *    ook als wij iets anders zouden uitrekenen. Handwerk gaat voor.
 *  - Het raakt alleen de vier kolommen hierboven. Zone, tekstupdate en de
 *    "+/- (for update)"-tekstkolommen blijven van de media buyer.
 *
 * DRAAIEN
 *     # vorige volle week, eerst droog
 *     DOTENV_CONFIG_PATH=.env.local BACKFILL_DRY_RUN=1 npx tsx scripts/backfill-week-derived.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-week-derived.ts
 *
 *     # een specifieke week, op de maandag van die week
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-week-derived.ts 2026-08-03
 */
import 'dotenv/config';
import {
  BOARD_WEEKLY_SUBITEMS,
  DERIVED_COLUMNS,
  UPDATE_SUBITEM,
  addDays,
  derivedColumnValues,
  inBatches,
  isoDate,
  loadAllWeekSubitems,
  mondayQuery,
  previousFullWeek,
  todayUtc,
  weekNumbers,
} from './weekly-update-sync';

const DRY_RUN = process.env.BACKFILL_DRY_RUN === '1';

/** Zelfde batchgrootte als de seed en de sync; Monday knijpt bij meer. */
const BATCH = 6;

function weekKeyFrom(monday: Date): string {
  return `${isoDate(monday)} - ${isoDate(addDays(monday, 6))}`;
}

function parseWeekArg(arg: string | undefined): Date {
  if (!arg) {
    return previousFullWeek(todayUtc()).start;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    throw new Error(`Verwacht een datum als 2026-08-03, kreeg: ${arg}`);
  }
  const d = new Date(`${arg}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Ongeldige datum: ${arg}`);
  }
  // Weekregels lopen maandag t/m zondag; een andere dag levert een sleutel op
  // die op geen enkele regel past en dus stil 0 treffers geeft.
  if (d.getUTCDay() !== 1) {
    throw new Error(`${arg} is geen maandag -- geef de maandag van de week.`);
  }
  return d;
}

async function main(): Promise<void> {
  const monday = parseWeekArg(process.argv[2]);
  const key = weekKeyFrom(monday);
  const prevKey = weekKeyFrom(addDays(monday, -7));

  console.log(`Week      ${key}`);
  console.log(`Vorige    ${prevKey}`);
  if (DRY_RUN) {
    console.log('DRY RUN -- er wordt niets naar Monday geschreven.\n');
  } else {
    console.log('');
  }

  const byParent = await loadAllWeekSubitems();

  interface Job {
    store: string;
    subitemId: string;
    cols: Record<string, number>;
  }
  const jobs: Job[] = [];
  let zonderRegel = 0;
  let alCompleet = 0;

  for (const [, entry] of byParent) {
    const row = entry.weeks[key];
    if (!row) {
      // Store zonder regel voor deze week: niets om bij te vullen. Dat is normaal
      // voor stores die toen nog niet actief waren.
      zonderRegel += 1;
      continue;
    }
    const store = entry.parentName ?? '(naam onbekend)';
    const wil = derivedColumnValues(weekNumbers(entry.weeks[prevKey]), weekNumbers(row));

    // Alleen lege kolommen. Wat er al staat is van een media buyer of van een
    // eerdere run en blijft staan.
    const cols: Record<string, number> = {};
    for (const col of DERIVED_COLUMNS) {
      if (!(col in wil)) continue;
      if ((row.derived[col] ?? '') !== '') continue;
      cols[col] = wil[col];
    }

    if (Object.keys(cols).length === 0) {
      alCompleet += 1;
      continue;
    }
    jobs.push({ store, subitemId: row.id, cols });
  }

  console.log(
    `${jobs.length} regels bij te vullen, ${alCompleet} al compleet, ` +
      `${zonderRegel} stores zonder regel voor deze week\n`,
  );

  const gefaald: string[] = [];
  await inBatches(jobs, BATCH, async (job) => {
    const wat = Object.entries(job.cols)
      .map(([col, value]) => `${col}=${value}`)
      .join(' ');
    try {
      if (!DRY_RUN) {
        await mondayQuery(UPDATE_SUBITEM, {
          boardId: String(BOARD_WEEKLY_SUBITEMS),
          itemId: job.subitemId,
          cols: JSON.stringify(job.cols),
        });
      }
      console.log(
        `${DRY_RUN ? 'ZOU' : 'OK '} ${job.store.slice(0, 26).padEnd(27)} ${wat}`,
      );
    } catch (exc) {
      console.error(
        `FOUT ${job.store}: ${exc instanceof Error ? exc.message : String(exc)}`,
      );
      gefaald.push(job.store);
    }
  });

  console.log(
    `\nKlaar: ${jobs.length - gefaald.length} bijgewerkt, ${gefaald.length} gefaald`,
  );
  if (gefaald.length) {
    console.error(`HANDMATIG NALOPEN: ${gefaald.join(', ')}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
