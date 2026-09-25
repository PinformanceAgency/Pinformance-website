/**
 * Give product pages their type back.
 *
 * The cycle card's "Save setup" sent `type: "COLLECTION"` for every URL it
 * saved, whatever the URL was. On 25-09-2026 every one of the 21 URLs that
 * had ever started a cycle was a COLLECTION, among them the Roha Home
 * suction hooks, a Celestia dress and The Longevity store's one product.
 * The type decides the overlay (PRODUCT is the one type that publishes
 * without a text overlay) and what the design brief asks for, so a product
 * cycle was being briefed as a collection.
 *
 * Narrow on purpose: it only moves a row stored as COLLECTION whose path the
 * importer's own classifier reads as PRODUCT (`/products/…`), which is
 * exactly the shape the bug produced. Nothing else is touched. Waterfalls
 * already generated keep their designs; a regeneration picks the type up.
 *
 *   REPAIR_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/repair-url-types.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/repair-url-types.ts
 *
 * Safe to re-run: a second pass finds nothing.
 */
import "dotenv/config";
import { organicPool } from "../src/lib/organic/db";
import { classifyUrl } from "../src/lib/organic/url-import";

const DRY = process.env.REPAIR_DRY_RUN === "1";

async function main() {
  const pool = organicPool();
  const rows = await pool.query<{ id: string; org: string; url: string; name: string }>(
    `SELECT u.id::text, o.name AS org, u.url, u.name
       FROM organic.urls u
       JOIN public.organizations o ON o.id = u.org_id
      WHERE u.type = 'COLLECTION'::organic.url_type
      ORDER BY o.name, u.name`
  );
  const wrong = rows.rows.filter((r) => classifyUrl(r.url) === "PRODUCT");
  for (const r of wrong) console.log(`${r.org.padEnd(24)} ${r.name}  ${r.url}`);
  console.log(`\n${wrong.length} product page(s) stored as COLLECTION${DRY ? " (dry run, nothing written)" : ""}`);
  if (!DRY && wrong.length > 0) {
    const r = await pool.query(
      `UPDATE organic.urls SET type = 'PRODUCT'::organic.url_type
        WHERE id = ANY($1::uuid[]) AND type = 'COLLECTION'::organic.url_type`,
      [wrong.map((w) => w.id)]
    );
    console.log(`updated ${r.rowCount}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
