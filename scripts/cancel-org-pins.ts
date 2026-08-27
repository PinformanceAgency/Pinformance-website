/**
 * Laat de openstaande pins van een store vervallen.
 *
 * WHY
 * ---
 * A store that leaves keeps whatever was queued for it, and the posting cron
 * keeps picking it up: `pins_due_orgs()` still counts it, the run still spends
 * time on it, and every backlog number still includes pins nobody intends to
 * publish. Smartsporter was offboarded with 55 pins queued and a dead refresh
 * token, so it failed on every run and sat at the top of the "overdue" table
 * looking like work.
 *
 * Cancelling is not deleting: the rows keep their title, description, keywords
 * and image, and `rejected_reason` records why they stopped. If the store comes
 * back, its content is still there.
 *
 * WHAT IT LEAVES ALONE
 * --------------------
 * Anything already `posted` — that is history and it is on Pinterest. Only
 * `generated`, `approved` and `scheduled` are touched, i.e. exactly the pins
 * that were still waiting for something to happen.
 *
 * RUN
 *     CANCEL_PINS_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/cancel-org-pins.ts "Store Name"
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/cancel-org-pins.ts "Store Name" "reason"
 */
import "dotenv/config";
import { Client } from "pg";

const DRY = process.env.CANCEL_PINS_DRY_RUN === "1";
const OPEN = ["generated", "approved", "scheduled"];

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('Geef de storenaam mee, bv: npx tsx scripts/cancel-org-pins.ts "Smartsporter"');
  const reason = process.argv[3] || `Store offboarded ${new Date().toISOString().slice(0, 10)}`;

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: orgs } = await c.query<{ id: string; name: string }>(
    `SELECT id::text, name FROM public.organizations WHERE name = $1`, [name]);
  if (orgs.length === 0) throw new Error(`Geen store gevonden met de naam "${name}"`);
  const org = orgs[0];

  const { rows: breakdown } = await c.query<{ status: string; n: string }>(
    `SELECT status::text, count(*)::text AS n
       FROM public.pins WHERE org_id = $1 AND status = ANY($2) GROUP BY 1 ORDER BY 1`,
    [org.id, OPEN]);

  if (breakdown.length === 0) {
    console.log(`${org.name}: geen openstaande pins — niets te doen.`);
    await c.end();
    return;
  }

  const total = breakdown.reduce((a, b) => a + Number(b.n), 0);
  console.log(`${DRY ? "DROOGLOOP — " : ""}${org.name}: ${total} openstaande pin(s) laten vervallen`);
  for (const b of breakdown) console.log(`  ${String(b.n).padStart(4)}  ${b.status}`);
  console.log(`\n  reden: "${reason}"`);

  if (DRY) {
    console.log("\nDroogloop: er is niets gewijzigd.");
    await c.end();
    return;
  }

  const res = await c.query(
    `UPDATE public.pins
        SET status = 'cancelled', rejected_reason = $3, updated_at = now()
      WHERE org_id = $1 AND status = ANY($2)`,
    [org.id, OPEN, reason]);

  console.log(`\n${res.rowCount} pin(s) op cancelled gezet. Niets verwijderd; geposte pins zijn niet aangeraakt.`);
  await c.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
