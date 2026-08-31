/**
 * READ-ONLY. Vergelijkt wat er op het Monday-bord staat met wat Pinterest op
 * dit moment teruggeeft. Schrijft niets — dit is de controle, niet de correctie
 * (dat is scripts/refresh-week-numbers.ts).
 *
 * Drie soorten verschil die je hier ziet, en alleen de laatste is een defect:
 *
 *  - **Revenue hoger in Pinterest op een oudere week.** Late conversies na de
 *    vriesdatum. Verwacht, en de reden dat refresh-week-numbers.ts bestaat.
 *  - **Revenue anders bij een [S]-store.** Die revenue komt uit Shopify en is
 *    met de hand ingevuld; Pinterest' eigen attributie is daar een ander
 *    getal, niet een beter getal. Het staat tussen haakjes om die reden.
 *  - **Spend die afwijkt.** Dat hoort niet. Gemeten 31-08-2026 over drie weken
 *    en 120 vergelijkingen: twee gevallen, allebei verklaarbaar (een week die
 *    met de hand was ingevuld voordat het ad account gekoppeld was, en €4,24
 *    nagekomen drift).
 *
 * Gebruik:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-week-vs-pinterest.ts
 *   WEEK_OFFSET=1 ... (één week verder terug)
 */
import 'dotenv/config';
import {
  loadClients, loadAllWeekSubitems, previousFullWeek, todayUtc, isoDate,
  addDays, fetchWeekMetrics, weekNumbers, roasOf, isSpendOnly, isAlreadySynced,
  connectedAdAccountIds, AdAccountNotConnected,
  type ClientConfig, type ExistingSubitems,
} from './weekly-update-sync';

const COL_SPEND_PREV = 'numeric_mm0qz9qs';
const COL_REVENUE_PREV = 'numeric_mm1cwqpp';
const COL_ROAS_PREV = 'numeric_mm1cde88';
const COL_ROAS = 'numeric_mm1c77w2';

const n2 = (x: number | null) => (x === null ? '—' : x.toFixed(2));
const key = (a: Date, b: Date) => `${isoDate(a)} - ${isoDate(b)}`;

(async () => {
  const back = parseInt(process.env.WEEK_OFFSET ?? '0', 10);
  const today = addDays(todayUtc(), -7 * back);
  const { start, end } = previousFullWeek(today);
  const prevWeek = { start: addDays(start, -7), end: addDays(end, -7) };
  const wk = key(start, end);
  const pwk = key(prevWeek.start, prevWeek.end);
  console.log(`WEEK ${wk}   (vorige week: ${pwk})   nu: ${new Date().toISOString()}\n`);

  const [clients, board, connected] = await Promise.all([
    loadClients(), loadAllWeekSubitems(), connectedAdAccountIds(),
  ]);
  console.log(`${clients.length} actieve stores, ${board.size} klantregels met weekregels, ${connected?.size ?? '?'} gekoppelde ad accounts\n`);

  type Row = {
    store: string; spendOnly: boolean; frozen: boolean;
    boardSpend: number | null; boardRev: number | null; boardRoas: number | null;
    piSpend: number | null; piRev: number | null;
    dSpend: number | null; dRev: number | null;
    derived: string[];
    note: string | null;
  };
  const rows: Row[] = [];
  const skipped: string[] = [];

  const batch = 8;
  for (let i = 0; i < clients.length; i += batch) {
    await Promise.all(clients.slice(i, i + batch).map(async (c: ClientConfig) => {
      const sub: ExistingSubitems | undefined = board.get(String(c.mondayItemId));
      const week = sub?.weeks[wk];
      const prev = weekNumbers(sub?.weeks[pwk]);
      const cur = weekNumbers(week);
      const spendOnly = isSpendOnly(c);

      if (connected && !connected.has(c.pinterestAdAccountId)) {
        skipped.push(`${c.storeName} — ad account niet gekoppeld (handmatig ingevuld)`);
        return;
      }
      let pi: { spend: number; revenue: number } | null = null;
      let note: string | null = null;
      try {
        pi = await fetchWeekMetrics(c, start, end);
      } catch (e) {
        if (e instanceof AdAccountNotConnected) { skipped.push(`${c.storeName} — ${e.message}`); return; }
        note = (e as Error).message.slice(0, 90);
      }

      // afgeleide kolommen: wat er staat vs. wat uit de weekregels volgt
      const d: string[] = [];
      if (week) {
        const got = (id: string) => {
          const t = week.derived[id];
          return t === null || t === undefined || t === '' ? null : parseFloat(t.replace(/,/g, ''));
        };
        const want: Array<[string, string, number | null]> = [
          ['Spend last week', COL_SPEND_PREV, prev.spend === null ? null : Math.round(prev.spend * 100) / 100],
          ['Revenue last week', COL_REVENUE_PREV, prev.revenue === null ? null : Math.round(prev.revenue * 100) / 100],
          ['ROAS last week', COL_ROAS_PREV, roasOf(prev)],
          ['ROAS (for update)', COL_ROAS, roasOf(cur)],
        ];
        for (const [label, id, expect] of want) {
          const have = got(id);
          if (expect === null && have === null) continue;
          if (expect === null) { d.push(`${label}: bord ${have}, verwacht leeg`); continue; }
          if (have === null) { d.push(`${label}: leeg, verwacht ${expect}`); continue; }
          if (Math.abs(have - expect) > 0.051) d.push(`${label}: bord ${have}, verwacht ${expect}`);
        }
      }

      rows.push({
        store: c.storeName, spendOnly, frozen: week ? isAlreadySynced(week, spendOnly) : false,
        boardSpend: cur.spend, boardRev: cur.revenue, boardRoas: roasOf(cur),
        piSpend: pi ? Math.round(pi.spend * 100) / 100 : null,
        piRev: pi ? Math.round(pi.revenue * 100) / 100 : null,
        dSpend: pi && cur.spend !== null ? Math.round((pi.spend - cur.spend) * 100) / 100 : null,
        dRev: pi && cur.revenue !== null ? Math.round((pi.revenue - cur.revenue) * 100) / 100 : null,
        derived: d, note,
      });
    }));
  }

  rows.sort((a, b) => Math.abs(b.dRev ?? 0) - Math.abs(a.dRev ?? 0));

  const pad = (s: string, w: number) => s.length > w ? s.slice(0, w - 1) + '…' : s.padEnd(w);
  const padl = (s: string, w: number) => s.padStart(w);
  console.log(pad('STORE', 24), padl('BORD spend', 12), padl('PIN spend', 12), padl('Δ', 10),
              padl('BORD rev', 12), padl('PIN rev', 12), padl('Δ', 10), ' ROAS b/p');
  console.log('-'.repeat(115));
  for (const r of rows) {
    const piRoas = r.piSpend && r.piSpend > 0 && r.piRev !== null ? Math.round((r.piRev / r.piSpend) * 10) / 10 : null;
    const flag = (r.dSpend !== null && Math.abs(r.dSpend) > 0.5) || (!r.spendOnly && r.dRev !== null && Math.abs(r.dRev) > 0.5) ? ' <<' : '';
    console.log(
      pad(r.store + (r.spendOnly ? ' [S]' : ''), 24),
      padl(n2(r.boardSpend), 12), padl(n2(r.piSpend), 12), padl(r.dSpend === null ? '—' : r.dSpend.toFixed(2), 10),
      padl(n2(r.boardRev), 12), padl(n2(r.piRev), 12),
      padl(r.dRev === null ? '—' : (r.spendOnly ? '(' + r.dRev.toFixed(0) + ')' : r.dRev.toFixed(2)), 10),
      ` ${r.boardRoas ?? '—'}/${piRoas ?? '—'}${flag}${r.note ? ' ERR:' + r.note : ''}`
    );
  }

  console.log('\nAFGELEIDE KOLOMMEN — afwijkingen:');
  let any = false;
  for (const r of rows) for (const d of r.derived) { console.log(`  ${r.store}: ${d}`); any = true; }
  if (!any) console.log('  geen');

  console.log('\nNIET VERGELEKEN (handmatig):');
  for (const s of skipped) console.log('  ' + s);

  const missing = rows.filter((r) => r.boardSpend === null);
  console.log(`\nGEEN CIJFERS OP HET BORD: ${missing.length ? missing.map((m) => m.store).join(', ') : 'geen'}`);
  const notFrozen = rows.filter((r) => !r.frozen);
  console.log(`NIET BEVROREN (sync zou ze nog schrijven): ${notFrozen.length ? notFrozen.map((m) => m.store).join(', ') : 'geen'}`);
  process.exit(0);
})();
