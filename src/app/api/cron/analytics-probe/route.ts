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

  const CONV_COLUMNS = "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_VIEW_ADD_TO_CART,TOTAL_VIEW_CHECKOUT,TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";

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

      // 1) Account-level analytics = TOTAL (organic + paid)
      const totalParams = new URLSearchParams({
        start_date: start,
        end_date: end,
        granularity: "DAY",
        columns: CONV_COLUMNS,
        click_window_days: "30",
        view_window_days: "1",
        conversion_report_time: "TIME_OF_CONVERSION",
      });
      const totalRes = await fetch(
        `https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${totalParams}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const totalBody = totalRes.ok ? await totalRes.json() : await totalRes.text();

      // 2) Campaign-level analytics = PAID only
      const paidParams = new URLSearchParams({
        start_date: start,
        end_date: end,
        granularity: "DAY",
        columns: CONV_COLUMNS,
        click_window_days: "30",
        view_window_days: "1",
        conversion_report_time: "TIME_OF_CONVERSION",
      });
      const paidRes = await fetch(
        `https://api.pinterest.com/v5/ad_accounts/${adId}/campaigns/analytics?${paidParams}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const paidBody = paidRes.ok ? await paidRes.json() : await paidRes.text();

      // 3) Calculate organic = total - paid for a sample day
      let organicSample = null;
      if (Array.isArray(totalBody) && totalBody.length > 0) {
        const sampleDay = totalBody[0];
        const date = sampleDay.DATE;

        // Sum paid across all campaigns for this date
        let paidPageVisits = 0;
        let paidClickATC = 0;
        let paidClickCheckout = 0;
        let paidClickCheckoutValue = 0;
        let paidViewATC = 0;
        let paidViewCheckout = 0;
        let paidViewCheckoutValue = 0;

        if (Array.isArray(paidBody)) {
          for (const campaign of paidBody) {
            if (campaign.DATE === date) {
              paidPageVisits += campaign.TOTAL_PAGE_VISIT || 0;
              paidClickATC += campaign.TOTAL_CLICK_ADD_TO_CART || 0;
              paidClickCheckout += campaign.TOTAL_CLICK_CHECKOUT || 0;
              paidClickCheckoutValue += campaign.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0;
              paidViewATC += campaign.TOTAL_VIEW_ADD_TO_CART || 0;
              paidViewCheckout += campaign.TOTAL_VIEW_CHECKOUT || 0;
              paidViewCheckoutValue += campaign.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0;
            }
          }
        }

        organicSample = {
          date,
          total: {
            page_visits: sampleDay.TOTAL_PAGE_VISIT || 0,
            add_to_cart: (sampleDay.TOTAL_CLICK_ADD_TO_CART || 0) + (sampleDay.TOTAL_VIEW_ADD_TO_CART || 0),
            checkouts: (sampleDay.TOTAL_CLICK_CHECKOUT || 0) + (sampleDay.TOTAL_VIEW_CHECKOUT || 0),
            revenue: ((sampleDay.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (sampleDay.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000,
          },
          paid: {
            page_visits: paidPageVisits,
            add_to_cart: paidClickATC + paidViewATC,
            checkouts: paidClickCheckout + paidViewCheckout,
            revenue: (paidClickCheckoutValue + paidViewCheckoutValue) / 1000000,
          },
          organic: {
            page_visits: (sampleDay.TOTAL_PAGE_VISIT || 0) - paidPageVisits,
            add_to_cart: (sampleDay.TOTAL_CLICK_ADD_TO_CART || 0) + (sampleDay.TOTAL_VIEW_ADD_TO_CART || 0) - paidClickATC - paidViewATC,
            checkouts: (sampleDay.TOTAL_CLICK_CHECKOUT || 0) + (sampleDay.TOTAL_VIEW_CHECKOUT || 0) - paidClickCheckout - paidViewCheckout,
            revenue: ((sampleDay.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (sampleDay.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) - paidClickCheckoutValue - paidViewCheckoutValue) / 1000000,
          },
        };
      }

      results[`ad_account_${adName}`] = {
        id: adId,
        total_status: totalRes.status,
        total_days: Array.isArray(totalBody) ? totalBody.length : 0,
        paid_status: paidRes.status,
        paid_rows: Array.isArray(paidBody) ? paidBody.length : 0,
        paid_sample: Array.isArray(paidBody) ? paidBody.slice(0, 2) : paidBody,
        organic_sample: organicSample,
      };
    }
  } catch (e) {
    results.error = String(e);
  }

  return NextResponse.json(results);
}
