/**
 * One-off: fill parsed_* columns on existing pinterest_entity_snapshots rows.
 * Reads every unparsed campaign snapshot and writes back via bulk UPDATE ...
 * FROM (unnest(...)) — one round-trip per chunk instead of one per row.
 *
 * Usage:  npx tsx --env-file=.env.local scripts/backfill-parsed-snapshots.ts
 */
import { Client } from "pg";
import "dotenv/config";
import { parseCampaignName } from "../src/lib/pinterest/naming-conventions";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: number; name: string }>(
      `SELECT id, name
       FROM pinterest_entity_snapshots
       WHERE entity_type = 'campaign'
         AND name IS NOT NULL
         AND parsed_country IS NULL
         AND parsed_funnel IS NULL
         AND parsed_performance_plus IS NULL
         AND parsed_strategy IS NULL
         AND parsed_catalog IS NULL
         AND parsed_objective IS NULL`
    );
    console.log(`→ ${rows.length} rows to backfill`);
    if (rows.length === 0) return;

    // Parse everything in-memory first, then bulk-update in chunks.
    const parsed = rows.map((r) => {
      const p = parseCampaignName(r.name);
      return {
        id: r.id,
        country: p.country,
        funnel: p.funnel,
        performancePlus: p.performancePlus,
        strategy: p.strategy,
        strategyCategory: p.strategyCategory,
        catalog: p.catalog,
        objective: p.objective,
      };
    });

    const CHUNK = 2000;
    let done = 0;
    for (let i = 0; i < parsed.length; i += CHUNK) {
      const slice = parsed.slice(i, i + CHUNK);
      // One UPDATE, using unnest to zip 8 parallel arrays into rows.
      await client.query(
        `UPDATE pinterest_entity_snapshots pes SET
           parsed_country            = u.country,
           parsed_funnel             = u.funnel,
           parsed_performance_plus   = u.pp,
           parsed_strategy           = u.strategy,
           parsed_strategy_category  = u.sc,
           parsed_catalog            = u.catalog,
           parsed_objective          = u.objective
         FROM unnest(
           $1::bigint[], $2::text[], $3::text[], $4::text[],
           $5::text[], $6::text[], $7::text[], $8::text[]
         ) AS u(id, country, funnel, pp, strategy, sc, catalog, objective)
         WHERE pes.id = u.id`,
        [
          slice.map((s) => s.id),
          slice.map((s) => s.country),
          slice.map((s) => s.funnel),
          slice.map((s) => s.performancePlus),
          slice.map((s) => s.strategy),
          slice.map((s) => s.strategyCategory),
          slice.map((s) => s.catalog),
          slice.map((s) => s.objective),
        ]
      );
      done += slice.length;
      console.log(`  ${done}/${parsed.length}`);
    }
    console.log("✓ Done.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
