/**
 * Re-read account-level daily metrics with the corrected settings.
 *
 * The stored history was written under TIME_OF_CONVERSION and then frozen
 * — each day fetched once, the morning after, and never revisited while
 * its conversions kept maturing. The deployed cron now refreshes 30 days
 * on every run, but everything older stays wrong until it is re-read.
 *
 * This does exactly what the fixed cron does for the account level, over a
 * wider window. Account rows only; campaigns, ad groups and ads are left
 * alone. Upsert on (org, type, entity, date), so it corrects in place.
 *
 *   npx tsx scripts/backfill-account-metrics.ts [days] [--dry]
 */
import "dotenv/config";
import { Client } from "pg";
import { decrypt } from "../src/lib/encryption";
import { PinterestClient } from "../src/lib/pinterest/client";
import { selectAdAccount } from "../src/lib/pinterest/select-ad-account";
import { attributionToDays, DEFAULT_ATTRIBUTION_SETTING } from "../src/lib/media-buying/config";

const COLS = ["SPEND_IN_DOLLAR","IMPRESSION_1","CLICKTHROUGH_1","CTR","CPM_IN_DOLLAR","ECPC_IN_DOLLAR",
  "TOTAL_CHECKOUT","TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR","CHECKOUT_ROAS","TOTAL_CLICK_ADD_TO_CART","TOTAL_VIEW_ADD_TO_CART"];

const DAYS = Math.max(1, Math.min(180, Number(process.argv[2] ?? 60)));
const DRY = process.argv.includes("--dry");
const iso = (d: Date) => d.toISOString().slice(0, 10);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (DAYS - 1));
  console.log(`${DRY ? "[DRY] " : ""}backfilling ${iso(start)} → ${iso(end)} (${DAYS} days)\n`);

  const orgs = await c.query<{ id: string; name: string; tok: string; settings: Record<string, unknown> | null; attr: string | null }>(
    `SELECT o.id::text, o.name, o.pinterest_access_token_encrypted tok, o.settings,
            st.attribution_setting attr
       FROM public.organizations o
       JOIN public.store_settings st ON st.org_id = o.id
      WHERE o.pinterest_access_token_encrypted IS NOT NULL AND st.is_active
      ORDER BY o.name`);

  let okCount = 0, rowCount = 0;
  const failures: string[] = [];

  for (const o of orgs.rows) {
    try {
      const pin = new PinterestClient(decrypt(o.tok));
      const pref = (o.settings?.pinterest_ad_account_id as string | undefined) ?? null;
      const acct = (await selectAdAccount(pin, o.name, pref)).chosen;
      if (!acct) { failures.push(`${o.name}: no ad account`); continue; }

      const attr = attributionToDays(o.attr ?? DEFAULT_ATTRIBUTION_SETTING);
      const resp = await pin.getAdAccountAnalytics(acct.id, iso(start), iso(end), {
        granularity: "DAY", clickWindowDays: attr.click, viewWindowDays: attr.view,
        columns: COLS, conversionReportTime: "TIME_OF_AD_ACTION",
      });
      const days: Array<Record<string, number | string>> = Array.isArray(resp)
        ? (resp as Array<Record<string, number | string>>)
        : (((resp as { all?: { daily_metrics?: Array<{ date: string; metrics: Record<string, number> }> } })
            .all?.daily_metrics ?? []).map((d) => ({ ...d.metrics, DATE: d.date })));

      let wrote = 0;
      for (const r of days) {
        const date = String(r.DATE ?? r.date ?? "").slice(0, 10);
        if (!date) continue;
        const spend = Number(r.SPEND_IN_DOLLAR ?? 0);
        const revenue = Number(r.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR ?? 0) / 1e6;
        const conversions = Number(r.TOTAL_CHECKOUT ?? 0);
        const impressions = Number(r.IMPRESSION_1 ?? 0);
        const clicks = Number(r.CLICKTHROUGH_1 ?? 0);
        if (DRY) { wrote++; continue; }
        await c.query(
          `INSERT INTO public.pinterest_metrics_snapshots
             (org_id, ad_account_id, entity_type, entity_id, snapshot_date, entity_name,
              currency, spend, revenue, conversions, impressions, clicks, roas,
              add_to_carts, add_to_cart_value)
           VALUES ($1,$2,'account',$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (org_id, entity_type, entity_id, snapshot_date) DO UPDATE SET
             spend=EXCLUDED.spend, revenue=EXCLUDED.revenue, conversions=EXCLUDED.conversions,
             impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, roas=EXCLUDED.roas,
             add_to_carts=EXCLUDED.add_to_carts, add_to_cart_value=EXCLUDED.add_to_cart_value,
             currency=EXCLUDED.currency, inserted_at=now()`,
          [o.id, acct.id, date, acct.name ?? null, acct.currency ?? null,
           spend, revenue, conversions, impressions, clicks,
           spend > 0 ? revenue / spend : null,
           Number(r.TOTAL_CLICK_ADD_TO_CART ?? 0) + Number(r.TOTAL_VIEW_ADD_TO_CART ?? 0), 0]);
        wrote++;
      }
      okCount++; rowCount += wrote;
      console.log(`  ${o.name.padEnd(26)} ${String(wrote).padStart(3)} days  (${acct.name})`);
    } catch (e) {
      failures.push(`${o.name}: ${(e as Error).message.slice(0, 70)}`);
    }
  }

  console.log(`\n${okCount}/${orgs.rowCount} stores, ${rowCount} day-rows ${DRY ? "would be" : ""} written`);
  if (failures.length) { console.log("\nfailures:"); for (const f of failures) console.log("  " + f); }
  await c.end(); process.exit(0);
})();
