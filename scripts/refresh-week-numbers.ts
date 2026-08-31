/**
 * Haalt nagekomen conversies alsnog op het bord — omhoog, nooit omlaag.
 *
 * WAAROM DIT BESTAAT NAAST DE SYNC
 * ---------------------------------
 * De maandagsync bevriest een week zodra spend en revenue erin staan: een
 * verstuurde update mag niet achteraf muteren. Dat is de goede standaard,
 * maar Pinterest telt na die maandag nog dagen door op late conversies —
 * gemeten 31-08-2026 stond week 17-08 bij vijftien stores tot €1.079 hoger
 * dan op het bord. Dit script is de bewuste uitzondering: het draait op
 * aanvraag, per week, en alleen op verzoek van iemand die weet welke week
 * al bij de klant ligt.
 *
 * DE REGELS DIE HET NIET OVERTREEDT
 * ---------------------------------
 * - **Alleen omhoog.** Een lager cijfer betekent hier niet "de vorige meting
 *   was fout" maar "Pinterest heeft iets gecrediteerd of geherattribueerd",
 *   en dat achteraf naar beneden bijstellen in een al verstuurde update is
 *   erger dan het laten staan.
 * - **Spend blijft ongemoeid.** Die wijkt in de praktijk niet af (drie weken,
 *   120 vergelijkingen, twee uitzonderingen) en is geen conversievenster.
 * - **Spend-only stores houden hun revenue.** Die komt uit Shopify en is met
 *   de hand ingevuld; Pinterest' eigen attributie is daar een ander getal,
 *   niet een beter getal. Hun ROAS wordt wél berekend uit wat op het bord
 *   staat — precies wat de sync zelf niet kan omdat hij die revenue niet kent.
 * - **De week erna wordt meegetrokken.** "Revenue last week" en "ROAS last
 *   week" op de volgende weekregel zijn kopieën van de regel die hier
 *   verandert. Laat je die staan, dan rekent de ROAS +/- formule op de nieuwe
 *   update tegen een getal dat op de regel eronder niet meer bestaat.
 *
 * Gebruik:
 *   REFRESH_DRY_RUN=1 npx tsx scripts/refresh-week-numbers.ts 2026-08-17 2026-08-24
 *   npx tsx scripts/refresh-week-numbers.ts 2026-08-17 2026-08-24
 *
 * De weken worden verwerkt in de volgorde waarin je ze meegeeft; geef ze dus
 * oud → nieuw, anders leest de nieuwste regel de oude cijfers van zijn
 * voorganger.
 */
import 'dotenv/config';
import {
  loadClients, loadAllWeekSubitems, addDays, isoDate, fetchWeekMetrics,
  weekNumbers, roasOf, isSpendOnly, connectedAdAccountIds, AdAccountNotConnected,
  mondayQuery, UPDATE_SUBITEM, BOARD_WEEKLY_SUBITEMS,
  type ClientConfig,
} from './weekly-update-sync';

const DRY = process.env.REFRESH_DRY_RUN === '1';

const COL_REVENUE = 'numeric_mm0dgayk';
const COL_SPEND_PREV = 'numeric_mm0qz9qs';
const COL_REVENUE_PREV = 'numeric_mm1cwqpp';
const COL_ROAS_PREV = 'numeric_mm1cde88';
const COL_ROAS = 'numeric_mm1c77w2';

const round2 = (n: number) => Math.round(n * 100) / 100;
const weekKey = (start: Date) => `${isoDate(start)} - ${isoDate(addDays(start, 6))}`;
const asNum = (t: string | null | undefined): number | null => {
  if (t === null || t === undefined || t === '') return null;
  const n = parseFloat(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

interface Change { store: string; itemId: string; cols: Record<string, number>; why: string[] }

async function main() {
  const weeks = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (weeks.length === 0) {
    console.error('Geef één of meer weken mee als maandag-datum, oud → nieuw. Bijv: 2026-08-17 2026-08-24');
    process.exit(1);
  }
  console.log(`${DRY ? 'DRY RUN — er wordt niets geschreven' : 'LIVE — het bord wordt bijgewerkt'}\n`);

  const [clients, board, connected] = await Promise.all([
    loadClients(), loadAllWeekSubitems(), connectedAdAccountIds(),
  ]);

  // Wat dit script zelf al bijwerkte, zodat de volgende week de nieuwe cijfers
  // van zijn voorganger leest en niet die van het bord van vijf minuten geleden.
  const revised = new Map<string, { spend: number | null; revenue: number | null }>();

  for (const day of weeks) {
    const start = new Date(`${day}T00:00:00Z`);
    const key = weekKey(start);
    const prevKey = weekKey(addDays(start, -7));
    console.log(`\n=== WEEK ${key} ===`);

    const changes: Change[] = [];
    const batch = 8;
    for (let i = 0; i < clients.length; i += batch) {
      await Promise.all(clients.slice(i, i + batch).map(async (c: ClientConfig) => {
        const sub = board.get(String(c.mondayItemId));
        const row = sub?.weeks[key];
        if (!row) return;                       // geen weekregel: niets bij te werken
        if (connected && !connected.has(c.pinterestAdAccountId)) return; // handmatige store

        const cur = weekNumbers(row);
        const prev = revised.get(`${c.mondayItemId}|${prevKey}`) ?? weekNumbers(sub?.weeks[prevKey]);
        const spendOnly = isSpendOnly(c);
        const why: string[] = [];
        const cols: Record<string, number> = {};

        let revenue = cur.revenue;
        if (!spendOnly) {
          let pi: { spend: number; revenue: number };
          try {
            pi = await fetchWeekMetrics(c, start, addDays(start, 6));
          } catch (e) {
            if (e instanceof AdAccountNotConnected) return;
            console.log(`  ! ${c.storeName}: ${(e as Error).message.slice(0, 100)}`);
            return;
          }
          const piRev = round2(pi.revenue);
          if (cur.revenue === null || piRev > cur.revenue + 0.01) {
            why.push(`revenue ${cur.revenue ?? '—'} → ${piRev}`);
            cols[COL_REVENUE] = piRev;
            revenue = piRev;
          }
        }

        // ROAS van deze week volgt uit spend + de revenue die nu op de regel
        // komt te staan. Bij spend-only is dat de handmatig ingevulde omzet —
        // de enige plek waar die ROAS ooit vandaan kan komen.
        const roas = roasOf({ spend: cur.spend, revenue });
        if (roas !== null && asNum(row.derived[COL_ROAS]) !== roas) {
          why.push(`ROAS (for update) ${row.derived[COL_ROAS] || 'leeg'} → ${roas}`);
          cols[COL_ROAS] = roas;
        }

        // De cijfers van de week ervoor, voor het geval die hierboven zijn
        // opgehoogd of destijds leeg gebleven zijn.
        const wants: Array<[string, string, number | null]> = [
          ['Spend last week', COL_SPEND_PREV, prev.spend === null ? null : round2(prev.spend)],
          ['Revenue last week', COL_REVENUE_PREV, prev.revenue === null ? null : round2(prev.revenue)],
          ['ROAS last week', COL_ROAS_PREV, roasOf(prev)],
        ];
        for (const [label, id, want] of wants) {
          if (want === null) continue;
          if (asNum(row.derived[id]) === want) continue;
          why.push(`${label} ${row.derived[id] || 'leeg'} → ${want}`);
          cols[id] = want;
        }

        if (Object.keys(cols).length > 0) {
          changes.push({ store: c.storeName, itemId: row.id, cols, why });
        }
        revised.set(`${c.mondayItemId}|${key}`, { spend: cur.spend, revenue });
      }));
    }

    changes.sort((a, b) => a.store.localeCompare(b.store));
    for (const ch of changes) console.log(`  ${ch.store}: ${ch.why.join(' · ')}`);
    if (changes.length === 0) console.log('  niets bij te werken');

    if (!DRY) {
      for (let i = 0; i < changes.length; i += 6) {
        await Promise.all(changes.slice(i, i + 6).map(async (ch) => {
          await mondayQuery(UPDATE_SUBITEM, {
            boardId: String(BOARD_WEEKLY_SUBITEMS),
            itemId: ch.itemId,
            cols: JSON.stringify(ch.cols),
          });
        }));
      }
      console.log(`  → ${changes.length} regel(s) bijgewerkt`);
    }
  }
  process.exit(0);
}

main();
