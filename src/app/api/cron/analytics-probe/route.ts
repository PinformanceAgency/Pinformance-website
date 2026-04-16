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

  const results: Record<string, unknown> = {
    org: org.name,
    date_range: { start, end },
    target: "€257 revenue, 112 page visits, 18 ATC, 4 checkouts",
  };

  const headers = { Authorization: `Bearer ${token}` };
  const CONV_COLS = "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_VIEW_ADD_TO_CART,TOTAL_VIEW_CHECKOUT,TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";

  // Get ad accounts
  const adRes = await fetch("https://api.pinterest.com/v5/ad_accounts", { headers });
  if (!adRes.ok) { results.error = await adRes.text(); return NextResponse.json(results); }
  const adAccounts = (await adRes.json())?.items || [];

  // Use FitCherries ad account (the one with data)
  const mainAccount = adAccounts.find((a: Record<string, string>) => a.name === "FitCherries") || adAccounts[0];
  if (!mainAccount) { results.error = "No ad account"; return NextResponse.json(results); }
  const adId = mainAccount.id;
  results.ad_account = { id: adId, name: mainAccount.name };

  const sumDays = (body: Record<string, number>[]) => {
    let pv = 0, atc = 0, co = 0, rev = 0;
    for (const d of body) {
      pv += d.TOTAL_PAGE_VISIT || 0;
      atc += (d.TOTAL_CLICK_ADD_TO_CART || 0) + (d.TOTAL_VIEW_ADD_TO_CART || 0);
      co += (d.TOTAL_CLICK_CHECKOUT || 0) + (d.TOTAL_VIEW_CHECKOUT || 0);
      rev += ((d.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0) + (d.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR || 0)) / 1000000;
    }
    return { page_visits: pv, atc, checkouts: co, revenue: `€${rev.toFixed(2)}` };
  };

  // ===== TEST A: ad_accounts analytics + content_type=ORGANIC =====
  try {
    const params = new URLSearchParams({
      start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
      click_window_days: "30", view_window_days: "1",
      conversion_report_time: "TIME_OF_CONVERSION",
      content_type: "ORGANIC",
    });
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
    if (res.ok) {
      const body = await res.json();
      results.testA_organic_filter = Array.isArray(body) ? { ...sumDays(body), days: body.length } : body;
    } else {
      results.testA_organic_filter = { status: res.status, error: await res.text() };
    }
  } catch (e) { results.testA_error = String(e); }

  // ===== TEST B: ad_accounts analytics + content_type=organic (lowercase) =====
  try {
    const params = new URLSearchParams({
      start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
      click_window_days: "30", view_window_days: "1",
      conversion_report_time: "TIME_OF_CONVERSION",
      content_type: "organic",
    });
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
    if (res.ok) {
      const body = await res.json();
      results.testB_organic_lowercase = Array.isArray(body) ? { ...sumDays(body), days: body.length } : body;
    } else {
      results.testB_organic_lowercase = { status: res.status, error: await res.text() };
    }
  } catch (e) { results.testB_error = String(e); }

  // ===== TEST C: ad_accounts analytics + attribution_types parameter =====
  for (const attrType of ["INDIVIDUAL", "HOUSEHOLD", "ORGANIC"]) {
    try {
      const params = new URLSearchParams({
        start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
        click_window_days: "30", view_window_days: "1",
        conversion_report_time: "TIME_OF_CONVERSION",
        attribution_types: attrType,
      });
      const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
      if (res.ok) {
        const body = await res.json();
        results[`testC_attr_${attrType}`] = Array.isArray(body) ? { ...sumDays(body), days: body.length } : body;
      } else {
        results[`testC_attr_${attrType}`] = { status: res.status, error: (await res.text()).slice(0, 200) };
      }
    } catch (e) { results[`testC_attr_${attrType}_error`] = String(e); }
  }

  // ===== TEST D: Async reports API with organic filter =====
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
    };
    const reportRes = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/reports`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(reportBody),
    });
    const reportData = reportRes.ok ? await reportRes.json() : await reportRes.text();
    results.testD_async_report = { status: reportRes.status, body: reportData };

    // If report was created, try to get it
    if (reportRes.ok && typeof reportData === "object" && reportData.token) {
      // Wait a moment for report to generate
      await new Promise(r => setTimeout(r, 3000));
      const getRes = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/reports?token=${reportData.token}`, { headers });
      results.testD_report_result = { status: getRes.status, body: getRes.ok ? await getRes.json() : await getRes.text() };
    }
  } catch (e) { results.testD_error = String(e); }

  // ===== TEST E: conversion_tags endpoint (to see what tags exist) =====
  try {
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/conversion_tags`, { headers });
    results.testE_conversion_tags = { status: res.status, body: res.ok ? await res.json() : (await res.text()).slice(0, 300) };
  } catch (e) { results.testE_error = String(e); }

  // ===== TEST F: conversion_events endpoint =====
  try {
    const paths = [
      `/v5/ad_accounts/${adId}/conversion_tags/events`,
      `/v5/ad_accounts/${adId}/events`,
      `/v5/ad_accounts/${adId}/conversion_events`,
    ];
    for (const path of paths) {
      const res = await fetch(`https://api.pinterest.com${path}?start_date=${start}&end_date=${end}`, { headers });
      results[`testF_${path.split("/").pop()}`] = { status: res.status, body: res.ok ? await res.json() : (await res.text()).slice(0, 200) };
    }
  } catch (e) { results.testF_error = String(e); }

  // ===== TEST G: Try the analytics.pinterest.com internal API pattern =====
  // From screenshot URL: analytics.pinterest.com/conversion-insights/?advertiserid=549768916219&aggregation=last30d&content_type=all&conversion_source=ALL
  try {
    const internalPaths = [
      `https://analytics.pinterest.com/api/v2/conversion-insights/?advertiser_id=${adId}&aggregation=last30d&content_type=organic&conversion_source=ALL`,
      `https://api.pinterest.com/v5/analytics/conversion_insights?advertiser_id=${adId}&aggregation=last30d&content_type=organic`,
      `https://api.pinterest.com/v3/conversion_insights/?advertiser_id=${adId}&start_date=${start}&end_date=${end}&content_type=organic`,
    ];
    for (const url of internalPaths) {
      const res = await fetch(url, { headers });
      const name = new URL(url).pathname.replace(/\//g, "_");
      results[`testG${name}`] = { status: res.status, body: (await res.text()).slice(0, 300) };
    }
  } catch (e) { results.testG_error = String(e); }

  // ===== TEST H: No conversion window (default) - maybe matches? =====
  try {
    const params = new URLSearchParams({
      start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
    });
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
    if (res.ok) {
      const body = await res.json();
      results.testH_no_window = Array.isArray(body) ? { ...sumDays(body), days: body.length } : body;
    } else {
      results.testH_no_window = { status: res.status, error: (await res.text()).slice(0, 200) };
    }
  } catch (e) { results.testH_error = String(e); }

  // ===== BASELINE: Account total (for comparison) =====
  try {
    const params = new URLSearchParams({
      start_date: start, end_date: end, granularity: "DAY", columns: CONV_COLS,
      click_window_days: "30", view_window_days: "1", conversion_report_time: "TIME_OF_CONVERSION",
    });
    const res = await fetch(`https://api.pinterest.com/v5/ad_accounts/${adId}/analytics?${params}`, { headers });
    if (res.ok) {
      const body = await res.json();
      results.baseline_total = Array.isArray(body) ? { ...sumDays(body), days: body.length } : body;
    }
  } catch (e) { results.baseline_error = String(e); }

  return NextResponse.json(results);
}
