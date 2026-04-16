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
    .select("id, slug, name, pinterest_access_token_encrypted, pinterest_user_id")
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
    pinterest_user_id: org.pinterest_user_id,
    date_range: { start, end },
  };

  // ===== TEST 1: GraphQL with OAuth Bearer token =====
  // This is the query Pinterest's web UI uses for top conversion pins
  const topConversionPinsHash = "8f5b2a4aaff21d586877d949973d8cc468082d161d81bb337928c63e3274d27a";

  // Try with OAuth Bearer token
  try {
    const graphqlPayload = {
      options: {
        source_url: `/conversion-insights/`,
        data: {
          request: {
            name: "v3AnalyticsTopConversionPinsGraphqlQuery",
            options: {
              user: org.pinterest_user_id,
              paid: "2",         // 2 = organic only (from DevTools observation)
              inProfile: "2",
              fromOwnedContent: "2",
              appTypes: "all",
              startDate: start,
              endDate: end,
              metricType: "totalPurchases",
              clickWindowDays: "30",
              viewWindowDays: "1",
            },
          },
        },
      },
    };

    // Approach A: GraphQL endpoint with Bearer token
    const gqlRes = await fetch("https://www.pinterest.com/graphql/", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        queryHash: topConversionPinsHash,
        queryName: "v3AnalyticsTopConversionPinsGraphqlQuery",
        variables: {
          user: org.pinterest_user_id,
          paid: "2",
          inProfile: "2",
          fromOwnedContent: "2",
          appTypes: "all",
          startDate: start,
          endDate: end,
          metricType: "totalPurchases",
          clickWindowDays: "30",
          viewWindowDays: "1",
        },
      }),
    });
    const gqlText = await gqlRes.text();
    results["graphql_bearer_token"] = {
      status: gqlRes.status,
      content_type: gqlRes.headers.get("content-type"),
      body: gqlText.slice(0, 800),
    };
  } catch (e) {
    results["graphql_bearer_error"] = String(e);
  }

  // Approach B: Resource API style (Pinterest web app pattern)
  try {
    const resourceData = {
      options: {
        user: org.pinterest_user_id,
        paid: "2",
        inProfile: "2",
        fromOwnedContent: "2",
        appTypes: "all",
        startDate: start,
        endDate: end,
        metricType: "totalPurchases",
        clickWindowDays: "30",
        viewWindowDays: "1",
      },
    };
    const resourceUrl = `https://www.pinterest.com/resource/v3AnalyticsTopConversionPinsGraphqlQuery/get/?data=${encodeURIComponent(JSON.stringify(resourceData))}`;
    const resRes = await fetch(resourceUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });
    const resText = await resRes.text();
    results["resource_api_bearer"] = {
      status: resRes.status,
      content_type: resRes.headers.get("content-type"),
      body: resText.slice(0, 800),
    };
  } catch (e) {
    results["resource_api_bearer_error"] = String(e);
  }

  // Approach C: Pinterest analytics resource endpoint (legacy pattern)
  try {
    const analyticsData = {
      options: {
        advertiser_id: "",
        start_date: start,
        end_date: end,
        content_type: "organic",
        conversion_window: "30d_click_1d_view",
      },
    };
    const analyticsUrl = `https://www.pinterest.com/resource/AnalyticsConversionInsightsResource/get/?data=${encodeURIComponent(JSON.stringify(analyticsData))}`;
    const aRes = await fetch(analyticsUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });
    const aText = await aRes.text();
    results["conversion_insights_resource"] = {
      status: aRes.status,
      content_type: aRes.headers.get("content-type"),
      body: aText.slice(0, 800),
    };
  } catch (e) {
    results["conversion_insights_resource_error"] = String(e);
  }

  // ===== TEST 2: Try the v3 partner analytics endpoints that may have conversion data =====
  // These were discovered from Pinterest's internal API patterns
  const v3Tests = [
    // Conversion insights summary (aggregate)
    `https://api.pinterest.com/v3/users/${org.pinterest_user_id}/analytics/conversion_insights/?start_date=${start}&end_date=${end}&paid=2&in_profile=2&from_owned_content=2&click_window_days=30&view_window_days=1`,
    // User-level conversion insights
    `https://api.pinterest.com/v3/users/me/analytics/conversion_insights/?start_date=${start}&end_date=${end}&paid=2&in_profile=2&from_owned_content=2&click_window_days=30&view_window_days=1`,
    // V3 analytics with organic filter
    `https://api.pinterest.com/v3/users/me/analytics/?start_date=${start}&end_date=${end}&paid=2&in_profile=2&from_owned_content=2`,
  ];

  for (const url of v3Tests) {
    try {
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const text = await res.text();
      const name = url.split("pinterest.com")[1]?.split("?")[0]?.replace(/\//g, "_") || "unknown";
      results[`v3_${name}`] = {
        status: res.status,
        body: text.slice(0, 500),
      };
    } catch (e) { /* skip */ }
  }

  // ===== TEST 3: Try v5 user_account with conversion columns =====
  // The v5 user_account/analytics supports metric_types — try if conversion metrics are available
  const conversionMetricTests = [
    "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT",
    "PAGE_VISIT,ADD_TO_CART,CHECKOUT",
    "CONVERSION_PAGE_VISIT,CONVERSION_ADD_TO_CART,CONVERSION_CHECKOUT",
  ];

  for (const metrics of conversionMetricTests) {
    try {
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        metric_types: metrics,
        content_type: "ORGANIC",
      });
      const res = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${params}`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const text = await res.text();
      results[`v5_user_conv_${metrics.split(",")[0]}`] = {
        status: res.status,
        body: text.slice(0, 500),
      };
    } catch (e) { /* skip */ }
  }

  // ===== TEST 4: Pinterest web API with different header patterns =====
  // Pinterest web app uses specific headers (x-pinterest-source, x-app-version, etc.)
  try {
    const webHeaders = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "x-pinterest-source": "www",
      "x-pinterest-pws-handler": "www/graphql.js",
      "x-app-version": "default",
      "Referer": "https://www.pinterest.com/conversion-insights/",
      "Origin": "https://www.pinterest.com",
    };

    const gqlRes = await fetch("https://www.pinterest.com/graphql/", {
      method: "POST",
      headers: webHeaders,
      body: JSON.stringify({
        queryHash: topConversionPinsHash,
        queryName: "v3AnalyticsTopConversionPinsGraphqlQuery",
        variables: {
          user: org.pinterest_user_id,
          paid: "2",
          inProfile: "2",
          fromOwnedContent: "2",
          appTypes: "all",
          startDate: start,
          endDate: end,
          metricType: "totalPurchases",
          clickWindowDays: "30",
          viewWindowDays: "1",
        },
      }),
    });
    const text = await gqlRes.text();
    results["graphql_web_headers"] = {
      status: gqlRes.status,
      content_type: gqlRes.headers.get("content-type"),
      body: text.slice(0, 800),
    };
  } catch (e) {
    results["graphql_web_headers_error"] = String(e);
  }

  // ===== TEST 5: Pinterest Resource API with source_url (how the SPA loads data) =====
  try {
    const sourceUrl = `/conversion-insights/?startDate=${start}&endDate=${end}`;
    const resourceUrl = `https://www.pinterest.com/resource/ConversionInsightsResource/get/?source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify({ options: { paid: "2", fromOwnedContent: "2", clickWindowDays: "30", viewWindowDays: "1" } }))}`;
    const res = await fetch(resourceUrl, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "x-pinterest-source": "www",
      },
    });
    const text = await res.text();
    results["resource_conversion_insights_v2"] = {
      status: res.status,
      content_type: res.headers.get("content-type"),
      body: text.slice(0, 800),
    };
  } catch (e) {
    results["resource_conversion_insights_v2_error"] = String(e);
  }

  return NextResponse.json(results);
}
