/**
 * Staat elke pin van een lopende cycle op een board dat bij de URL hoort --
 * en is elk design werkelijk een ander beeld?
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Twee fouten die er op geen enkel scherm uitzagen als een fout, beide
 * gevonden op Fit Cherries (12-09-2026):
 *
 *   1. Beide lopende URL's hadden GEEN topic. checkBoards() kon daardoor
 *      niets vergelijken en zweeg -- wat er precies zo uitziet als "alle
 *      boards kloppen". Zo stond "Bikinis for Petite Women" in de rotatie
 *      van een collectie padded push-up beha's, met vier ingeplande pins
 *      die daarheen zouden gaan. De code is intussen gerepareerd (een
 *      ontbrekend topic is nu zelf een afwijking), maar een controle die
 *      buiten de app om kijkt vangt ook wat we morgen kapot maken.
 *
 *   2. Design 1 van de ene cycle en design 1 van de andere waren hetzelfde
 *      bestand -- byte voor byte, twee keer met de hand geupload. Het
 *      dashboard hernoemt een upload naar het primaire keyword van DIE URL,
 *      dus één plaatje kreeg twee namen en zag er in de database uit als
 *      twee designs. Vandaar de ETag-vergelijking hieronder: Supabase
 *      Storage geeft de md5 van het object terug, dus dubbele beelden zijn
 *      met één HEAD per design zichtbaar.
 *
 * Leest alleen. Exit 1 zodra er iets gevonden wordt.
 *
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-board-relevance.ts "Fit Cherries"
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-board-relevance.ts    # alle organic-stores
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";

const naam = process.argv[2] ?? null;
let bevindingen = 0;

const ok = (t: string) => console.log(`   \x1b[32mok\x1b[0m   ${t}`);
const stop = (t: string) => { bevindingen++; console.log(`   \x1b[31mFOUT\x1b[0m ${t}`); };
const let_op = (t: string) => console.log(`   \x1b[33mlet op\x1b[0m ${t}`);

interface CycleRow {
  waterfall_id: string;
  url_id: string;
  url: string;
  url_name: string;
  url_topic_id: string | null;
  url_topic: string | null;
  wf_status: string;
}

interface BoardRow {
  board_id: string;
  position: number;
  board_name: string;
  board_topic_id: string | null;
  board_topic: string | null;
  board_status: string;
}

interface PinRow {
  sequence_number: number;
  scheduled_date: string;
  status: string;
  board_id: string;
}

interface DesignRow {
  design_number: number;
  filename: string | null;
  asset_path: string | null;
  url_name: string;
}

async function main() {
  const p = organicPool();

  const orgs = (await p.query<{ org_id: string; name: string }>(
    `SELECT cs.org_id::text, o.name FROM organic.client_settings cs
       JOIN organizations o ON o.id = cs.org_id
      WHERE ($1::text IS NULL OR o.name ILIKE $1) ORDER BY o.name`,
    [naam ? `%${naam}%` : null]
  )).rows;
  if (orgs.length === 0) { console.log("Geen store gevonden."); process.exit(1); }

  for (const org of orgs) {
    // Alleen cycles die nog iets kunnen publiceren. Een ABANDONED waterfall
    // heeft zijn pins op CANCELLED staan; die naar een board wijzen dat niet
    // past is geen bevinding, dat is geschiedenis.
    const cycles = (await p.query<CycleRow>(
      `SELECT w.id::text        AS waterfall_id,
              u.id::text        AS url_id,
              u.url,
              u.name            AS url_name,
              u.topic_id::text  AS url_topic_id,
              t.name            AS url_topic,
              w.status::text    AS wf_status
         FROM organic.waterfalls w
         JOIN organic.urls u   ON u.id = w.url_id
         LEFT JOIN organic.topics t ON t.id = u.topic_id
        WHERE w.org_id = $1
          AND w.status IN ('PLANNING'::organic.waterfall_status,
                           'RUNNING'::organic.waterfall_status)
        ORDER BY w.start_date`,
      [org.org_id]
    )).rows;

    if (cycles.length === 0) continue;

    console.log(`\n${"=".repeat(70)}\n${org.name}\n${"=".repeat(70)}`);

    for (const c of cycles) {
      console.log(`\n  ${c.url_name} — ${c.url}  [${c.wf_status}]`);

      const boards = (await p.query<BoardRow>(
        `SELECT b.id::text       AS board_id,
                ub.position,
                b.name           AS board_name,
                b.topic_id::text AS board_topic_id,
                t.name           AS board_topic,
                b.status::text   AS board_status
           FROM organic.url_boards ub
           JOIN organic.boards b ON b.id = ub.board_id
           LEFT JOIN organic.topics t ON t.id = b.topic_id
          WHERE ub.url_id = $1
          ORDER BY ub.position`,
        [c.url_id]
      )).rows;

      const pins = (await p.query<PinRow>(
        `SELECT sequence_number, scheduled_date::text AS scheduled_date,
                status::text AS status, board_id::text AS board_id
           FROM organic.pins
          WHERE waterfall_id = $1 AND status <> 'CANCELLED'::organic.pin_status
          ORDER BY sequence_number`,
        [c.waterfall_id]
      )).rows;

      const pinsOp = (boardId: string) => pins.filter((x) => x.board_id === boardId);

      if (boards.length === 0) {
        stop("geen boards gekoppeld aan deze URL");
        continue;
      }
      if (boards.length < 4) {
        let_op(`${boards.length} boards, de methode vraagt er vier tot vijf`);
      }

      // 1. Het topic van de URL zelf. Zonder dit kan er niets vergeleken
      //    worden en is elk board hieronder ongecontroleerd, niet goedgekeurd.
      if (c.url_topic_id == null) {
        stop(`URL heeft geen topic — geen van de ${boards.length} boards is op relevantie te controleren.`);
        console.log(`          Zet het topic op de URL (URLs-pagina) en draai dit script opnieuw.`);
        for (const b of boards) {
          console.log(`          pos ${b.position}  ${b.board_name}  [topic: ${b.board_topic ?? "geen"}]`);
        }
        continue;
      }
      ok(`topic: ${c.url_topic}`);

      // 2. Boards buiten het topic van de URL, met de pins die er heen gaan.
      for (const b of boards) {
        const raken = pinsOp(b.board_id);
        const gepubliceerd = raken.filter((x) => x.status === "PUBLISHED");
        const komend = raken.filter((x) => x.status !== "PUBLISHED");
        const waar = raken.length === 0
          ? "geen pins"
          : `${raken.length} pins` +
            (gepubliceerd.length > 0 ? `, ${gepubliceerd.length} AL GEPUBLICEERD` : "") +
            (komend.length > 0 ? `, eerstvolgend ${komend[0].scheduled_date}` : "");

        if (b.board_topic_id == null) {
          stop(`"${b.board_name}" heeft zelf geen topic — niet te controleren (${waar})`);
        } else if (b.board_topic_id !== c.url_topic_id) {
          stop(`"${b.board_name}" valt onder "${b.board_topic}", de URL onder "${c.url_topic}" (${waar})`);
        }
      }

      const fout = boards.filter(
        (b) => b.board_topic_id == null || b.board_topic_id !== c.url_topic_id
      ).length;
      if (fout === 0) ok(`alle ${boards.length} boards vallen onder "${c.url_topic}"`);
    }

    // 3. Dubbele beelden. Per design één HEAD; Supabase Storage geeft de md5
    //    van het object als ETag terug, dus twee designs met hetzelfde beeld
    //    vallen op ook al heten ze anders.
    const designs = (await p.query<DesignRow>(
      `SELECT d.design_number, d.filename, d.asset_path, u.name AS url_name
         FROM organic.designs d
         JOIN organic.waterfalls w ON w.id = d.waterfall_id
         JOIN organic.urls u ON u.id = w.url_id
        WHERE w.org_id = $1
          AND w.status IN ('PLANNING'::organic.waterfall_status,
                           'RUNNING'::organic.waterfall_status)
          AND d.asset_path IS NOT NULL
        ORDER BY u.name, d.design_number`,
      [org.org_id]
    )).rows;

    if (designs.length > 0) {
      console.log(`\n  Designbeelden (${designs.length})`);
      const perEtag = new Map<string, DesignRow[]>();
      let onleesbaar = 0;

      await Promise.all(designs.map(async (d) => {
        try {
          const res = await fetch(d.asset_path!, { method: "HEAD" });
          // Zonder ETag valt er niets te vergelijken; dat is geen bevinding,
          // alleen een gat in deze controle en dat hoort het te zeggen.
          const etag = res.headers.get("etag");
          if (!res.ok || !etag) { onleesbaar++; return; }
          const key = etag.replace(/"/g, "");
          perEtag.set(key, [...(perEtag.get(key) ?? []), d]);
        } catch { onleesbaar++; }
      }));

      const dubbel = [...perEtag.values()].filter((g) => g.length > 1);
      for (const groep of dubbel) {
        stop(
          `hetzelfde beeld onder ${groep.length} designs: ` +
          groep.map((d) => `${d.url_name} d${d.design_number} (${d.filename ?? "geen bestandsnaam"})`).join("  ·  ")
        );
      }
      if (onleesbaar > 0) let_op(`${onleesbaar} beeld(en) niet op te halen — niet vergeleken`);
      if (dubbel.length === 0 && onleesbaar === 0) ok(`${designs.length} designs, allemaal een ander beeld`);
    }
  }

  console.log(
    bevindingen === 0
      ? "\n\x1b[32mNiets gevonden.\x1b[0m"
      : `\n\x1b[31m${bevindingen} bevinding(en).\x1b[0m`
  );
  process.exit(bevindingen === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
