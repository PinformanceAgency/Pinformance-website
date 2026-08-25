/**
 * Record that a store's attribution window has been read off Campaign
 * Manager, and re-pull its history if the window changed.
 *
 * Pinterest does not expose an ad account's configured conversion window
 * through the API, so this is the one thing in the pipeline that a person
 * has to supply. Open the store in Campaign Manager, read "Conversion
 * settings" from the header, and record it here.
 *
 *   npx tsx scripts/confirm-attribution.ts                 what still needs checking
 *   npx tsx scripts/confirm-attribution.ts "Store" 30/1    confirm (and fix if changed)
 */
import "dotenv/config";
import { Client } from "pg";

const VALID = ["30/1", "30/7", "30/30", "7/7", "7/1", "1/1"];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const [name, window] = process.argv.slice(2);

  if (!name) {
    const r = await c.query<{ name: string; attribution_setting: string; age: string | null }>(
      `SELECT o.name, st.attribution_setting,
              CASE WHEN st.attribution_verified_at IS NULL THEN NULL
                   ELSE (current_date - st.attribution_verified_at::date)::text END age
         FROM public.store_settings st
         JOIN public.organizations o ON o.id = st.org_id
        WHERE st.is_active AND st.department IS NOT NULL
        ORDER BY st.attribution_verified_at NULLS FIRST, o.name`);
    const never = r.rows.filter((x) => x.age === null);
    const stale = r.rows.filter((x) => x.age !== null && Number(x.age) > 90);
    const ok = r.rows.length - never.length - stale.length;
    console.log(`${ok} confirmed · ${stale.length} stale (>90d) · ${never.length} never checked\n`);
    for (const x of [...never, ...stale]) {
      console.log(`  ${x.name.padEnd(26)} ${String(x.attribution_setting).padEnd(6)} ` +
                  `${x.age === null ? "never checked" : x.age + "d ago"}`);
    }
    console.log(`\n  confirm with:  npx tsx scripts/confirm-attribution.ts "Store name" 30/1`);
    await c.end(); process.exit(0);
  }

  if (!window || !VALID.includes(window)) {
    console.error(`window must be one of: ${VALID.join(", ")}`);
    await c.end(); process.exit(1);
  }

  const cur = await c.query<{ id: string; name: string; attribution_setting: string }>(
    `SELECT o.id::text, o.name, st.attribution_setting
       FROM public.organizations o JOIN public.store_settings st ON st.org_id = o.id
      WHERE o.name ILIKE $1`, [name]);
  if (cur.rowCount !== 1) {
    console.error(cur.rowCount === 0 ? `no store matching "${name}"`
      : `"${name}" matches ${cur.rowCount} stores: ${cur.rows.map((r) => r.name).join(", ")}`);
    await c.end(); process.exit(1);
  }
  const store = cur.rows[0];
  const changed = store.attribution_setting !== window;

  await c.query(
    `UPDATE public.store_settings
        SET attribution_setting = $2,
            attribution_verified_at = now(),
            attribution_verified_by = 'manual'
      WHERE org_id = $1`, [store.id, window]);

  console.log(`${store.name}: ${store.attribution_setting} → ${window}${changed ? "" : " (unchanged)"}, confirmed now`);
  if (changed) {
    console.log(`\n  The window changed, so this store's stored history was built on the`);
    console.log(`  wrong setting. Re-pull it:`);
    console.log(`    DOTENV_CONFIG_PATH=.env.local npx tsx scripts/backfill-account-metrics.ts 60`);
  }
  await c.end(); process.exit(0);
})();
