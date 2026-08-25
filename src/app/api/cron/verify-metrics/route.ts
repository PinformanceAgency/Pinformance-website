/**
 * Does the dashboard still agree with Pinterest?
 *
 * Three separate bugs put Store Ranking's revenue between -34% and +100%
 * away from Ads Manager, and every one of them was invisible from inside
 * the app: the wrong conversion_report_time, days written once and never
 * refreshed while their conversions matured, and stores silently reading
 * the wrong ad account because name matching fell through to "the first
 * one Pinterest returned". Nothing in the system noticed. It took someone
 * opening both screens side by side.
 *
 * This is the thing that notices. It re-reads the same window straight
 * from Pinterest and compares it against what we stored, per store, and
 * alerts when they diverge. It writes nothing.
 *
 * Read-only by design: a checker that repairs what it finds hides the
 * fault it exists to report, and would have masked all three of the bugs
 * above.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { attributionToDays, DEFAULT_ATTRIBUTION_SETTING } from "@/lib/media-buying/config";
import { alertCronFailure } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 300;

const COLS = [
  "SPEND_IN_DOLLAR", "IMPRESSION_1", "CLICKTHROUGH_1", "CTR", "CPM_IN_DOLLAR",
  "ECPC_IN_DOLLAR", "TOTAL_CHECKOUT", "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
  "CHECKOUT_ROAS", "TOTAL_CLICK_ADD_TO_CART", "TOTAL_VIEW_ADD_TO_CART",
];

/**
 * Spend is not attributed — it is money that left the account on a day and
 * it should agree to the cent. Revenue moves as late conversions land, so
 * it gets a little room, but nothing like the double-digit drift we had.
 */
const SPEND_TOLERANCE_PCT = 1;
const REVENUE_TOLERANCE_PCT = 5;
/** Below this, a percentage on a near-zero base is noise, not a finding. */
const MIN_MATERIAL_SPEND = 50;

interface Check {
  store: string;
  ad_account: string | null;
  spend_db: number;
  spend_api: number;
  spend_gap_pct: number | null;
  revenue_db: number;
  revenue_api: number;
  revenue_gap_pct: number | null;
  problem: string | null;
}

const pct = (a: number, b: number): number | null =>
  b === 0 ? (a === 0 ? 0 : null) : Number((((a - b) / b) * 100).toFixed(1));

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") ?? 7)));
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - (days - 1));
  const startISO = start.toISOString().slice(0, 10);
  const endISO = end.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  const { data: settingsRows } = await admin
    .from("store_settings")
    .select("org_id, attribution_setting, is_active, department, breakeven_roas");
  const settingsByOrg = new Map(
    (settingsRows ?? []).map((s) => [s.org_id as string, s])
  );

  const checks: Check[] = [];

  for (const org of orgs ?? []) {
    const st = settingsByOrg.get(org.id as string);
    // Only stores the Hub actually reports on. An unconfigured org showing
    // a gap is not a fault, it is a store nobody is managing yet.
    if (!st?.is_active || st.department == null || st.breakeven_roas == null) continue;

    const row: Check = {
      store: org.name as string, ad_account: null,
      spend_db: 0, spend_api: 0, spend_gap_pct: null,
      revenue_db: 0, revenue_api: 0, revenue_gap_pct: null,
      problem: null,
    };

    try {
      const client = new PinterestClient(decrypt(org.pinterest_access_token_encrypted as string));
      const settings = (org.settings ?? {}) as Record<string, unknown>;
      const { chosen: acct, all } = await selectAdAccount(
        client, org.name as string,
        (settings.pinterest_ad_account_id as string | undefined) ?? null
      );
      if (!acct) { row.problem = "no ad account resolved"; checks.push(row); continue; }
      row.ad_account = acct.name;

      // An unpinned store whose token can see several accounts is one
      // rename away from silently reporting the wrong one. That is how
      // Joseph Violet and Kate & Wendy sat at zero for months.
      if (!settings.pinterest_ad_account_id && all.length > 1) {
        row.problem = `${all.length} ad accounts visible and none pinned — matched "${acct.name}" by name`;
      }

      const attr = attributionToDays(st.attribution_setting ?? DEFAULT_ATTRIBUTION_SETTING);
      const resp = await client.getAdAccountAnalytics(acct.id, startISO, endISO, {
        granularity: "TOTAL",
        clickWindowDays: attr.click,
        viewWindowDays: attr.view,
        columns: COLS,
        // The same setting the snapshot cron uses, and the one Campaign
        // Manager renders. If these ever drift apart this check becomes
        // meaningless, which is why it is stated here rather than left to
        // a default.
        conversionReportTime: "TIME_OF_CONVERSION",
      });
      const m = (Array.isArray(resp) ? resp[0] : {}) as Record<string, number>;
      row.spend_api = Number(m.SPEND_IN_DOLLAR ?? 0);
      row.revenue_api = Number(m.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR ?? 0) / 1e6;

      const { data: stored } = await admin
        .from("pinterest_metrics_snapshots")
        .select("spend, revenue")
        .eq("org_id", org.id as string)
        .eq("entity_type", "account")
        .gte("snapshot_date", startISO)
        .lte("snapshot_date", endISO);
      for (const s of stored ?? []) {
        row.spend_db += Number(s.spend ?? 0);
        row.revenue_db += Number(s.revenue ?? 0);
      }

      row.spend_gap_pct = pct(row.spend_db, row.spend_api);
      row.revenue_gap_pct = pct(row.revenue_db, row.revenue_api);

      if (row.spend_api >= MIN_MATERIAL_SPEND || row.spend_db >= MIN_MATERIAL_SPEND) {
        const sBad = row.spend_gap_pct === null || Math.abs(row.spend_gap_pct) > SPEND_TOLERANCE_PCT;
        const rBad = row.revenue_gap_pct === null || Math.abs(row.revenue_gap_pct) > REVENUE_TOLERANCE_PCT;
        if (sBad || rBad) {
          const parts: string[] = [];
          if (sBad) parts.push(`spend ${row.spend_gap_pct ?? "n/a"}%`);
          if (rBad) parts.push(`revenue ${row.revenue_gap_pct ?? "n/a"}%`);
          row.problem = [row.problem, `out of line: ${parts.join(", ")}`]
            .filter(Boolean).join(" · ");
        }
      }
    } catch (e) {
      row.problem = `check failed: ${(e as Error).message.slice(0, 120)}`;
    }
    checks.push(row);
  }

  const problems = checks.filter((c) => c.problem);
  // Worst first, so the Slack line names the store that matters.
  problems.sort((a, b) =>
    Math.abs(b.revenue_gap_pct ?? 999) - Math.abs(a.revenue_gap_pct ?? 999));

  if (problems.length > 0) {
    const top = problems.slice(0, 5)
      .map((p) => `${p.store}: ${p.problem}`).join(" | ");
    await alertCronFailure({
      cron: "verify-metrics",
      level: "attention",
      message:
        `${problems.length} of ${checks.length} stores disagree with Pinterest ` +
        `for ${startISO}..${endISO}. ${top}` +
        (problems.length > 5 ? ` (+${problems.length - 5} more)` : ""),
    });
  }

  return NextResponse.json({
    ok: problems.length === 0,
    window: { start: startISO, end: endISO },
    checked: checks.length,
    problems: problems.length,
    tolerance: { spend_pct: SPEND_TOLERANCE_PCT, revenue_pct: REVENUE_TOLERANCE_PCT },
    stores: checks,
  });
}
