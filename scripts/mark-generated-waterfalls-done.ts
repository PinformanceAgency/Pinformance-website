/**
 * Vinkt P4.3.1 af voor cycles waarvan de waterfall er allang staat.
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * "Generate 16-pin waterfall" deed het werk -- zestien pins, vier designs,
 * de rotatie -- en vinkte de taak niet af. P4.3.2 wacht op P4.3.1, dus de
 * hele cycle bleef daarna staan op een taak die in werkelijkheid gedaan was.
 * Vanaf 10-09-2026 zet generateWaterfall dat zelf; dit script haalt in wat
 * daarvoor is gegenereerd.
 *
 * Alleen cycles met een waterfall die NIET afgebroken is tellen mee, en een
 * taak die al DONE of SKIPPED staat wordt niet aangeraakt. Opnieuw draaien
 * is een no-op.
 *
 *     DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/mark-generated-waterfalls-done.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/mark-generated-waterfalls-done.ts
 */
import "dotenv/config";
import { completeCycleTask } from "../src/lib/organic/phase4";
import { organicPool } from "../src/lib/organic/db";

const DRY = process.env.DRY_RUN === "1";

async function main() {
  const pool = organicPool();
  const rows = await pool.query<{
    org_id: string; store: string; cycle: string; url_name: string;
    wf: string; pins: number; status: string;
  }>(
    `SELECT ct.org_id::text, o.name AS store, ct.cycle, u.name AS url_name,
            w.id::text AS wf, ct.status::text,
            (SELECT COUNT(*) FROM organic.pins p
              WHERE p.waterfall_id = w.id AND p.status <> 'CANCELLED')::int AS pins
       FROM organic.client_tasks ct
       JOIN organizations o ON o.id = ct.org_id
       JOIN organic.urls u ON left(u.id::text, 8) = replace(ct.cycle, 'URL-', '')
                          AND u.org_id = ct.org_id
       JOIN organic.waterfalls w ON w.url_id = u.id
                                AND w.status <> 'ABANDONED'::organic.waterfall_status
      WHERE ct.task_id = 'P4.3.1'
        AND ct.cycle LIKE 'URL-%'
        AND ct.status NOT IN ('DONE'::organic.task_status, 'SKIPPED'::organic.task_status)
      ORDER BY o.name, u.name`
  );

  if (rows.rowCount === 0) {
    console.log("Niets te doen -- elke gegenereerde waterfall heeft zijn taak afgevinkt.");
    return;
  }
  console.log(`${rows.rowCount} cycle(s):`);
  for (const r of rows.rows) {
    console.log(`  ${r.store} · ${r.url_name} (${r.cycle}) · waterfall ${r.wf.slice(0, 8)} · ${r.pins} pins · nu ${r.status}`);
  }
  if (DRY) {
    console.log("\nDRY_RUN=1 -- niets geschreven.");
    return;
  }
  for (const r of rows.rows) {
    await completeCycleTask(
      r.org_id, r.cycle, "P4.3.1", 0,
      `Waterfall ${r.wf.slice(0, 8)} bestond al met ${r.pins} pins; de taak werd destijds niet afgevinkt.`
    );
    console.log(`  afgevinkt: ${r.store} · ${r.url_name}`);
  }
  console.log("\nKlaar. P4.3.2 komt vrij zodra de status opnieuw is berekend (dat doet completeCycleTask zelf).");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
