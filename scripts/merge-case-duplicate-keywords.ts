/**
 * Merge keyword rows that differ only in capitalisation.
 *
 * Where they came from: P3.1.9 (parent interests) keeps its capitals on
 * purpose — "Women's Underwear" has to read as itself on a board — while every
 * other phase-3 write normalises to lowercase. Both upserted on the exact
 * term, so "Lingerie" landed next to an existing "lingerie" as a second row
 * for one keyword, and the older row was the one holding the validated volume
 * and the cluster. The code no longer does this (both now adopt an existing
 * row on `lower(term)`); this merges what it already made.
 *
 * The rule, in order:
 *   - the OLDEST row survives, so anything pointing at it keeps pointing at it;
 *   - the surviving TYPE is the most structural one present —
 *     PARENT_INTEREST > TOPIC_CLUSTER > anything else — because that is the
 *     role the term plays in coverage and board routing;
 *   - the surviving SPELLING is the parent-interest label when there is one,
 *     otherwise the lowercase form the rest of phase 3 writes;
 *   - every other field is filled from whichever row has it: a flag is true if
 *     either row had it true, a value is kept if either row had one.
 * `url_keywords` rows are repointed before the loser is deleted, and a pair
 * that would collide there (both spellings on one URL) keeps a single link.
 * The loser is deleted before the survivor is renamed: they would otherwise
 * both hold the same (org_id, term) for an instant, which the unique index
 * refuses.
 *
 *   MERGE_KEYWORDS_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/merge-case-duplicate-keywords.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/merge-case-duplicate-keywords.ts
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";

const DRY = process.env.MERGE_KEYWORDS_DRY_RUN === "1";

const TYPE_RANK: Record<string, number> = { PARENT_INTEREST: 3, TOPIC_CLUSTER: 2 };
const rank = (t: string) => TYPE_RANK[t] ?? 1;

interface Row {
  id: string;
  org_id: string;
  term: string;
  type: string;
  cluster_id: string | null;
  seasonal_type: string | null;
  ramp_up_start: string | null;
  peak_window_start: string | null;
  peak_window_end: string | null;
  category_fit: string | null;
  volume_validated: boolean;
  client_forbidden: boolean;
  autocomplete_rank: number | null;
  generic_applies_to_all: boolean | null;
  client_aligned: boolean | null;
  is_seed: boolean | null;
  created_at: string;
}

async function main() {
  const pool = organicPool();
  const { rows } = await pool.query<{ org: string | null; groups: Row[] }>(
    `SELECT o.name AS org, json_agg(row_to_json(k) ORDER BY k.created_at) AS groups
       FROM organic.keywords k
       LEFT JOIN public.organizations o ON o.id = k.org_id
      GROUP BY o.name, k.org_id, lower(k.term)
     HAVING count(*) > 1
      ORDER BY o.name`
  );

  if (rows.length === 0) {
    console.log("No keywords differ only in capitalisation.");
    return;
  }

  const client = await pool.connect();
  try {
    if (!DRY) await client.query("BEGIN");
    let merged = 0;
    for (const g of rows) {
      const group = g.groups;
      const keep = group[0]; // oldest
      const losers = group.slice(1);
      const best = [...group].sort((a, b) => rank(b.type) - rank(a.type))[0];
      const parent = group.find((r) => r.type === "PARENT_INTEREST");

      // A proper-noun label keeps its capitals; anything else settles on the
      // normalised spelling the rest of phase 3 writes.
      const term = parent ? parent.term : keep.term.toLowerCase();
      const type = best.type;
      const pick = <K extends keyof Row>(k: K): Row[K] =>
        (group.find((r) => r[k] !== null && r[k] !== undefined)?.[k] ?? null) as Row[K];
      const anyTrue = (k: keyof Row) => group.some((r) => r[k] === true);

      console.log(
        `${(g.org ?? "(no org)")}  «${keep.term.toLowerCase()}»\n` +
          `   keep ${keep.id.slice(0, 8)} as "${term}" [${type}]` +
          `   drop ${losers.map((l) => `${l.id.slice(0, 8)} "${l.term}" [${l.type}]`).join(", ")}`
      );
      if (DRY) { merged++; continue; }

      // Move URL links onto the survivor; a URL that carried both spellings
      // ends up with one link, not a duplicate.
      for (const l of losers) {
        await client.query(
          `UPDATE organic.url_keywords uk
              SET keyword_id = $1
            WHERE uk.keyword_id = $2
              AND NOT EXISTS (SELECT 1 FROM organic.url_keywords x
                               WHERE x.url_id = uk.url_id AND x.keyword_id = $1)`,
          [keep.id, l.id]
        );
        await client.query(`DELETE FROM organic.url_keywords WHERE keyword_id = $1`, [l.id]);
      }

      await client.query(
        `DELETE FROM organic.keywords WHERE id = ANY($1::uuid[])`,
        [losers.map((l) => l.id)]
      );
      await client.query(
        `UPDATE organic.keywords
            SET term = $2, type = $3::organic.keyword_type,
                cluster_id = $4, seasonal_type = $5::organic.seasonal_type,
                ramp_up_start = $6::date, peak_window_start = $7::date, peak_window_end = $8::date,
                category_fit = $9, volume_validated = $10, client_forbidden = $11,
                autocomplete_rank = $12, generic_applies_to_all = $13,
                client_aligned = $14, is_seed = $15
          WHERE id = $1`,
        [
          keep.id, term, type,
          pick("cluster_id"), pick("seasonal_type"),
          pick("ramp_up_start"), pick("peak_window_start"), pick("peak_window_end"),
          pick("category_fit"),
          anyTrue("volume_validated"), anyTrue("client_forbidden"),
          pick("autocomplete_rank"), anyTrue("generic_applies_to_all"),
          anyTrue("client_aligned"), anyTrue("is_seed"),
        ]
      );
      merged++;
    }
    if (!DRY) await client.query("COMMIT");
    console.log(DRY ? `\nMERGE_KEYWORDS_DRY_RUN=1 — nothing written (${merged} group(s)).`
                    : `\nMerged ${merged} group(s).`);
  } catch (e) {
    if (!DRY) await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
