import { Client } from "pg";
import "dotenv/config";

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    const es = await c.query(
      "SELECT entity_type, count(*)::int FROM pinterest_entity_snapshots GROUP BY entity_type"
    );
    console.log("pinterest_entity_snapshots:", es.rows);
    const ms = await c.query(
      "SELECT entity_type, count(*)::int FROM pinterest_metrics_snapshots GROUP BY entity_type"
    );
    console.log("pinterest_metrics_snapshots:", ms.rows);
    const pc = await c.query(
      "SELECT count(*)::int as with_parsed FROM pinterest_entity_snapshots WHERE entity_type='campaign' AND parsed_country IS NOT NULL"
    );
    console.log("campaigns with parsed_country:", pc.rows[0]);
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
