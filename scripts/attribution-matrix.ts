/**
 * What revenue does each attribution window give, per store?
 *
 * The dashboard matches Pinterest exactly at whatever window we have in
 * store_settings.attribution_setting. If the platform screen is set to a
 * wider one, ours reads low — and nothing in either UI states which window
 * the other is using, so the gap is invisible from both sides.
 *
 * This prints the same week under every combination Pinterest accepts, with
 * our current setting marked, so the right column can be picked by eye.
 * Read-only.
 */
import "dotenv/config";
import { Client } from "pg";
import { decrypt } from "../src/lib/encryption";
import { PinterestClient } from "../src/lib/pinterest/client";
import { selectAdAccount } from "../src/lib/pinterest/select-ad-account";

const COLS = ["SPEND_IN_DOLLAR", "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"];
// Only combinations Pinterest accepts — it rejects anything else outright.
const WINDOWS: Array<{ label: string; click: 1|7|30|60; view: 1|7|30|60 }> = [
  { label: "30/1",  click: 30, view: 1  },
  { label: "30/7",  click: 30, view: 7  },
  { label: "30/30", click: 30, view: 30 },
  { label: "60/60", click: 60, view: 60 },
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const END = process.argv[2] ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const START = process.argv[3] ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const orgs = await c.query<{ id: string; name: string; tok: string; settings: Record<string, unknown> | null; attr: string | null }>(
    `SELECT o.id::text, o.name, o.pinterest_access_token_encrypted tok, o.settings, st.attribution_setting attr
       FROM public.organizations o JOIN public.store_settings st ON st.org_id=o.id
      WHERE o.pinterest_access_token_encrypted IS NOT NULL AND st.is_active
        AND st.department IS NOT NULL AND st.breakeven_roas IS NOT NULL
      ORDER BY o.name`);

  console.log(`window ${START} → ${END}   revenue per attribution setting\n`);
  const table: Array<Record<string, string>> = [];

  for (const o of orgs.rows) {
    try {
      const pin = new PinterestClient(decrypt(o.tok));
      const acct = (await selectAdAccount(pin, o.name,
        (o.settings?.pinterest_ad_account_id as string) ?? null)).chosen;
      if (!acct) continue;
      const row: Record<string, string> = { store: o.name.slice(0, 22), ours: o.attr ?? "30/1" };
      for (const w of WINDOWS) {
        const r = await pin.getAdAccountAnalytics(acct.id, START, END, {
          granularity: "TOTAL", clickWindowDays: w.click, viewWindowDays: w.view,
          columns: COLS, conversionReportTime: "TIME_OF_AD_ACTION" });
        const m = (Array.isArray(r) ? r[0] : {}) as Record<string, number>;
        row[w.label] = (Number(m.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR ?? 0) / 1e6).toFixed(0);
      }
      const db = (await c.query<{ r: string }>(
        `SELECT COALESCE(SUM(revenue),0)::text r FROM public.pinterest_metrics_snapshots
          WHERE org_id=$1 AND entity_type='account' AND snapshot_date BETWEEN $2::date AND $3::date`,
        [o.id, START, END])).rows[0];
      row.dashboard = Number(db.r).toFixed(0);
      table.push(row);
    } catch { /* skip unreachable stores; audit-ranking reports those */ }
  }
  console.table(table);
  console.log("\n'dashboard' is what the Hub shows. It should equal the column named in 'ours'.");
  await c.end(); process.exit(0);
})();
