/**
 * Voegt de stores toe die WEL actief op het Monday-klantenbord staan maar nog
 * niet als organization in het dashboard bestaan.
 *
 * MATCHEN GAAT OP AD ACCOUNT ID, NIET OP NAAM
 * -------------------------------------------
 * De namen op het bord en in de database lopen structureel uiteen --
 * "www.terrahouseco.com" is "Terrahouse", "Nova's Jewelry" is "Nova Jewelry",
 * "Tola Jewelry" is "Tola Jewelry US". Alleen op naam vergelijken levert
 * tientallen valse "ontbreekt"-regels op en dus dubbele orgs. De mapping
 * ad account -> org komt uit de snapshot-tabellen, dezelfde bron als
 * dashboardLinks() in weekly-update-sync.ts (zie de toelichting daar waarom
 * organizations/store_settings die kolom vrijwel leeg heeft). Genormaliseerde
 * naam is alleen het vangnet voor stores die nog nooit een snapshot hadden --
 * precies de verse stores waar het hier om gaat.
 *
 * WAT ER WEL EN NIET WORDT AANGEMAAKT
 * -----------------------------------
 * Alleen de `organizations`-regel plus een lege `brand_profiles`. GEEN
 * store_settings: department, niche, BER, invoice ROAS en buyer zijn keuzes
 * van de head of media buying, geen af te leiden gegevens. Zonder die regel
 * verschijnt de store in Store Settings als "Not connected / Needs setup" --
 * de bedoelde begintoestand -- en telt hij nog niet mee in Zones of
 * Benchmarks, waar een store zonder BER alleen ruis zou zijn.
 *
 * Draaien (eerst droog):
 *   ADD_STORES_DRY_RUN=1 DOTENV_CONFIG_PATH=.env.local npx tsx scripts/add-monday-active-stores.ts
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/add-monday-active-stores.ts
 *
 * Herhaald draaien is veilig: bestaande slugs worden overgeslagen.
 */
import 'dotenv/config';
import { Client as PgClient, types as pgTypes } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { loadActiveClientRows, type ActiveClientRow } from './weekly-update-sync';

pgTypes.setTypeParser(1082, (val) => val);

const DRY_RUN = process.env.ADD_STORES_DRY_RUN === '1';

const DEFAULT_SETTINGS = {
  pins_per_day: 40,
  auto_approve: false,
  timezone: 'Europe/Amsterdam',
  posting_hours: [8, 12, 17, 20],
  content_mix: { static: 70, video: 20, carousel: 10 },
  min_post_interval_minutes: 180,
  max_pins_per_day: 5,
  weekend_boost: true,
  pillar_rotation: true,
};

/**
 * Bordnaam -> dashboardnaam. Op het bord staan URL's ("otrium.nl",
 * "http://valerie-mason.com/"); in het dashboard staat de storenaam. Dit volgt
 * wat er voor de bestaande stores met de hand is gedaan.
 */
function displayName(boardName: string): string {
  const bare = boardName
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
    .replace(/\.(com|nl|de|se|co|uk|eu|be|fr|ch|ca)$/i, '');
  return bare
    .split(/[\s-]+/)
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Losjes genoeg om "Nova's Jewelry" en "Nova Jewelry" gelijk te trekken. */
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
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt');
  }

  const rows = await loadActiveClientRows();

  const pg = new PgClient({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  const orgs = await pg.query(`
    SELECT o.id::text AS id, o.name, o.slug, s.ad_account_id
      FROM organizations o
      LEFT JOIN store_settings s ON s.org_id = o.id`);
  const links = await pg.query(`
    SELECT ad_account_id, org_id::text AS org_id
      FROM (
        SELECT org_id, ad_account_id FROM pinterest_entity_snapshots
         WHERE snapshot_date > CURRENT_DATE - 90
        UNION ALL
        SELECT org_id, ad_account_id FROM pinterest_metrics_snapshots
         WHERE snapshot_date > CURRENT_DATE - 90
      ) u
     WHERE ad_account_id IS NOT NULL
     GROUP BY ad_account_id, org_id`);
  await pg.end();

  const orgById = new Map(orgs.rows.map((o) => [o.id, o]));
  const orgByAdAccount = new Map<string, { name: string }>();
  for (const l of links.rows) {
    const o = orgById.get(l.org_id);
    if (o) orgByAdAccount.set(String(l.ad_account_id), o);
  }
  for (const o of orgs.rows) if (o.ad_account_id) orgByAdAccount.set(String(o.ad_account_id), o);
  const orgByName = new Map(orgs.rows.map((o) => [norm(o.name ?? ''), o]));
  const orgBySlug = new Map(orgs.rows.map((o) => [o.slug, o]));

  const missing: ActiveClientRow[] = [];
  for (const r of rows) {
    const hit =
      (r.adAccountId ? orgByAdAccount.get(r.adAccountId) : undefined) ??
      orgByName.get(norm(r.storeName));
    if (!hit) missing.push(r);
  }

  console.log(
    `Monday actief: ${rows.length} | orgs in dashboard: ${orgs.rows.length} | ontbrekend: ${missing.length}`,
  );
  if (DRY_RUN) console.log('DROOGLOOP -- er wordt niets weggeschreven\n');

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let created = 0;
  let skipped = 0;
  for (const r of missing.sort((a, b) => a.storeName.localeCompare(b.storeName))) {
    const name = displayName(r.storeName);
    const slug = slugify(name);

    if (orgBySlug.has(slug)) {
      console.log(`•  ${r.storeName.padEnd(24)} -> slug ${slug} bestaat al -- overgeslagen`);
      skipped++;
      continue;
    }
    if (DRY_RUN) {
      console.log(`+  ${r.storeName.padEnd(24)} -> "${name}" (slug=${slug})`);
      created++;
      continue;
    }

    const { data: org, error } = await supa
      .from('organizations')
      .insert({
        name,
        slug,
        onboarding_step: 5,
        onboarding_completed_at: new Date().toISOString(),
        settings: DEFAULT_SETTINGS,
      })
      .select('id')
      .single();
    if (error || !org) {
      console.error(`x  ${r.storeName}: ${error?.message}`);
      continue;
    }
    const { error: bpErr } = await supa
      .from('brand_profiles')
      .insert({ org_id: org.id, raw_data: {} });
    if (bpErr) console.error(`   let op: brand_profiles voor ${name}: ${bpErr.message}`);

    console.log(`+  ${r.storeName.padEnd(24)} -> "${name}" (slug=${slug}) aangemaakt ${org.id}`);
    created++;
  }

  console.log(
    `\nKlaar. ${created} ${DRY_RUN ? 'zouden worden aangemaakt' : 'aangemaakt'}, ${skipped} overgeslagen.`,
  );
  if (created > 0 && !DRY_RUN) {
    console.log(
      'Ze staan nu op "Needs setup": department, niche, land, buyer, BER en\n' +
        'invoice ROAS invullen via Store Settings in het dashboard.',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
