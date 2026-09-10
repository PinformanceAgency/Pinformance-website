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

/**
 * Session mode (:5432) caps *clients* at pool_size — 15 for this project,
 * shared by every Vercel instance, every cron and every dev machine. One
 * serverless instance holding four is fine; six warm instances plus a cron
 * plus a laptop is not, and the pooler answers the next connection with
 *
 *   (EMAXCONNSESSION) max clients reached in session mode
 *
 * which Next renders as "a server-side exception has occurred" on whatever
 * page happened to query at that moment. Nothing about that page is wrong,
 * which is what makes it so confusing to chase — it hit /client/…/phase/2
 * on 27-08-2026 (digest 785740024) with the route itself perfectly healthy.
 *
 * Transaction mode (:6543) is the serverless answer: a client checks a
 * server connection out per statement instead of holding one for the life
 * of the socket, so the client cap is in the hundreds. Everything this app
 * does works there — its transactions are explicit BEGIN/COMMIT on a
 * checked-out client, which the pooler pins for the duration.
 *
 * What must NOT move here is a bare `SET` outside a transaction: it lands
 * on whichever server connection served that one statement and is gone by
 * the next. Nothing in src/lib/organic does that (media-buying does, which
 * is exactly why team-activity.ts stays on session mode).
 *
 * ORGANIC_DATABASE_URL overrides, for the case where the two need to point
 * somewhere different entirely.
 */
function organicConnectionString(): string {
  const explicit = process.env.ORGANIC_DATABASE_URL;
  if (explicit) return explicit;

  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error("DATABASE_URL not set");

  // Rewritten with a regex rather than through `new URL`, because parsing
  // and re-serialising a connection string re-encodes the password and a
  // password is exactly the thing that must survive byte for byte.
  return cs.replace(/(pooler\.supabase\.com):5432\b/, "$1:6543");
}

export function organicPool(): Pool {
  const holder = globalThis as unknown as PoolHolder;
  const existing = holder[POOL_KEY];
  if (existing) return existing;

  const cs = organicConnectionString();

  // Sized to how the screens actually fan out, which is wider than this once
  // assumed. The phase-4 page awaits TWELVE aggregates in one Promise.all,
  // and several of those fan out again — loadAccountBrief alone fires
  // fourteen queries at once. On four connections that is a queue, and the
  // queue is what the operator sees: pg rejects a wait longer than
  // connectionTimeoutMillis with "timeout exceeded when trying to connect",
  // the server component throws, and the whole screen becomes the error
  // boundary. Measured 10-09-2026 on Fit Cherries: the page took 8.2s on two
  // connections while the same loaders cost 14s of pure round-trip serially,
  // i.e. it was latency-bound and starved, not slow.
  //
  // Transaction mode is what makes this safe: a client connection there is
  // multiplexed onto a server connection per statement, so the cap is in the
  // hundreds rather than the 15 that session mode allows for the whole
  // project. See organicConnectionString().
  const isDev = process.env.NODE_ENV !== "production";

  const created = new Pool({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    max: isDev ? 8 : 16,
    // Hand a connection back promptly: an idle socket should not sit against
    // the pooler's cap. Short in dev so an abandoned server releases its
    // share quickly.
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
  return withConnectionRetry(created);
}

/**
 * Errors that mean the statement never reached Postgres.
 *
 * Serverless is the reason this matters. An instance freezes between
 * invocations and its sockets die quietly on the other side; the next
 * request picks up a connection that is already gone, or waits out
 * connectionTimeoutMillis for one that will never come. pg reports that as
 * "timeout exceeded when trying to connect" or "Connection terminated", the
 * server component throws, and the whole screen becomes the error boundary —
 * reported as happening several times a day, with nothing wrong except a cold
 * socket.
 *
 * Only failures from BEFORE the statement ran are listed. A query timeout is
 * deliberately absent: the statement may well have executed, and retrying an
 * INSERT that already landed is a worse failure than the one being fixed.
 */
function isDeadConnection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    /timeout exceeded when trying to connect/i.test(msg) ||
    /Connection terminated/i.test(msg) ||
    /Client has encountered a connection error/i.test(msg) ||
    /server closed the connection unexpectedly/i.test(msg) ||
    /terminating connection due to administrator command/i.test(msg) ||
    code === "ECONNRESET" || code === "EPIPE" || code === "ETIMEDOUT" ||
    code === "57P01" || code === "08006" || code === "08003"
  );
}

/**
 * One retry, for a statement that demonstrably never ran.
 *
 * Wrapped on the pool rather than added at four hundred call sites, and only
 * around the promise form — the callback overload is not used anywhere in the
 * organic app and silently changing its semantics would be worse than leaving
 * it alone.
 */
function withConnectionRetry(pool: Pool): Pool {
  const holder = pool as Pool & { __retryWrapped?: boolean };
  if (holder.__retryWrapped) return pool;
  const native = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (...args: unknown[]) => {
    if (typeof args[args.length - 1] === "function") return native(...args);
    try {
      return await native(...args);
    } catch (err) {
      if (!isDeadConnection(err)) throw err;
      console.warn("[organic] dead connection, retrying once:", (err as Error).message);
      return await native(...args);
    }
  };
  holder.__retryWrapped = true;
  return pool;
}
