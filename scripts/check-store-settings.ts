import { Client } from "pg";
import "dotenv/config";

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'store_settings' ORDER BY ordinal_position`
    );
    console.log("store_settings columns:");
    for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`);
    const orgs = await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE pinterest_user_id IS NOT NULL)::int AS connected
       FROM organizations`
    );
    console.log("\norganizations:", orgs.rows[0]);
    const settings = await client.query(`SELECT count(*)::int FROM store_settings`);
    console.log("store_settings rows:", settings.rows[0].count);
  } finally {
    await client.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
