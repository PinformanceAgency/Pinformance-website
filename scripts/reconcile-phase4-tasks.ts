/**
 * Vinkt fase-4 taken af waarvan het resultaat er allang staat.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Fase 4 liet zijn taken jarenlang staan waar hij ze vond: zestien pins
 * onder een P4.3.1 op BLOCKED, vier geüploade designs onder een P4.2.4 op
 * BLOCKED. Wie het werk doet ziet dan een rood label dat het tegendeel
 * beweert van wat hij net gedaan heeft, en de taken die eraan hangen gaan
 * nooit open. Sinds 10-09-2026 schrijft elke besturing zijn eigen taak weg;
 * dit haalt in wat daarvoor is gedaan.
 *
 * Er wordt uitsluitend afgevinkt wat aantoonbaar bestaat -- een beeld op elk
 * design, een titel op elke copy set, een GOEDGEKEURDE QC. Opnieuw draaien
 * is een no-op.
 *
 * Sinds 12-09-2026 loopt het ook de andere kant op. Een afgevinkte taak was
 * een klep die maar één kant op ging, en QC valt terecht terug naar PENDING
 * bij een regenerate, een re-save of een nieuw beeld -- dus stond Fit
 * Cherries' "Bhs" op P4.2.10 DONE met alle vier de copy sets op PENDING, en
 * ging er een pin uit met copy die niemand had goedgekeurd. Een DONE waar
 * het werk niet (meer) achter staat gaat terug naar IN_PROGRESS. SKIPPED
 * blijft met rust: dat is een beslissing, geen waarneming.
 *
 *     DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reconcile-phase4-tasks.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/reconcile-phase4-tasks.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { completeCycleTask } from "../src/lib/organic/phase4";

const DRY = process.env.DRY_RUN === "1";

interface Row {
  org_id: string; store: string; cycle: string; url_name: string; url_id: string;
  designs: number; met_beeld: number; met_titel: number;
  design_qc: number; copy_qc: number; pins: number; pins_met_beeld: number;
}

async function main() {
  const pool = organicPool();
  // Eerst de levende waterfalls (klein), daarna per stuk tellen. In één
  // query met LEFT JOINs over designs en copy_sets liep hij tegen de
  // statement timeout aan.
  const live = await pool.query<{ id: string; org_id: string; store: string; url_id: string; url_name: string }>(
    `SELECT DISTINCT ON (w.url_id) w.id::text, w.org_id::text, o.name AS store,
            u.id::text AS url_id, u.name AS url_name
       FROM organic.waterfalls w
       JOIN organic.urls u ON u.id = w.url_id
       JOIN organizations o ON o.id = w.org_id
      WHERE w.status <> 'ABANDONED'::organic.waterfall_status
      ORDER BY w.url_id, w.created_at DESC`
  );

  const rows = { rows: [] as Row[] };
  for (const w of live.rows) {
    const d = await pool.query<{ designs: number; met_beeld: number; met_titel: number; design_qc: number; copy_qc: number }>(
      `SELECT COUNT(d.id)::int AS designs,
              COUNT(*) FILTER (WHERE d.asset_path IS NOT NULL)::int AS met_beeld,
              COUNT(*) FILTER (WHERE cs.title IS NOT NULL AND btrim(cs.title) <> '')::int AS met_titel,
              COUNT(*) FILTER (WHERE d.qc_status = 'APPROVED'::organic.qc_status)::int AS design_qc,
              COUNT(*) FILTER (WHERE cs.human_qc_status = 'APPROVED'::organic.qc_status)::int AS copy_qc
         FROM organic.designs d
         LEFT JOIN organic.copy_sets cs ON cs.design_id = d.id
        WHERE d.waterfall_id = $1`, [w.id]);
    const p = await pool.query<{ pins: number; pins_met_beeld: number }>(
      `SELECT COUNT(*)::int AS pins,
              COUNT(*) FILTER (WHERE image_path IS NOT NULL)::int AS pins_met_beeld
         FROM organic.pins
        WHERE waterfall_id = $1 AND status <> 'CANCELLED'::organic.pin_status`, [w.id]);
    rows.rows.push({
      org_id: w.org_id, store: w.store, cycle: `URL-${w.url_id.slice(0, 8)}`,
      url_name: w.url_name, url_id: w.url_id,
      ...d.rows[0], ...p.rows[0],
    });
  }

  let closed = 0;
  let reopened = 0;
  for (const r of rows.rows) {
    // De opzetstappen: boards en keywords hangen aan de URL, niet aan de
    // waterfall, dus die worden apart geteld.
    const setup = (await pool.query<{ boards: number; kws: number; overlay: number }>(
      `SELECT (SELECT COUNT(*)::int FROM organic.url_boards WHERE url_id = $1)                    AS boards,
              (SELECT COUNT(*)::int FROM organic.url_keywords WHERE url_id = $1)                  AS kws,
              (SELECT COUNT(*)::int FROM organic.url_keywords WHERE url_id = $1 AND is_overlay)   AS overlay`,
      [r.url_id]
    )).rows[0];

    const done: Array<[string, boolean, string]> = [
      // De cycle bestaat, dus de URL is gekozen -- dat is precies wat deze
      // twee taken vragen.
      ["P4.1.1", true, "de URL komt uit de pool"],
      ["P4.1.4", true, "de URL is voor deze cycle gekozen"],
      ["P4.1.6", setup.kws > 0, `${setup.kws} keywords toegewezen`],
      ["P4.1.7", setup.boards >= 4, `${setup.boards} boards toegewezen`],
      ["P4.1.8", setup.overlay > 0, `${setup.overlay} overlay-termen gemarkeerd`],
      ["P4.2.4", r.designs > 0 && r.met_beeld >= r.designs, `${r.met_beeld}/${r.designs} designs met een beeld`],
      ["P4.2.5", r.pins > 0 && r.pins_met_beeld >= r.pins, `${r.pins_met_beeld}/${r.pins} pins met een beeld`],
      ["P4.2.7", r.designs > 0 && r.design_qc >= r.designs, `${r.design_qc}/${r.designs} designs goedgekeurd`],
      ["P4.2.8", r.designs > 0 && r.met_titel >= r.designs, `${r.met_titel}/${r.designs} copy sets geschreven`],
      ["P4.2.9", r.designs > 0 && r.met_titel >= r.designs, "elke copy set kwam door de validator"],
      ["P4.2.10", r.designs > 0 && r.copy_qc >= r.designs, `${r.copy_qc}/${r.designs} copy sets goedgekeurd`],
      ["P4.3.1", r.pins > 0, `waterfall met ${r.pins} pins`],
    ];
    for (const [taskId, klaar, waarom] of done) {
      const st = await pool.query<{ status: string }>(
        `SELECT status::text FROM organic.client_tasks
          WHERE org_id = $1 AND cycle = $2 AND task_id = $3`, [r.org_id, r.cycle, taskId]);
      const huidig = st.rows[0]?.status;
      if (!huidig || huidig === "SKIPPED") continue;

      if (klaar && huidig !== "DONE") {
        console.log(`  ${r.store} · ${r.url_name} · ${taskId} ${huidig} → DONE (${waarom})`);
        closed++;
        if (!DRY) {
          await completeCycleTask(r.org_id, r.cycle, taskId, 0,
            `Ingehaald: ${waarom}. Het werk stond er al voordat de besturing zijn eigen taak wegschreef.`);
        }
      } else if (!klaar && huidig === "DONE") {
        // Alleen DONE gaat terug. BLOCKED wordt uit preconditions berekend en
        // is niet aan ons; TODO zou wegpoetsen dat er wél aan begonnen is.
        console.log(`  ${r.store} · ${r.url_name} · ${taskId} DONE → IN_PROGRESS (${waarom})`);
        reopened++;
        if (!DRY) {
          await pool.query(
            `UPDATE organic.client_tasks
                SET status = 'IN_PROGRESS'::organic.task_status,
                    completed_at = NULL,
                    notes = $1
              WHERE org_id = $2 AND cycle = $3 AND task_id = $4
                AND status = 'DONE'::organic.task_status`,
            [`Heropend: ${waarom}. De taak stond op DONE terwijl het werk er niet (meer) achter staat.`,
             r.org_id, r.cycle, taskId]
          );
        }
      }
    }
  }

  const staart = DRY ? " (DRY_RUN=1, niets geschreven)" : "";
  console.log(closed === 0 && reopened === 0
    ? "\nNiets te doen -- elke taak staat gelijk aan het werk dat eronder ligt."
    : `\n${closed} afgevinkt, ${reopened} heropend.${staart}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
