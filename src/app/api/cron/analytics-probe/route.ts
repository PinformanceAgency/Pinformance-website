import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

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
  const adId = "549768916219"; // FitCherries ad account

  const results: Record<string, unknown> = {
    org: org.name,
    target: "€257 revenue, 112 page visits, 18 ATC, 4 checkouts (organic, 30d, 30click/1view)",
  };

  const headers = { Authorization: `Bearer ${token}` };

  // ===== BATCH 1: Pinterest v3 partner/advertiser endpoints =====
  const v3Endpoints = [
    `/v3/partners/analytics/conversion_insights/?advertiser_id=${adId}&start_date=${start}&end_date=${end}&content_type=organic&aggregation=last30d`,
    `/v3/partners/analytics/overall/?advertiser_id=${adId}&start_date=${start}&end_date=${end}&content_type=organic`,
    `/v3/partners/analytics/conversions/?advertiser_id=${adId}&start_date=${start}&end_date=${end}&content_type=organic`,
    `/v3/advertisers/${adId}/conversion_insights/?start_date=${start}&end_date=${end}&content_type=organic`,
    `/v3/advertisers/${adId}/analytics/?start_date=${start}&end_date=${end}&content_type=organic`,
    `/v3/advertisers/${adId}/analytics/conversions/?start_date=${start}&end_date=${end}&content_type=organic`,
    `/v3/advertisers/${adId}/organic_conversions/?start_date=${start}&end_date=${end}`,
  ];

  for (const path of v3Endpoints) {
    try {
      const res = await fetch(`https://api.pinterest.com${path}`, { headers });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
      const name = path.split("?")[0].replace(/\//g, "_").replace(new RegExp(adId, "g"), "ID");
      results[`v3${name}`] = { status: res.status, body: typeof body === "object" ? JSON.stringify(body).slice(0, 400) : body };
    } catch (e) { /* skip */ }
  }

  // ===== BATCH 2: Pinterest v5 hidden/undocumented endpoints =====
  const v5Endpoints = [
    `/v5/ad_accounts/${adId}/organic/analytics?start_date=${start}&end_date=${end}&granularity=DAY&columns=TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR`,
    `/v5/ad_accounts/${adId}/conversion_insights?start_date=${start}&end_date=${end}&content_type=organic&conversion_window=30d_click_1d_view`,
    `/v5/ad_accounts/${adId}/analytics/organic?start_date=${start}&end_date=${end}&granularity=DAY&columns=TOTAL_PAGE_VISIT,TOTAL_CLICK_CHECKOUT`,
    `/v5/ad_accounts/${adId}/organic_conversions?start_date=${start}&end_date=${end}&granularity=DAY`,
    `/v5/user_account/conversion_insights?start_date=${start}&end_date=${end}&content_type=organic`,
    `/v5/user_account/analytics/conversions?start_date=${start}&end_date=${end}&content_type=ORGANIC`,
    `/v5/analytics/conversion_insights?advertiser_id=${adId}&start_date=${start}&end_date=${end}&content_type=organic`,
  ];

  for (const path of v5Endpoints) {
    try {
      const res = await fetch(`https://api.pinterest.com${path}`, { headers });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
      const name = path.split("?")[0].replace(/\//g, "_").replace(new RegExp(adId, "g"), "ID");
      results[`v5${name}`] = { status: res.status, body: typeof body === "object" ? JSON.stringify(body).slice(0, 400) : body };
    } catch (e) { /* skip */ }
  }

  // ===== BATCH 3: Pinterest Resource API (what the web app uses) =====
  const resourceEndpoints = [
    `https://www.pinterest.com/resource/AnalyticsConversionInsightsResource/get/?data={"options":{"advertiser_id":"${adId}","start_date":"${start}","end_date":"${end}","content_type":"organic","conversion_window":"30d_click_1d_view"}}`,
    `https://www.pinterest.com/resource/ConversionInsightsResource/get/?data={"options":{"advertiser_id":"${adId}","start_date":"${start}","end_date":"${end}","content_type":"organic"}}`,
    `https://www.pinterest.com/resource/PartnerAnalyticsResource/get/?data={"options":{"advertiser_id":"${adId}","start_date":"${start}","end_date":"${end}"}}`,
  ];

  for (const url of resourceEndpoints) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      const name = url.split("/resource/")[1]?.split("/")[0] || "unknown";
      results[`resource_${name}`] = {
        status: res.status,
        body: text.slice(0, 400),
        content_type: res.headers.get("content-type"),
      };
    } catch (e) { /* skip */ }
  }

  // ===== BATCH 4: Try async report with filters =====
  try {
    const reportBody = {
      start_date: start,
      end_date: end,
      granularity: "DAY",
      columns: ["TOTAL_PAGE_VISIT", "TOTAL_CLICK_ADD_TO_CART", "TOTAL_CLICK_CHECKOUT", "TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR", "TOTAL_VIEW_ADD_TO_CART", "TOTAL_VIEW_CHECKOUT", "TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR"],
      click_window_days: 30,
      view_window_days: 1,
      conversion_report_time: "TIME_OF_CONVERSION",
      level: "ADVERTISER",
      report_format: "JSON",
      // Try adding filters for organic
      filters: [
        { field: "CONTENT_TYPE", operator: "=", values: ["ORGANIC"] },
      ],
    };
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/reports`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(reportBody),
    });
    results.report_with_filter = { status: res.status, body: res.ok ? await res.json() : (await res.text()).slice(0, 400) };
  } catch (e) { results.report_with_filter_error = String(e); }

  // ===== BATCH 5: Try report with entity_fields filter =====
  try {
    const reportBody = {
      start_date: start,
      end_date: end,
      granularity: "DAY",
      columns: ["TOTAL_PAGE_VISIT", "TOTAL_CLICK_ADD_TO_CART", "TOTAL_CLICK_CHECKOUT", "TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR"],
      click_window_days: 30,
      view_window_days: 1,
      conversion_report_time: "TIME_OF_CONVERSION",
      level: "PIN_PROMOTION",
      report_format: "JSON",
      // No campaign/ad group filters = organic only?
      entity_fields: ["PIN_PROMOTION_ID"],
    };
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/reports`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(reportBody),
    });
    results.report_pin_level = { status: res.status, body: res.ok ? await res.json() : (await res.text()).slice(0, 400) };
  } catch (e) { results.report_pin_level_error = String(e); }

  // ===== BATCH 6: Outbound clicks from organic user_account analytics (closest proxy) =====
  try {
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      metric_types: "OUTBOUND_CLICK,IMPRESSION,SAVE,ENGAGEMENT",
      content_type: "ORGANIC",
    });
    const res = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${params}`, { headers });
    if (res.ok) {
      const body = await res.json();
      const daily = body?.all?.daily_metrics || [];
      let totalOutbound = 0;
      for (const d of daily) {
        if (d.data_status === "READY" && d.metrics) {
          totalOutbound += d.metrics.OUTBOUND_CLICK || 0;
        }
      }
      results.organic_outbound_clicks_30d = { total: totalOutbound, days: daily.length, note: "This is the closest proxy for organic page visits" };
    }
  } catch (e) { results.organic_outbound_error = String(e); }

  return NextResponse.json(results);
}
