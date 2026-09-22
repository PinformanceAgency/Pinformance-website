/**
 * De concurrentie-import rechtzetten: wie heeft de pin echt gepind, en één rij
 * per pin.
 *
 *     DOTENV_CONFIG_PATH=.env.local FIX_DRY_RUN=1 npx tsx scripts/fix-competitor-pin-owners.ts
 *     DOTENV_CONFIG_PATH=.env.local npx tsx scripts/fix-competitor-pin-owners.ts
 *     ... "Fit Cherries"      # één store
 *
 * Wat er aan de hand was, gemeten 22-09-2026 op Fit Cherries: 10.840 rijen over
 * 1.896 unieke pins, van 1.399 verschillende pinners, waarvan 743 rijen van een
 * van onze tien concurrenten. De exports zijn **keyword-exports** — PinClicks
 * geeft de pins die voor een zoekterm bovenaan staan, van wie dan ook — en de
 * importer koppelde elk bestand aan één concurrent. Dus stond dezelfde
 * populaire pin onder tien concurrenten, en 93% van de rijen onder iemand die
 * hem nooit had gepind.
 *
 * Dit script doet drie dingen, in deze volgorde:
 *
 *   1. **De echte pinner vastleggen** uit `raw` (`pinner username` /
 *      `pinner name`, met `creator …` als terugval). Dat is de kolom waar de
 *      bibliotheek en de design brief vanaf nu op joinen.
 *   2. **Toewijzen waar dat kan.** Is de pinner een van onze concurrenten en
 *      staat de rij onder een ándere, dan verhuist hij — dat is een correctie
 *      en geen gok.
 *   3. **Ontdubbelen naar één rij per (store, pin_url).** Welke blijft staan is
 *      niet willekeurig: eerst de rij die onder zijn echte eigenaar hangt, dan
 *      de rij met de meeste saves (die heeft de rijkste export), dan de oudste.
 *
 * Wat het NIET doet: rijen weggooien omdat de pinner geen concurrent is. Die
 * 1.896 pins zijn echte niche-research — welke pins het hier doen en op welke
 * boards — en dat is precies wat `loadAccountBrief()` eruit haalt. Alleen het
 * label was fout, niet de data.
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";

const DRY = process.env.FIX_DRY_RUN === "1";
const ONLY = process.argv[2] ?? null;

interface Row {
  id: string;
  org_id: string;
  org_name: string;
  competitor_id: string;
  pin_url: string;
  saves: number | null;
  imported_at: string | null;
  pinner_username: string | null;
  pinner_name: string | null;
}

/** Een handle uit de database ("@wearpepper") en een pinner uit een export
 *  ("wearpepper") vergelijken zonder over de @ te vallen. */
const norm = (v: string | null | undefined): string =>
  (v ?? "").trim().toLowerCase().replace(/^@/, "");

async function main() {
  const pool = organicPool();

  console.log(DRY ? "DRY RUN — er wordt niets geschreven\n" : "Schrijvend\n");

  // 1. De echte pinner uit raw naar zijn eigen kolom.
  const filled = await pool.query<{ n: string }>(
    `${DRY ? "SELECT COUNT(*)::text AS n FROM organic.competitor_pins WHERE" : `
     UPDATE organic.competitor_pins SET
       pinner_username = NULLIF(btrim(COALESCE(raw->>'pinner username', raw->>'creator username')), ''),
       pinner_name     = NULLIF(btrim(COALESCE(raw->>'pinner name',     raw->>'creator name')), '')
     WHERE`}
       raw IS NOT NULL
       AND pinner_username IS NULL
       AND COALESCE(raw->>'pinner username', raw->>'creator username') IS NOT NULL
       ${DRY ? "" : "RETURNING 1"}`
  );
  console.log(`1. echte pinner vastgelegd op ${DRY ? filled.rows[0]?.n ?? 0 : filled.rowCount} rij(en)`);

  // 2 en 3 per store, want de vergelijking is per store.
  const orgs = await pool.query<{ org_id: string; org_name: string }>(
    `SELECT DISTINCT cp.org_id::text AS org_id, o.name AS org_name
       FROM organic.competitor_pins cp JOIN organizations o ON o.id = cp.org_id
      WHERE ($1::text IS NULL OR o.name = $1)
      ORDER BY o.name`,
    [ONLY]
  );

  let movedTotal = 0;
  let deletedTotal = 0;

  for (const org of orgs.rows) {
    const comps = await pool.query<{ id: string; handle: string | null; name: string | null }>(
      `SELECT id::text, handle, name FROM organic.competitors WHERE org_id = $1`, [org.org_id]
    );
    const byHandle = new Map<string, string>();
    for (const c of comps.rows) {
      if (c.handle) byHandle.set(norm(c.handle), c.id);
      if (c.name) byHandle.set(norm(c.name), c.id);
    }

    const rows = await pool.query<Row>(
      `SELECT cp.id::text, cp.org_id::text AS org_id, $2 AS org_name,
              cp.competitor_id::text AS competitor_id, cp.pin_url, cp.saves,
              cp.imported_at::text AS imported_at,
              COALESCE(cp.pinner_username, cp.raw->>'pinner username', cp.raw->>'creator username') AS pinner_username,
              COALESCE(cp.pinner_name, cp.raw->>'pinner name') AS pinner_name
         FROM organic.competitor_pins cp
        WHERE cp.org_id = $1
        ORDER BY cp.pin_url, COALESCE(cp.saves, -1) DESC, cp.imported_at`,
      [org.org_id, org.org_name]
    );

    // Groeperen op pin_url: dat is de eenheid "één pin".
    const groups = new Map<string, Row[]>();
    for (const r of rows.rows) {
      groups.set(r.pin_url, [...(groups.get(r.pin_url) ?? []), r]);
    }

    let moved = 0;
    let deleted = 0;
    let ownedByCompetitor = 0;

    for (const [, group] of groups) {
      const trueOwner = byHandle.get(norm(group[0].pinner_username)) ?? null;
      if (trueOwner) ownedByCompetitor += 1;

      // Welke rij blijft staan: die onder de echte eigenaar, anders de eerste
      // (al gesorteerd op saves dan datum).
      const keep = (trueOwner ? group.find((r) => r.competitor_id === trueOwner) : undefined)
        ?? group[0];

      // Hangt de blijver onder de verkeerde concurrent terwijl we de echte
      // kennen? Verhuizen. Dat kan nu, want de andere rijen van deze pin gaan
      // hieronder weg en de unieke index botst dus niet.
      if (trueOwner && keep.competitor_id !== trueOwner) {
        if (!DRY) {
          await pool.query(
            `UPDATE organic.competitor_pins SET competitor_id = $2 WHERE id = $1`,
            [keep.id, trueOwner]
          );
        }
        moved += 1;
      }

      const drop = group.filter((r) => r.id !== keep.id);
      if (drop.length > 0) {
        if (!DRY) {
          await pool.query(
            `DELETE FROM organic.competitor_pins WHERE id = ANY($1::uuid[])`,
            [drop.map((r) => r.id)]
          );
        }
        deleted += drop.length;
      }
    }

    console.log(
      `   ${org.org_name.padEnd(24)} ${String(rows.rowCount).padStart(6)} rijen → ` +
      `${String(groups.size).padStart(5)} pins · ${String(deleted).padStart(5)} dubbel weg · ` +
      `${moved} toegewezen · ${ownedByCompetitor} van een eigen concurrent`
    );
    movedTotal += moved;
    deletedTotal += deleted;
  }

  console.log(`\n2. ${movedTotal} pin(s) naar hun echte eigenaar verhuisd`);
  console.log(`3. ${deletedTotal} dubbele rij(en) ${DRY ? "zouden verdwijnen" : "verwijderd"}`);

  if (!DRY) {
    // De unieke index verhuist pas als de dubbelen weg zijn, anders faalt hij.
    // Dezelfde pin twee keer in één store is één pin, welk bestand hem ook
    // aandroeg — met de oude index op (competitor_id, pin_url) kon hij tien
    // keer landen.
    // Migratie 089 noemde hem `competitor_pins_unique_idx`; een DROP op een
    // verzonnen naam is stil geslaagd en liet de oude index staan. Beide namen
    // dus, en de constraint-variant erbij voor het geval hij ooit zo is gemaakt.
    for (const name of ["competitor_pins_unique_idx", "competitor_pins_competitor_id_pin_url_key"]) {
      await pool.query(`DROP INDEX IF EXISTS organic.${name}`);
      await pool.query(`ALTER TABLE organic.competitor_pins DROP CONSTRAINT IF EXISTS ${name}`);
    }
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS competitor_pins_org_pin_uniq
         ON organic.competitor_pins (org_id, pin_url)`
    );
    console.log("4. unieke index staat nu op (org_id, pin_url) — één rij per pin per store");
  } else {
    console.log("4. de unieke index zou naar (org_id, pin_url) verhuizen");
  }

  const after = await pool.query<{ store: string; rijen: string; pins: string; eigen: string }>(
    `SELECT o.name AS store, COUNT(*)::text AS rijen,
            COUNT(DISTINCT cp.pin_url)::text AS pins,
            COUNT(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM organic.competitors co
               WHERE co.org_id = cp.org_id
                 AND lower(replace(COALESCE(co.handle, ''), '@', '')) = lower(COALESCE(cp.pinner_username, ''))
            ))::text AS eigen
       FROM organic.competitor_pins cp JOIN organizations o ON o.id = cp.org_id
      WHERE ($1::text IS NULL OR o.name = $1)
      GROUP BY o.name ORDER BY o.name`,
    [ONLY]
  );
  console.log("\nnu in de bank:");
  for (const r of after.rows) {
    console.log(
      `   ${r.store.padEnd(24)} ${String(r.rijen).padStart(6)} rijen · ` +
      `${String(r.pins).padStart(5)} unieke pins · ${r.eigen} van een eigen concurrent`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FOUT:", e instanceof Error ? e.message : e);
  process.exit(1);
});
