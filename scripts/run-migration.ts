/**
 * Apply one migration file against DATABASE_URL. Usage:
 *   npx tsx scripts/run-migration.ts supabase/migrations/024_store_settings.sql
 *
 * Wraps everything in a single transaction so a mid-file failure rolls back
 * cleanly. Safe to re-run on migrations that use `CREATE ... IF NOT EXISTS`
 * / `CREATE OR REPLACE ...` (as ours do).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import "dotenv/config";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: tsx scripts/run-migration.ts <migration-file>");
    process.exit(1);
  }
  const absPath = resolve(process.cwd(), filePath);
  const sql = readFileSync(absPath, "utf8");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  console.log(`→ Connecting to ${new URL(connectionString).host} …`);
  await client.connect();
  try {
    console.log(`→ Running ${filePath} (${sql.length} chars)`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✓ Migration applied.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("✗ Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
