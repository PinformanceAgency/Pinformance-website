import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

// Probe Pinterest analytics endpoints — diagnose organic vs paid conversion data
// Call: /api/cron/analytics-probe?slug=fit-cherries  (requires CRON_SECRET header)
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
    .select("id, slug, name, pinterest_access_token_encrypted, pinterest_token_expires_at")
    .eq("slug", slug)
    .single();

  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });
  if (!org.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "No Pinterest token" }, { status: 400 });
  }

  let token: string;
  try {
    token = decrypt(org.pinterest_access_token_encrypted);
  } catch (e) {
    return NextResponse.json({ error: "Decrypt failed", detail: String(e) }, { status: 500 });
  }

  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const results: Record<string, unknown> = {
    org: { id: org.id, slug: org.slug, name: org.name },
    date_range: { start, end },
  };

  // Get all ad accounts
  try {
    const adRes = await fetch("https://api.pinterest.com/v5/ad_accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!adRes.ok) {
      results.error = `ad_accounts returned ${adRes.status}: ${await adRes.text()}`;
      return NextResponse.json(results);
    }
    const adData = await adRes.json();
    const adAccounts = adData?.items || [];

    for (const account of adAccounts) {
      const adId = account.id;
      const adName = account.name;

      const convWindow = {
        click_window_days: "30",
        view_window_days: "1",
        conversion_report_time: "TIME_OF_CONVERSION",
      };

      // Test 1: TOTAL_ columns (current approach)
      const totalCols = "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_VIEW_ADD_TO_CART,TOTAL_VIEW_CHECKOUT,TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";
      const t1Params = new URLSearchParams({ start_date: start, end_date: end, granularity: "DAY", columns: totalCols, ...convWindow });
      const t1Res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${t1Params}`, { headers: { Authorization: `Bearer ${token}` } });
      const t1Body = t1Res.ok ? await t1Res.json() : await t1Res.text();

      // Test 2: WEB_ specific columns (might be web-attributed only)
      const webCols = "TOTAL_WEB_SESSIONS,TOTAL_WEB_CHECKOUT,TOTAL_WEB_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_WEB_CLICK_CHECKOUT,TOTAL_WEB_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_WEB_VIEW_CHECKOUT,TOTAL_WEB_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";
      const t2Params = new URLSearchParams({ start_date: start, end_date: end, granularity: "DAY", columns: webCols, ...convWindow });
      const t2Res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${t2Params}`, { headers: { Authorization: `Bearer ${token}` } });
      const t2Body = t2Res.ok ? await t2Res.json() : await t2Res.text();

      // Test 3: Campaign-level (paid only) to compare
      const campParams = new URLSearchParams({ start_date: start, end_date: end, granularity: "DAY", columns: totalCols, ...convWindow });
      const campRes = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/campaigns/analytics?${campParams}`, { headers: { Authorization: `Bearer ${token}` } });
      const campBody = campRes.ok ? await campRes.json() : await campRes.text();

      // Test 4: Try conversion_insights endpoint
      const ciParams = new URLSearchParams({ start_date: start, end_date: end });
      const ciRes = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/conversion_insights?${ciParams}`, { headers: { Authorization: `Bearer ${token}` } });
      const ciBody = ciRes.ok ? await ciRes.json() : await ciRes.text();

      // Test 5: ORGANIC_* columns (if they exist)
      const orgCols = "TOTAL_PAGE_VISIT,TOTAL_SIGNUP,TOTAL_CHECKOUT,TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_CUSTOM,TOTAL_LEAD,TOTAL_ADD_TO_WISHLIST";
      const t5Params = new URLSearchParams({ start_date: start, end_date: end, granularity: "DAY", columns: orgCols, ...convWindow });
      const t5Res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${t5Params}`, { headers: { Authorization: `Bearer ${token}` } });
      const t5Body = t5Res.ok ? await t5Res.json() : await t5Res.text();

      // Summarize: sum 30 days for comparison with Pinterest UI
      let sum30d = { page_visits: 0, atc: 0, checkouts: 0, revenue: 0 };
      let sumWeb30d = { sessions: 0, checkouts: 0, revenue: 0 };
      let sumAlt30d = { page_visits: 0, checkouts: 0, revenue: 0 };
      let sumCamp30d = { page_visits: 0, atc: 0, checkouts: 0, revenue: 0 };

      if (Array.isArray(t1Body)) {
        for (const d of t1Body) {
          sum30d.page_visits += (d.TOTAL_PAGE_VISIT || 0);
          sum30d.atc += (d.TOTAL_CLICK_ADD_TO_CART || 0) + (d.TOTAL_VIEW_ADD_TO_CART || 0);
          sum30d.checkouts += (d.TOTAL_CLICK_CHECKOUT || 0) + (d.TOTAL_VIEW_CHECKOUT || 0);
          sum30d.revenue += ((d.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (d.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000;
        }
      }
      if (Array.isArray(t2Body)) {
        for (const d of t2Body) {
          sumWeb30d.sessions += (d.TOTAL_WEB_SESSIONS || 0);
          sumWeb30d.checkouts += (d.TOTAL_WEB_CHECKOUT || 0);
          sumWeb30d.revenue += (d.TOTAL_WEB_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1000000;
        }
      }
      if (Array.isArray(t5Body)) {
        for (const d of t5Body) {
          sumAlt30d.page_visits += (d.TOTAL_PAGE_VISIT || 0);
          sumAlt30d.checkouts += (d.TOTAL_CHECKOUT || 0);
          sumAlt30d.revenue += (d.TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) / 1000000;
        }
      }
      if (Array.isArray(campBody)) {
        for (const d of campBody) {
          sumCamp30d.page_visits += (d.TOTAL_PAGE_VISIT || 0);
          sumCamp30d.atc += (d.TOTAL_CLICK_ADD_TO_CART || 0) + (d.TOTAL_VIEW_ADD_TO_CART || 0);
          sumCamp30d.checkouts += (d.TOTAL_CLICK_CHECKOUT || 0) + (d.TOTAL_VIEW_CHECKOUT || 0);
          sumCamp30d.revenue += ((d.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (d.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000;
        }
      }

      results[`ad_account_${adName}`] = {
        id: adId,
        comparison_30d: {
          pinterest_shows: "€257 revenue, 112 page visits, 18 ATC, 4 checkouts",
          total_columns: { ...sum30d, revenue: `€${sum30d.revenue.toFixed(2)}` },
          web_columns: { ...sumWeb30d, revenue: `€${sumWeb30d.revenue.toFixed(2)}` },
          alt_columns: { ...sumAlt30d, revenue: `€${sumAlt30d.revenue.toFixed(2)}` },
          campaign_paid: { ...sumCamp30d, revenue: `€${sumCamp30d.revenue.toFixed(2)}` },
          organic_estimate: {
            page_visits: sum30d.page_visits - sumCamp30d.page_visits,
            atc: sum30d.atc - sumCamp30d.atc,
            checkouts: sum30d.checkouts - sumCamp30d.checkouts,
            revenue: `€${(sum30d.revenue - sumCamp30d.revenue).toFixed(2)}`,
          },
        },
        conversion_insights_endpoint: { status: ciRes.status, body: ciBody },
        web_sample: Array.isArray(t2Body) ? t2Body.slice(0, 2) : t2Body,
        alt_sample: Array.isArray(t5Body) ? t5Body.slice(0, 2) : t5Body,
      };
    }
  } catch (e) {
    results.error = String(e);
  }

  return NextResponse.json(results);
}
