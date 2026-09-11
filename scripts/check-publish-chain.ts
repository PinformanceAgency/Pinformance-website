/**
 * Kan deze store daadwerkelijk publiceren, en zo nee: wat ontbreekt er?
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * De keten van onderzoek naar een pin op een board is lang -- topic, boards
 * op Pinterest, URL, keywords, designs, beelden, crops, copy, QC, waterfall,
 * inplannen, cron -- en elke schakel faalt op zijn eigen manier. Het vervelende
 * is dat de meeste stil falen: een pin met een board dat nog niet bestaat
 * wordt door de publicatiequery gewoon niet opgehaald. Geen fout, geen
 * melding, hij gaat alleen nooit uit.
 *
 * Dit script loopt exact dezelfde voorwaarden na als publishDuePins() en
 * scheduleWaterfall(), per cycle, en zegt per schakel wat er nog moet
 * gebeuren. Exit 1 zodra er iets in de weg staat.
 *
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-publish-chain.ts "Fit Cherries"
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/check-publish-chain.ts        # alle organic-stores
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { pinterestClientForOrg } from "../src/lib/pinterest/for-org";

const naam = process.argv[2] ?? null;
let blokkades = 0;

const ok = (t: string) => console.log(`   \x1b[32mok\x1b[0m   ${t}`);
const stop = (t: string) => { blokkades++; console.log(`   \x1b[31mSTOP\x1b[0m ${t}`); };
const let_op = (t: string) => console.log(`   \x1b[33mlet op\x1b[0m ${t}`);

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
    console.log(`\n${"═".repeat(70)}\n${org.name}\n${"═".repeat(70)}`);

    console.log("\n1. Pinterest-verbinding");
    try { await pinterestClientForOrg(org.org_id); ok("token werkt"); }
    catch (e) { stop(`token: ${(e as Error).message}`); }

    console.log("\n2. Boards op Pinterest");
    const b = (await p.query<{ live: string; gepland: string; vandaag: string; eerste: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE status <> 'PLANNED'::organic.board_status)::text AS live,
              COUNT(*) FILTER (WHERE status = 'PLANNED'::organic.board_status
                                 AND pinterest_board_id IS NULL
                                 AND origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin)::text AS gepland,
              COUNT(*) FILTER (WHERE status = 'PLANNED'::organic.board_status
                                 AND pinterest_board_id IS NULL
                                 AND origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin
                                 AND planned_creation_date <= current_date)::text AS vandaag,
              MIN(planned_creation_date) FILTER (WHERE status = 'PLANNED'::organic.board_status
                                 AND pinterest_board_id IS NULL
                                 AND origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin)::text AS eerste
         FROM organic.boards WHERE org_id = $1`, [org.org_id])).rows[0];
    if (Number(b.gepland) === 0) ok(`${b.live} boards staan op Pinterest, niets meer in de wachtrij`);
    else let_op(`${b.live} live · ${b.gepland} nog aan te maken door de cron (eerste ${b.eerste}, ${b.vandaag} vandaag aan de beurt)`);

    console.log("\n3. Per cycle");
    const cycles = (await p.query<{ cycle: string; url_id: string; url_name: string }>(
      `SELECT DISTINCT ct.cycle, u.id::text AS url_id, u.name AS url_name
         FROM organic.client_tasks ct
         JOIN organic.urls u ON left(u.id::text,8) = replace(ct.cycle,'URL-','') AND u.org_id = ct.org_id
        WHERE ct.org_id = $1 AND ct.cycle LIKE 'URL-%' ORDER BY 3`, [org.org_id])).rows;
    if (cycles.length === 0) { let_op("geen cycle gestart"); continue; }

    for (const c of cycles) {
      console.log(`\n   ── ${c.url_name}`);
      const w = (await p.query<{ id: string; status: string }>(
        `SELECT id::text, status::text FROM organic.waterfalls
          WHERE url_id = $1 AND status <> 'ABANDONED'::organic.waterfall_status
          ORDER BY created_at DESC LIMIT 1`, [c.url_id])).rows[0];
      if (!w) { stop("geen waterfall — genereer die eerst (P4.3.1)"); continue; }

      // Precies de voorwaarden uit scheduleWaterfall(), per pin.
      const pins = (await p.query<{
        n: string; geen_beeld: string; geen_board: string; geen_titel: string;
        qc_copy_af: string; qc_design_af: string; gepland: string; ingepland: string; gepubliceerd: string;
        design_zonder_beeld: string;
      }>(
        `SELECT COUNT(*)::text AS n,
                COUNT(*) FILTER (WHERE p.image_path IS NULL)::text AS geen_beeld,
                COUNT(*) FILTER (WHERE b.pinterest_board_id IS NULL)::text AS geen_board,
                COUNT(*) FILTER (WHERE cs.title IS NULL OR btrim(cs.title) = '')::text AS geen_titel,
                COUNT(*) FILTER (WHERE cs.human_qc_status = 'APPROVED'::organic.qc_status)::text AS qc_copy_af,
                COUNT(*) FILTER (WHERE d.qc_status = 'APPROVED'::organic.qc_status)::text AS qc_design_af,
                COUNT(*) FILTER (WHERE p.status = 'PLANNED'::organic.pin_status)::text AS gepland,
                COUNT(*) FILTER (WHERE p.status = 'SCHEDULED'::organic.pin_status)::text AS ingepland,
                COUNT(*) FILTER (WHERE p.status = 'PUBLISHED'::organic.pin_status)::text AS gepubliceerd,
                (SELECT COUNT(*) FROM organic.designs WHERE waterfall_id = $1 AND asset_path IS NULL)::text AS design_zonder_beeld
           FROM organic.pins p
           JOIN organic.boards b ON b.id = p.board_id
           LEFT JOIN organic.copy_sets cs ON cs.id = p.copy_set_id
           LEFT JOIN organic.designs d ON d.id = p.design_id
          WHERE p.waterfall_id = $1 AND p.status <> 'CANCELLED'::organic.pin_status`, [w.id])).rows[0];

      console.log(`      waterfall ${w.id.slice(0,8)} ${w.status} · ${pins.n} pins ` +
        `(${pins.gepland} nog niet ingepland, ${pins.ingepland} ingepland, ${pins.gepubliceerd} gepubliceerd)`);

      // Na een regenerate komen de designs mee maar de crops niet: dan is
      // alleen P4.2.5 nog nodig, en "upload de designs" stuurt iemand naar
      // werk dat al gedaan is.
      if (Number(pins.geen_beeld) > 0) stop(Number(pins.design_zonder_beeld) > 0
        ? `${pins.geen_beeld} pins zonder beeld — upload of genereer de designs (P4.2.4) en snijd de crops (P4.2.5)`
        : `${pins.geen_beeld} pins zonder beeld — de designs hebben er wel een, alleen de crops ontbreken (P4.2.5)`);
      else ok("elke pin heeft een beeld");

      if (Number(pins.geen_titel) > 0) stop(`${pins.geen_titel} pins zonder titel — schrijf de copy (P4.2.8, sectie 2)`);
      else ok("elke pin heeft copy met een titel");

      if (Number(pins.geen_board) > 0) stop(`${pins.geen_board} pins staan op een board dat nog niet op Pinterest bestaat`);
      else ok("elk board bestaat op Pinterest");

      if (Number(pins.qc_design_af) < Number(pins.n)) let_op(`design-QC nog niet af (${pins.qc_design_af}/${pins.n}) — houdt niets tegen, maar wordt wel gemeld bij het inplannen`);
      if (Number(pins.qc_copy_af) < Number(pins.n)) let_op(`copy-QC nog niet af (${pins.qc_copy_af}/${pins.n})`);
      if (Number(pins.gepland) > 0 && Number(pins.geen_beeld) === 0 && Number(pins.geen_titel) === 0 && Number(pins.geen_board) === 0)
        let_op(`${pins.gepland} pins kunnen nu ingepland worden — druk op ${w.status === "PLANNING"
          ? `"Save & queue"` : `"Queue whatever is still waiting"`} in sectie 3`);
    }
  }

  console.log(`\n${"─".repeat(70)}`);
  console.log(blokkades === 0
    ? "Niets staat publiceren in de weg."
    : `${blokkades} blokkade(s). Hierboven staat per stuk wat er moet gebeuren.`);
  process.exit(blokkades === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
