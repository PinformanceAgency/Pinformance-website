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

/**
 * Held on globalThis, not in a module-level binding.
 *
 * A plain `let pool` leaks in development: every HMR reload re-evaluates
 * this module, builds a fresh Pool and drops the old one on the floor
 * without ending it. The abandoned pools keep their sockets open, and
 * after enough edits Supabase's session-mode pooler refuses new
 * connections with "max clients reached ... pool_size: 15" — which
 * surfaces as an unrelated-looking 500 on whichever page happened to
 * query next. Serverless cold starts can re-instantiate modules the same
 * way, so this is not a dev-only concern.
 */
const POOL_KEY = Symbol.for("pinformance.organic.pool");
type PoolHolder = { [POOL_KEY]?: Pool };

export function organicPool(): Pool {
  const holder = globalThis as unknown as PoolHolder;
  const existing = holder[POOL_KEY];
  if (existing) return existing;

  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");

  const created = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: 4,
    // Hand a connection back promptly. Screens that fan out across five
    // aggregates queue on the pool rather than opening five sockets, and
    // an idle one should not sit against the pooler's cap.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
  });
  // A pool-level error must never take the process down: the pooler drops
  // idle connections routinely, and pg surfaces that as an 'error' event.
  created.on("error", (err) => {
    console.error("[organic] idle pool client error:", err.message);
  });

  holder[POOL_KEY] = created;
  return created;
}
