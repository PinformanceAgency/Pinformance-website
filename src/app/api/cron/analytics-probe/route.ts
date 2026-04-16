import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

// Probe to find which Pinterest API approach returns organic conversion data
// matching Pinterest's Conversion Insights numbers
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) {
    const q = request.nextUrl.searchParams.get("secret");
    if (q !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing ?slug" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, name, pinterest_access_token_encrypted")
    .eq("slug", slug)
    .single();

  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "Org not found or no token" }, { status: 404 });
  }

  const token = decrypt(org.pinterest_access_token_encrypted);
  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const results: Record<string, unknown> = {
    org: org.name,
    date_range: { start, end },
    pinterest_reference: "€257 revenue, 112 page visits, 18 ATC, 4 checkouts (30d, 30-click/1-view)",
  };

  const headers = { Authorization: `Bearer ${token}` };
  const CONV_COLS = "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_VIEW_ADD_TO_CART,TOTAL_VIEW_CHECKOUT,TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";

  // Get ad accounts
  const adRes = await fetch("https://api.pinterest.com/v5/ad_accounts", { headers });
  if (!adRes.ok) {
    results.error = await adRes.text();
    return NextResponse.json(results);
  }
  const adAccounts = (await adRes.json())?.items || [];

  for (const account of adAccounts) {
    const adId = account.id;
    const adName = account.name;
    const accountResults: Record<string, unknown> = {};

    // ===== TEST 1: Account-level TOTAL_ columns (30-click/1-view) =====
    try {
      const params = new URLSearchParams({
        start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
        click_window_days: "30", view_window_days: "1", conversion_report_time: "TIME_OF_CONVERSION",
      });
      const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
      const body = res.ok ? await res.json() : null;
      if (Array.isArray(body)) {
        let pv = 0, atc = 0, co = 0, rev = 0;
        for (const d of body) {
          pv += d.TOTAL_PAGE_VISIT || 0;
          atc += (d.TOTAL_CLICK_ADD_TO_CART || 0) + (d.TOTAL_VIEW_ADD_TO_CART || 0);
          co += (d.TOTAL_CLICK_CHECKOUT || 0) + (d.TOTAL_VIEW_CHECKOUT || 0);
          rev += ((d.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (d.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000;
        }
        accountResults.test1_account_total = { page_visits: pv, atc, checkouts: co, revenue: `€${rev.toFixed(2)}`, days: body.length };
      }
    } catch (e) { accountResults.test1_error = String(e); }

    // ===== TEST 2: List campaigns, get their IDs, sum paid =====
    try {
      const campListRes = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/campaigns`, { headers });
      if (campListRes.ok) {
        const campList = await campListRes.json();
        const campaigns = campList?.items || [];
        accountResults.campaigns_count = campaigns.length;

        if (campaigns.length > 0) {
          const campIds = campaigns.map((c: Record<string, string>) => c.id).join(",");
          const params = new URLSearchParams({
            start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
            campaign_ids: campIds,
            click_window_days: "30", view_window_days: "1", conversion_report_time: "TIME_OF_CONVERSION",
          });
          const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/campaigns/analytics?${params}`, { headers });
          const body = res.ok ? await res.json() : await res.text();
          if (Array.isArray(body)) {
            let pv = 0, atc = 0, co = 0, rev = 0;
            for (const d of body) {
              pv += d.TOTAL_PAGE_VISIT || 0;
              atc += (d.TOTAL_CLICK_ADD_TO_CART || 0) + (d.TOTAL_VIEW_ADD_TO_CART || 0);
              co += (d.TOTAL_CLICK_CHECKOUT || 0) + (d.TOTAL_VIEW_CHECKOUT || 0);
              rev += ((d.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (d.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000;
            }
            accountResults.test2_campaigns_paid = { page_visits: pv, atc, checkouts: co, revenue: `€${rev.toFixed(2)}`, rows: body.length };
          } else {
            accountResults.test2_campaigns_error = body;
          }
        }
      }
    } catch (e) { accountResults.test2_error = String(e); }

    // ===== TEST 3: Organic = Total - Paid =====
    const total = accountResults.test1_account_total as Record<string, number> | undefined;
    const paid = accountResults.test2_campaigns_paid as Record<string, number> | undefined;
    if (total && paid) {
      accountResults.test3_organic_estimate = {
        page_visits: total.page_visits - paid.page_visits,
        atc: total.atc - paid.atc,
        checkouts: total.checkouts - paid.checkouts,
        revenue: `€${(parseFloat(String(total.revenue).replace("€","")) - parseFloat(String(paid.revenue).replace("€",""))).toFixed(2)}`,
      };
    }

    // ===== TEST 4: TOTAL_CHECKOUT (non-click/view split) + TOTAL_WEB_ columns =====
    try {
      const altCols = "TOTAL_CHECKOUT,TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_PAGE_VISIT,TOTAL_WEB_SESSIONS,TOTAL_WEB_CHECKOUT,TOTAL_WEB_CHECKOUT_VALUE_IN_MICRO_DOLLAR";
      const params = new URLSearchParams({
        start_date: start, end_date: end, granularity: "DAY", columns: altCols,
        click_window_days: "30", view_window_days: "1", conversion_report_time: "TIME_OF_CONVERSION",
      });
      const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
      const body = res.ok ? await res.json() : null;
      if (Array.isArray(body)) {
        let pv = 0, co = 0, rev = 0, ws = 0, wco = 0, wrev = 0;
        for (const d of body) {
          pv += d.TOTAL_PAGE_VISIT || 0;
          co += d.TOTAL_CHECKOUT || 0;
          rev += (d.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1000000;
          ws += d.TOTAL_WEB_SESSIONS || 0;
          wco += d.TOTAL_WEB_CHECKOUT || 0;
          wrev += (d.TOTAL_WEB_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1000000;
        }
        accountResults.test4_alt_columns = {
          total_page_visit: pv, total_checkout: co, total_revenue: `€${rev.toFixed(2)}`,
          web_sessions: ws, web_checkout: wco, web_revenue: `€${wrev.toFixed(2)}`,
        };
      }
    } catch (e) { accountResults.test4_error = String(e); }

    // ===== TEST 5: Engagement-attributed conversions =====
    try {
      const engCols = "TOTAL_ENGAGEMENT_CHECKOUT,TOTAL_ENGAGEMENT_CHECKOUT_VALUE_IN_MICRO_DOLLAR";
      const params = new URLSearchParams({
        start_date: start, end_date: end, granularity: "DAY", columns: engCols,
        click_window_days: "30", view_window_days: "1", conversion_report_time: "TIME_OF_CONVERSION",
      });
      const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
      const body = res.ok ? await res.json() : null;
      if (Array.isArray(body)) {
        let co = 0, rev = 0;
        for (const d of body) {
          co += d.TOTAL_ENGAGEMENT_CHECKOUT || 0;
          rev += (d.TOTAL_ENGAGEMENT_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1000000;
        }
        accountResults.test5_engagement_attributed = { checkouts: co, revenue: `€${rev.toFixed(2)}` };
      }
    } catch (e) { accountResults.test5_error = String(e); }

    // ===== TEST 6: Try conversion_insights endpoint =====
    try {
      const paths = [
        `/v5/ad_accounts/${adId}/conversion_insights`,
        `/v5/ad_accounts/${adId}/organic_metrics`,
        `/v5/ad_accounts/${adId}/reports`,
      ];
      const endpointResults: Record<string, unknown> = {};
      for (const path of paths) {
        const params = new URLSearchParams({ start_date: start, end_date: end });
        const res = await fetch(`https://api.pinterest.com${path}?${params}`, { headers });
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
        endpointResults[path] = { status: res.status, body };
      }
      accountResults.test6_other_endpoints = endpointResults;
    } catch (e) { accountResults.test6_error = String(e); }

    results[`ad_account_${adName}`] = accountResults;
  }

  return NextResponse.json(results);
}
