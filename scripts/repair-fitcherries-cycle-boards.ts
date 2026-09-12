/**
 * Eenmalige reparatie voor Fit Cherries (12-09-2026).
 *
 * WAT ER MIS WAS
 * --------------
 * Beide lopende URL's stonden zonder topic in de database. checkBoards()
 * heeft aan beide kanten een topic nodig en zweeg daardoor volledig -- wat
 * op het scherm niet te onderscheiden is van "alle boards kloppen". Zo
 * belandde "Bikinis for Petite Women" in de rotatie van een collectie
 * padded push-up beha's, met vier ingeplande pins (16-09, 22-09, 28-09 en
 * 04-10) die daarheen zouden gaan. Dat board heeft bovendien één pin, dus
 * het faalt ook op de tien-pins-regel uit P1.2.9.
 *
 * De code is los hiervan gerepareerd: een ontbrekend topic is nu zelf een
 * afwijking op het paneel. Dit script zet alleen de gegevens recht die de
 * stille periode heeft opgeleverd.
 *
 * WAT HET DOET
 * ------------
 *   1. Zet het topic op de twee lopende URL's. Beide vallen onder Women's
 *      Underwear: "Bhs" is de behacollectie, en de "Essential High Waist"
 *      URL wijst vandaag naar "Midnight Charm Boy Short" -- ondergoed, geen
 *      badmode.
 *   2. Geeft het board "Supportive Bras" het topic dat het al had moeten
 *      hebben. Een board zonder topic telt voor geen enkele dekking mee en
 *      is tegen geen enkele URL te matchen.
 *   3. Vervangt "Bikinis for Petite Women" door "Bras for Small Chests" op
 *      de Bhs-cycle, en verhangt de vier ingeplande pins mee.
 *
 * Wat het NIET doet: het primaire keyword van de Essential High Waist URL
 * staat op "small bust swimwear" en dat klopt niet met het product. Dat
 * wijzigen herschrijft bestandsnamen, titels en de design brief van een
 * cycle die al een pin gepubliceerd heeft, dus dat is een beslissing van
 * Clarissa en geen reparatie. Hetzelfde geldt voor de vier designs die in
 * beide cycles hetzelfde beeld zijn: daar moet een mens nieuwe uploaden.
 *
 *     REPAIR_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/repair-fitcherries-cycle-boards.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/repair-fitcherries-cycle-boards.ts
 *
 * Veilig om opnieuw te draaien: elke stap kijkt eerst of hij nog nodig is.
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";

const DRY = process.env.REPAIR_DRY_RUN === "1";
const STORE = "Fit Cherries";
const TOPIC = "Women's Underwear";

/** URL-fragment -> het topic dat erbij hoort. */
const URL_TOPICS: Array<[fragment: string, topic: string]> = [
  ["collections/bhs", TOPIC],
  ["products/essential-high-waist", TOPIC],
];

/** Boards die zelf geen topic dragen maar er duidelijk één hebben. */
const BOARD_TOPICS: Array<[board: string, topic: string]> = [
  ["Supportive Bras", TOPIC],
];

/** Op welke cycle welk board waardoor vervangen wordt. */
const BOARD_SWAPS: Array<[urlFragment: string, from: string, to: string]> = [
  ["collections/bhs", "Bikinis for Petite Women", "Bras for Small Chests"],
];

const deed = (t: string) => console.log(`  ${DRY ? "\x1b[33mZOU\x1b[0m " : "\x1b[32mOK\x1b[0m  "} ${t}`);
const sla_over = (t: string) => console.log(`  \x1b[90m--\x1b[0m   ${t}`);
const fout = (t: string) => { mislukt++; console.log(`  \x1b[31mFOUT\x1b[0m ${t}`); };
let mislukt = 0;

async function main() {
  const p = organicPool();
  if (DRY) console.log("\x1b[33mDRY RUN — er wordt niets weggeschreven.\x1b[0m\n");

  const org = (await p.query<{ id: string }>(
    `SELECT id::text FROM organizations WHERE name = $1`, [STORE]
  )).rows[0];
  if (!org) { console.error(`Store "${STORE}" niet gevonden.`); process.exit(1); }

  const topicId = async (naam: string) => (await p.query<{ id: string }>(
    `SELECT id::text FROM organic.topics WHERE org_id = $1 AND name = $2`, [org.id, naam]
  )).rows[0]?.id ?? null;

  console.log("1. Topic op de URL's");
  for (const [fragment, topicNaam] of URL_TOPICS) {
    const t = await topicId(topicNaam);
    if (!t) { fout(`topic "${topicNaam}" bestaat niet`); continue; }

    const u = (await p.query<{ id: string; name: string; topic_id: string | null }>(
      `SELECT id::text, name, topic_id::text FROM organic.urls
        WHERE org_id = $1 AND url LIKE $2`, [org.id, `%${fragment}%`]
    )).rows[0];
    if (!u) { fout(`geen URL met "${fragment}"`); continue; }
    if (u.topic_id === t) { sla_over(`${u.name} staat al op ${topicNaam}`); continue; }
    if (u.topic_id != null) { sla_over(`${u.name} heeft al een ander topic — met rust gelaten`); continue; }

    if (!DRY) {
      await p.query(`UPDATE organic.urls SET topic_id = $1 WHERE id = $2`, [t, u.id]);
    }
    deed(`${u.name} -> ${topicNaam}`);
  }

  console.log("\n2. Topic op de boards");
  for (const [boardNaam, topicNaam] of BOARD_TOPICS) {
    const t = await topicId(topicNaam);
    if (!t) { fout(`topic "${topicNaam}" bestaat niet`); continue; }

    const b = (await p.query<{ id: string; topic_id: string | null }>(
      `SELECT id::text, topic_id::text FROM organic.boards
        WHERE org_id = $1 AND name = $2`, [org.id, boardNaam]
    )).rows[0];
    if (!b) { fout(`board "${boardNaam}" niet gevonden`); continue; }
    if (b.topic_id != null) { sla_over(`"${boardNaam}" heeft al een topic`); continue; }

    if (!DRY) {
      await p.query(`UPDATE organic.boards SET topic_id = $1 WHERE id = $2`, [t, b.id]);
    }
    deed(`"${boardNaam}" -> ${topicNaam}`);
  }

  console.log("\n3. Board vervangen in de rotatie");
  for (const [fragment, vanNaam, naarNaam] of BOARD_SWAPS) {
    const u = (await p.query<{ id: string; name: string }>(
      `SELECT id::text, name FROM organic.urls WHERE org_id = $1 AND url LIKE $2`,
      [org.id, `%${fragment}%`]
    )).rows[0];
    if (!u) { fout(`geen URL met "${fragment}"`); continue; }

    const van = (await p.query<{ id: string; position: number }>(
      `SELECT b.id::text, ub.position FROM organic.url_boards ub
         JOIN organic.boards b ON b.id = ub.board_id
        WHERE ub.url_id = $1 AND b.name = $2`, [u.id, vanNaam]
    )).rows[0];
    if (!van) { sla_over(`"${vanNaam}" staat niet (meer) op ${u.name}`); continue; }

    const naar = (await p.query<{ id: string }>(
      `SELECT id::text FROM organic.boards
        WHERE org_id = $1 AND name = $2 AND status <> 'PLANNED'::organic.board_status`,
      [org.id, naarNaam]
    )).rows[0];
    if (!naar) { fout(`vervangend board "${naarNaam}" niet gevonden of nog niet op Pinterest`); continue; }

    // Een board dat al in deze rotatie zit mag er niet twee keer in: dan
    // krijgt het twee van de vier designs en een ander board geen.
    const alAanwezig = (await p.query(
      `SELECT 1 FROM organic.url_boards WHERE url_id = $1 AND board_id = $2`, [u.id, naar.id]
    )).rowCount;
    if (alAanwezig) { fout(`"${naarNaam}" zit al in de rotatie van ${u.name}`); continue; }

    // Een gepubliceerde pin staat op Pinterest en wordt niet verhangen --
    // die is geschiedenis. Alleen wat nog uit moet, verhuist mee.
    const teVerhangen = (await p.query<{ n: string; eerste: string | null }>(
      `SELECT COUNT(*)::text AS n, MIN(p.scheduled_date)::text AS eerste
         FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.url_id = $1 AND p.board_id = $2
          AND p.status NOT IN ('PUBLISHED'::organic.pin_status,
                               'CANCELLED'::organic.pin_status)`,
      [u.id, van.id]
    )).rows[0];

    const gepubliceerd = (await p.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM organic.pins p
         JOIN organic.waterfalls w ON w.id = p.waterfall_id
        WHERE w.url_id = $1 AND p.board_id = $2
          AND p.status = 'PUBLISHED'::organic.pin_status`,
      [u.id, van.id]
    )).rows[0];

    if (!DRY) {
      await p.query(
        `UPDATE organic.url_boards SET board_id = $1 WHERE url_id = $2 AND board_id = $3`,
        [naar.id, u.id, van.id]
      );
      await p.query(
        `UPDATE organic.pins p
            SET board_id = $1
           FROM organic.waterfalls w
          WHERE w.id = p.waterfall_id AND w.url_id = $2 AND p.board_id = $3
            AND p.status NOT IN ('PUBLISHED'::organic.pin_status,
                                 'CANCELLED'::organic.pin_status)`,
        [naar.id, u.id, van.id]
      );
    }
    deed(
      `${u.name}: pos ${van.position} "${vanNaam}" -> "${naarNaam}", ` +
      `${teVerhangen.n} pin(s) mee` +
      (teVerhangen.eerste ? ` (eerstvolgend ${teVerhangen.eerste})` : "") +
      (Number(gepubliceerd.n) > 0 ? `, ${gepubliceerd.n} al gepubliceerd blijft staan` : "")
    );
  }

  console.log(
    mislukt === 0
      ? `\n\x1b[32mKlaar.\x1b[0m${DRY ? " Draai opnieuw zonder REPAIR_DRY_RUN om het echt te doen." : " Controleer met scripts/check-board-relevance.ts."}`
      : `\n\x1b[31m${mislukt} stap(pen) mislukt.\x1b[0m`
  );
  process.exit(mislukt === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
