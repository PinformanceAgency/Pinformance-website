/**
 * Verwijdert een org die per ongeluk of ten onrechte is aangemaakt.
 *
 * NIET het normale offboarden. Een store met historie zet je op
 * store_settings.is_active = false (zie CLAUDE.md "Offboard store"); dat is
 * omkeerbaar en behoudt de data. Dit script is voor het terugdraaien van een
 * verse aanmaak: het weigert te verwijderen zodra er ergens data aan de org
 * hangt, behalve een lege brand_profiles-regel.
 *
 * Draaien:
 *   REMOVE_ORG_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/remove-org.ts <slug>
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/remove-org.ts <slug>
 */
import 'dotenv/config';
import { Client as PgClient } from 'pg';

const DRY_RUN = process.env.REMOVE_ORG_DRY_RUN === '1';

async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error('Geef de slug van de org mee, bv: npx tsx scripts/remove-org.ts schalen-niffo');

  const pg = new PgClient({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  try {
    const org = await pg.query(
      'SELECT id::text AS id, name, slug, created_at FROM organizations WHERE slug = $1',
      [slug],
    );
    if (org.rowCount === 0) {
      console.log(`Geen org met slug "${slug}" -- niets te doen.`);
      return;
    }
    const { id, name } = org.rows[0];
    console.log(`Org: "${name}" (slug=${slug}, id=${id}, aangemaakt ${org.rows[0].created_at.toISOString()})`);

    // Alles wat aan de org hangt tellen. brand_profiles hoort bij een lege
    // aanmaak en telt niet mee; al het andere betekent dat er echte data is.
    const tables = await pg.query(`
      SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = 'public'
         AND c.column_name = 'org_id'
         AND t.table_type = 'BASE TABLE'
       ORDER BY 1`);

    const blocking: string[] = [];
    let brandProfiles = 0;
    for (const { table_name } of tables.rows) {
      const n = await pg.query(
        `SELECT count(*)::int AS n FROM public."${table_name}" WHERE org_id = $1`,
        [id],
      );
      if (n.rows[0].n === 0) continue;
      if (table_name === 'brand_profiles') brandProfiles = n.rows[0].n;
      else blocking.push(`${table_name}: ${n.rows[0].n}`);
    }

    if (blocking.length > 0) {
      console.error('\nGEWEIGERD -- er hangt data aan deze org:');
      for (const b of blocking) console.error(`  ${b}`);
      console.error('\nGebruik offboarden (store_settings.is_active = false) in plaats van verwijderen.');
      process.exitCode = 1;
      return;
    }

    console.log(`Aan de org hangt alleen: brand_profiles (${brandProfiles} regel).`);
    if (DRY_RUN) {
      console.log('DROOGLOOP -- er wordt niets verwijderd.');
      return;
    }

    await pg.query('BEGIN');
    const bp = await pg.query('DELETE FROM brand_profiles WHERE org_id = $1', [id]);
    const del = await pg.query('DELETE FROM organizations WHERE id = $1', [id]);
    await pg.query('COMMIT');
    console.log(`Verwijderd: ${del.rowCount} org, ${bp.rowCount} brand_profiles.`);
  } finally {
    await pg.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
