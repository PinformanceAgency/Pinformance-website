/**
 * Close volume-lookup queue rows whose answer is already in the shared cache.
 *
 * Why they exist: P3.1.8 wrote the cache with the normalised (lowercase) term
 * but closed the queue with `WHERE term = <normalised>`, and the queue keeps
 * whatever capitals the keyword bank had. Eleven of Fit Cherries' 323 lookups
 * on 07-09-2026 were left QUEUED with their volumes sitting in the cache — the
 * work was done, the screen said it was not, and the next work list asked for
 * them again. The code no longer does this (it matches on `lower(term)`); this
 * clears what it left behind.
 *
 * It is deliberately broader than that one cause: any QUEUED row whose term is
 * already cached is a lookup nobody needs to perform again. Nothing is deleted
 * and no volume is invented — the status and the validated flag come from the
 * cache row that is already there.
 *
 *   CLOSE_QUEUE_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/close-stuck-volume-queue.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/close-stuck-volume-queue.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";

const DRY = process.env.CLOSE_QUEUE_DRY_RUN === "1";

async function main() {
  const pool = organicPool();

  const { rows } = await pool.query<{
    org_id: string | null;
    org_name: string | null;
    term: string;
    volume: number | null;
    not_found: boolean;
  }>(
    `SELECT q.org_id, o.name AS org_name, q.term, k.volume, k.not_found
       FROM organic.volume_lookup_queue q
       JOIN organic.keyword_volume_cache k ON k.term = lower(q.term)
       LEFT JOIN public.organizations o ON o.id = q.org_id
      WHERE q.status = 'QUEUED'
      ORDER BY o.name NULLS LAST, q.term`
  );

  if (rows.length === 0) {
    console.log("Nothing to close — no QUEUED row has a cached answer.");
    return;
  }

  console.log(`${rows.length} queued lookup(s) already answered by the cache:`);
  for (const r of rows) {
    console.log(
      `  ${(r.org_name ?? "(no org)").padEnd(20)} ${r.term.padEnd(42)} ` +
        (r.not_found ? "NOT_FOUND" : `volume ${r.volume ?? "—"}`)
    );
  }

  if (DRY) {
    console.log("\nCLOSE_QUEUE_DRY_RUN=1 — nothing written.");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const closed = await client.query(
      `UPDATE organic.volume_lookup_queue q
          SET status = CASE WHEN k.not_found THEN 'NOT_FOUND'::organic.lookup_status
                            ELSE 'DONE'::organic.lookup_status END,
              completed_at = now()
         FROM organic.keyword_volume_cache k
        WHERE k.term = lower(q.term) AND q.status = 'QUEUED'`
    );
    // Only the rows this run closed, and only where a real volume came back:
    // a cached NOT_FOUND is an answer, not a validated volume.
    const validated = await client.query(
      `UPDATE organic.keywords kw
          SET volume_validated = true
         FROM unnest($1::uuid[], $2::text[]) AS u(org_id, term)
         JOIN organic.keyword_volume_cache k ON k.term = u.term
        WHERE kw.org_id = u.org_id
          AND lower(kw.term) = u.term
          AND k.not_found = false
          AND kw.volume_validated = false`,
      [
        rows.filter((r) => r.org_id && !r.not_found).map((r) => r.org_id),
        rows.filter((r) => r.org_id && !r.not_found).map((r) => r.term.toLowerCase()),
      ]
    );
    await client.query("COMMIT");
    console.log(`\nClosed ${closed.rowCount} queue row(s); marked ${validated.rowCount} keyword(s) validated.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
