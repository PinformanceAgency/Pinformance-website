/**
 * Direct Postgres pool for the organic app.
 *
 * We deliberately bypass PostgREST here because the `organic` schema is not
 * exposed via Supabase Settings → API → Exposed schemas (and even if it
 * were, PostgREST enforces a short statement_timeout that some of our
 * aggregate views would blow through). Direct pg gives us:
 *
 *   - Access to every schema without dashboard config
 *   - Our own statement_timeout per request
 *   - Predictable behavior regardless of PostgREST changes
 *
 * Same pattern as src/lib/media-buying/team-activity.ts.
 */
import { Pool, types } from "pg";

// Force DATE (OID 1082) to come back as raw YYYY-MM-DD strings — otherwise
// node-pg turns them into JS Dates at LOCAL midnight and they shift by a
// day when the process TZ isn't UTC.
types.setTypeParser(1082, (val) => val);

let pool: Pool | null = null;

export function organicPool(): Pool {
  if (pool) return pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");
  pool = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 4,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });
  return pool;
}
