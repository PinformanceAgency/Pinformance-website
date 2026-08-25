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

  // Supabase's session-mode pooler caps the whole project at 15 clients,
  // and that budget is shared with the media-buying dashboard, the crons
  // and every other dev machine. Holding four per process is fine for one
  // process and ruinous across several: a dev server killed mid-request
  // leaves its sockets on the pooler until they are reaped, so a few
  // restarts in a row exhaust the cap and every page 500s at once.
  //
  // Two per process in development keeps a restart cheap; production
  // keeps four because a serverless instance handles real concurrency.
  const isDev = process.env.NODE_ENV !== "production";

  const created = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: isDev ? 2 : 4,
    // Hand a connection back promptly. Screens that fan out across five
    // aggregates queue on the pool rather than opening five sockets, and
    // an idle one should not sit against the pooler's cap. Short in dev so
    // an abandoned server releases its share quickly.
    idleTimeoutMillis: isDev ? 4_000 : 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 30_000,
    // Bound how long a socket lives at all, so a connection the pooler has
    // quietly dropped is replaced rather than sat on.
    maxLifetimeSeconds: isDev ? 60 : 600,
  });
  // A pool-level error must never take the process down: the pooler drops
  // idle connections routinely, and pg surfaces that as an 'error' event.
  created.on("error", (err) => {
    console.error("[organic] idle pool client error:", err.message);
  });

  holder[POOL_KEY] = created;
  return created;
}
