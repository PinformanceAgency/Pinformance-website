/**
 * Where does Store Ranking disagree with Pinterest, and by how much?
 *
 * Compares, per active store and for the page's default window, what the
 * dashboard shows (summed daily snapshots) against what Pinterest returns
 * live under both conversion_report_time settings. Read-only.
 */
import "dotenv/config";
import { Client } from "pg";
import { decrypt } from "../src/lib/encryption";
import { PinterestClient } from "../src/lib/pinterest/client";
import { selectAdAccount } from "../src/lib/pinterest/select-ad-account";
import { attributionToDays, DEFAULT_ATTRIBUTION_SETTING } from "../src/lib/media-buying/config";

const COLS = ["SPEND_IN_DOLLAR","IMPRESSION_1","CLICKTHROUGH_1","CTR","CPM_IN_DOLLAR","ECPC_IN_DOLLAR",
  "TOTAL_CHECKOUT","TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR","CHECKOUT_ROAS","TOTAL_CLICK_ADD_TO_CART","TOTAL_VIEW_ADD_TO_CART"];

const END = process.argv[2] ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const START = process.argv[3] ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const orgs = await c.query<{ id: string; name: string; tok: string; attr: string | null; settings: Record<string, unknown> | null }>(
    `SELECT o.id::text, o.name, o.pinterest_access_token_encrypted tok, o.settings, st.attribution_setting attr
       FROM public.organizations o
       JOIN public.store_settings st ON st.org_id = o.id
      WHERE o.pinterest_access_token_encrypted IS NOT NULL
        AND st.is_active AND st.department IS NOT NULL AND st.breakeven_roas IS NOT NULL
      ORDER BY o.name`);

  console.log(`window ${START} → ${END}   (${orgs.rowCount} stores)\n`);
  const out: Array<Record<string, string | number>> = [];

  for (const o of orgs.rows) {
    try {
      const pin = new PinterestClient(decrypt(o.tok));
      const pref = (o.settings?.pinterest_ad_account_id as string | undefined) ?? null;
      const acct = (await selectAdAccount(pin, o.name, pref)).chosen;
      if (!acct) { out.push({ store: o.name, note: "no ad account" }); continue; }
      const attr = attributionToDays(o.attr ?? DEFAULT_ATTRIBUTION_SETTING);
      const call = async (crt: "TIME_OF_AD_ACTION" | "TIME_OF_CONVERSION") => {
        const r = await pin.getAdAccountAnalytics(acct.id, START, END,
          { granularity: "TOTAL", clickWindowDays: attr.click, viewWindowDays: attr.view, columns: COLS, conversionReportTime: crt });
        const m = (Array.isArray(r) ? r[0] : {}) as Record<string, number>;
        return {
          // SPEND_IN_DOLLAR is already dollars; only the checkout value is micro.
          spend: Number(m.SPEND_IN_DOLLAR ?? 0),
          revenue: Number(m.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR ?? 0) / 1_000_000,
        };
      };
      const action = await call("TIME_OF_AD_ACTION");
      const conv = await call("TIME_OF_CONVERSION");
      const db = (await c.query<{ s: string; r: string }>(
        `SELECT COALESCE(SUM(spend),0)::text s, COALESCE(SUM(revenue),0)::text r
           FROM public.pinterest_metrics_snapshots
          WHERE org_id=$1 AND entity_type='account' AND snapshot_date BETWEEN $2::date AND $3::date`,
        [o.id, START, END])).rows[0];
      const dbS = Number(db.s), dbR = Number(db.r);
      const gap = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);
      out.push({
        store: o.name.slice(0, 22),
        attr: o.attr ?? "30/1",
        spend_db: dbS.toFixed(0),
        spend_api: action.spend.toFixed(0),
        "spend_%": gap(dbS, action.spend).toFixed(1),
        rev_db: dbR.toFixed(0),
        rev_action: action.revenue.toFixed(0),
        "rev_%": gap(dbR, action.revenue).toFixed(1),
        rev_conv: conv.revenue.toFixed(0),
      });
    } catch (e) {
      out.push({ store: o.name.slice(0, 22), note: (e as Error).message.slice(0, 40) });
    }
  }
  // Worst revenue gaps first — that is the list worth acting on.
  out.sort((a, b) => Math.abs(Number(b["rev_%"] ?? 0)) - Math.abs(Number(a["rev_%"] ?? 0)));
  console.table(out);
  await c.end();
  process.exit(0);
})();
