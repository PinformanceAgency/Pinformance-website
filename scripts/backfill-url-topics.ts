/**
 * Give a topic to URLs that were imported without one.
 *
 * The sitemap importer wrote `topic_id = null` on every row it ever
 * created, and nothing else in the app set it. `organic.urls_selectable`
 * gates on `topic_covered`, which is a LEFT JOIN on that column, so a null
 * topic coalesces to false and the URL is ineligible for a cycle for ever.
 * Fit Cherries held 167 URLs and could start nothing; the screen said
 * "0 URLs eligible" and the blocker underneath it said the topic was short
 * of boards, which sent people to build boards for a topic that did not
 * exist.
 *
 * The import proposes a topic from now on. This does the same for what is
 * already there, using the same matcher — the account's own board names,
 * not the topic label alone.
 *
 * It only ever fills a null. A topic somebody chose is never overwritten,
 * and a URL the matcher cannot place keeps its null and is listed at the
 * end, because a wrong topic is worse than an absent one: it counts
 * towards a coverage figure somebody then trusts.
 *
 *   BACKFILL_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-url-topics.ts ["Store Name"]
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-url-topics.ts ["Store Name"]
 *
 * With no store name it walks every org that has URLs. Safe to re-run: a
 * second pass finds nothing left to fill.
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { loadTopicVocabulary, matchTopic } from "../src/lib/organic/url-import";

const DRY = process.env.BACKFILL_DRY_RUN === "1";
const only = process.argv[2];

async function main() {
  const pool = organicPool();

  const orgs = await pool.query<{ org_id: string; name: string; n: string }>(
    `SELECT u.org_id::text, o.name, COUNT(*)::text AS n
       FROM organic.urls u
       JOIN public.organizations o ON o.id = u.org_id
      WHERE u.topic_id IS NULL
        AND ($1::text IS NULL OR o.name ILIKE $1)
      GROUP BY u.org_id, o.name
      ORDER BY o.name`,
    [only ?? null]
  );

  if (orgs.rowCount === 0) {
    console.log(only ? `No URLs without a topic on ${only}.` : "No URLs without a topic anywhere.");
    return;
  }

  console.log(`${DRY ? "DRY RUN — " : ""}${orgs.rowCount} store(s) with untopicked URLs\n`);

  let filledTotal = 0;
  let leftTotal = 0;

  for (const org of orgs.rows) {
    const vocab = await loadTopicVocabulary(org.org_id);
    console.log(`${org.name} — ${org.n} without a topic, ${vocab.length} topic(s) to match against`);
    if (vocab.length === 0) {
      console.log("  no topics designed yet (phase 3 builds them) — skipped\n");
      leftTotal += Number(org.n);
      continue;
    }

    const rows = await pool.query<{ id: string; url: string; name: string }>(
      `SELECT id::text, url, name FROM organic.urls
        WHERE org_id = $1 AND topic_id IS NULL ORDER BY name`, [org.org_id]);

    const byTopic = new Map<string, number>();
    const unmatched: string[] = [];

    for (const u of rows.rows) {
      const m = matchTopic(u.url, u.name, vocab);
      if (!m) { unmatched.push(u.name); continue; }
      byTopic.set(m.name, (byTopic.get(m.name) ?? 0) + 1);
      if (!DRY) {
        await pool.query(
          `UPDATE organic.urls SET topic_id = $1::uuid WHERE id = $2::uuid AND topic_id IS NULL`,
          [m.id, u.id]);
      }
      filledTotal++;
    }

    for (const [name, n] of [...byTopic].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)} → ${name}`);
    }
    if (unmatched.length > 0) {
      leftTotal += unmatched.length;
      console.log(`  ${String(unmatched.length).padStart(4)} matched nothing — set by hand on the URLs page`);
      console.log(`       ${unmatched.slice(0, 8).join(" · ")}${unmatched.length > 8 ? " …" : ""}`);
    }
    console.log();
  }

  console.log(`${DRY ? "would fill" : "filled"} ${filledTotal}; ${leftTotal} still need a topic by hand`);
  if (DRY) console.log("\nDry run — nothing was written. Re-run without BACKFILL_DRY_RUN=1 to apply.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
