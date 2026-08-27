/**
 * Read-only: welke actieve stores op het Monday-klantenbord ontbreken in het
 * dashboard?
 *
 * Matcht op ad account ID (de echte sleutel; namen wijken structureel af:
 * "astrilon.com" op het bord is "astrilon" in de database). De mapping
 * ad account -> org komt uit de snapshot-tabellen, dezelfde bron als
 * dashboardLinks() in weekly-update-sync.ts -- zie de toelichting daar waarom
 * organizations/store_settings die kolom vrijwel leeg heeft.
 *
 * Draaien:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/diff-monday-vs-dashboard.ts
 */
import 'dotenv/config';
import { Client as PgClient, types as pgTypes } from 'pg';
import { loadActiveClientRows } from './weekly-update-sync';

pgTypes.setTypeParser(1082, (val) => val);

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.(com|nl|de|se|co|uk|eu|be|fr|ch|ca)\/?$/g, '')
    .replace(/\bthe\b/g, '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');

async function main() {
  const rows = await loadActiveClientRows();
  const pg = new PgClient({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const orgs = await pg.query(`
    SELECT o.id::text AS id, o.name, o.slug, o.created_at,
           o.pinterest_user_id IS NOT NULL AS pin,
           s.is_active, s.media_buyer, s.department, s.ad_account_id
      FROM organizations o
      LEFT JOIN store_settings s ON s.org_id = o.id
     ORDER BY o.name`);

  // ad account -> org, uit beide snapshot-tabellen (90 dagen)
  const links = await pg.query(`
    SELECT ad_account_id, org_id::text AS org_id, MAX(snapshot_date) AS last_seen
      FROM (
        SELECT org_id, ad_account_id, snapshot_date FROM pinterest_entity_snapshots
         WHERE snapshot_date > CURRENT_DATE - 90
        UNION ALL
        SELECT org_id, ad_account_id, snapshot_date FROM pinterest_metrics_snapshots
         WHERE snapshot_date > CURRENT_DATE - 90
      ) u
     WHERE ad_account_id IS NOT NULL
     GROUP BY ad_account_id, org_id`);
  await pg.end();

  const orgById = new Map(orgs.rows.map((o) => [o.id, o]));
  const orgByAdAccount = new Map<string, any>();
  for (const l of links.rows) {
    const o = orgById.get(l.org_id);
    if (o) orgByAdAccount.set(String(l.ad_account_id), { ...o, lastSeen: l.last_seen });
  }
  for (const o of orgs.rows) {
    if (o.ad_account_id) orgByAdAccount.set(String(o.ad_account_id), o);
  }
  const orgByName = new Map(orgs.rows.map((o) => [norm(o.name || ''), o]));

  const matched: Array<{ row: any; org: any; how: string }> = [];
  const missing: any[] = [];
  for (const r of rows) {
    const byAd = r.adAccountId ? orgByAdAccount.get(r.adAccountId) : undefined;
    const byName = orgByName.get(norm(r.storeName));
    if (byAd) matched.push({ row: r, org: byAd, how: 'ad-account' });
    else if (byName) matched.push({ row: r, org: byName, how: 'naam' });
    else missing.push(r);
  }

  console.log(`Monday actief: ${rows.length} | orgs in DB: ${orgs.rows.length}\n`);
  console.log('=== GEKOPPELD ===');
  for (const m of matched.sort((a, b) => a.row.storeName.localeCompare(b.row.storeName))) {
    const flag = m.org.is_active === false ? '  <-- store_settings.is_active = false' : m.org.is_active === null ? '  <-- geen store_settings' : '';
    console.log(
      `  ${m.how.padEnd(10)} ${m.row.storeName.padEnd(30)} -> ${(m.org.name || '').padEnd(26)} pin=${m.org.pin} buyer=${(m.org.media_buyer || '-').padEnd(10)}${flag}`,
    );
  }

  console.log('\n=== ONTBREEKT IN DASHBOARD ===');
  for (const r of missing.sort((a, b) => a.storeName.localeCompare(b.storeName))) {
    console.log(
      `  ${r.storeName.padEnd(30)} ad=${(r.adAccountId || '-').padEnd(14)} attr=${(r.attributionLabel || '-').padEnd(24)} cur=${(r.currencyLabel || '-').padEnd(4)} monday-created=${r.createdAt.slice(0, 10)}`,
    );
  }
  console.log(`\n${matched.length} gekoppeld, ${missing.length} ontbrekend`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
