import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 60;

// Probe Pinterest analytics endpoints directly, returning raw responses + status codes
// so we can see exactly why sales_data stays empty.
// Call: /api/debug/analytics-probe?slug=fit-cherries  (requires CRON_SECRET header)
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

  const tokenExpired = org.pinterest_token_expires_at
    ? new Date(org.pinterest_token_expires_at) < new Date()
    : false;

  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const results: Record<string, unknown> = {
    org: { id: org.id, slug: org.slug, name: org.name, token_expired: tokenExpired },
    date_range: { start, end },
  };

  // Probe 1: basic /user_account (sanity: token works?)
  try {
    const r = await fetch("https://api.pinterest.com/v5/user_account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    results.user_account = {
      status: r.status,
      body: r.ok ? await r.json() : await r.text(),
    };
  } catch (e) {
    results.user_account = { error: String(e) };
  }

  // Probe 2: user_account/analytics WITH content_type=ORGANIC
  try {
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      metric_types: "WEB_ADD_TO_CART,WEB_CHECKOUT,WEB_CHECKOUT_VALUE,WEB_SESSIONS",
      content_type: "ORGANIC",
    });
    const r = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    results.analytics_organic = {
      status: r.status,
      body: (() => { try { return JSON.parse(text); } catch { return text; } })(),
    };
  } catch (e) {
    results.analytics_organic = { error: String(e) };
  }

  // Probe 3: user_account/analytics WITHOUT content_type (all traffic)
  try {
    const params = new URLSearchParams({
      start_date: start,
      end_date: end,
      metric_types: "IMPRESSION,PIN_CLICK,SAVE",
    });
    const r = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    results.analytics_basic = {
      status: r.status,
      body: (() => { try { return JSON.parse(text); } catch { return text; } })(),
    };
  } catch (e) {
    results.analytics_basic = { error: String(e) };
  }

  // Probe 4: list ad accounts (conversion insights might require one)
  try {
    const r = await fetch(`https://api.pinterest.com/v5/ad_accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await r.text();
    results.ad_accounts = {
      status: r.status,
      body: (() => { try { return JSON.parse(text); } catch { return text; } })(),
    };
  } catch (e) {
    results.ad_accounts = { error: String(e) };
  }

  // Probe 5: undocumented conversion_insights endpoint variations
  const conversionPaths = [
    "/v5/user_account/analytics/conversion_insights",
    "/v5/user_account/conversion_insights",
    "/v5/user_account/analytics/conversion_metrics",
    "/v5/user_account/analytics/top_pins",
  ];
  for (const p of conversionPaths) {
    try {
      const params = new URLSearchParams({ start_date: start, end_date: end });
      if (p.endsWith("top_pins")) {
        params.set("sort_by", "IMPRESSION");
        params.set("metric_types", "IMPRESSION,OUTBOUND_CLICK,SAVE,PIN_CLICK");
      }
      const r = await fetch(`https://api.pinterest.com${p}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await r.text();
      results[`probe_${p.replace(/\//g, "_")}`] = {
        status: r.status,
        body: (() => {
          try {
            const j = JSON.parse(text);
            if (j?.pins && Array.isArray(j.pins)) return { pin_count: j.pins.length, sample: j.pins.slice(0, 2) };
            return j;
          } catch { return text.slice(0, 500); }
        })(),
      };
    } catch (e) {
      results[`probe_${p.replace(/\//g, "_")}`] = { error: String(e) };
    }
  }

  // Probe 8: per-pin analytics (grab first posted pin with pinterest_pin_id)
  try {
    const { data: samplePin } = await admin
      .from("pins")
      .select("id, pinterest_pin_id, title")
      .eq("org_id", org.id)
      .eq("status", "posted")
      .not("pinterest_pin_id", "is", null)
      .limit(1)
      .single();

    if (samplePin?.pinterest_pin_id) {
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        metric_types: "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK",
      });
      const r = await fetch(`https://api.pinterest.com/v5/pins/${samplePin.pinterest_pin_id}/analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await r.text();
      results.pin_analytics_sample = {
        pin_title: samplePin.title,
        pinterest_pin_id: samplePin.pinterest_pin_id,
        status: r.status,
        body: (() => { try { return JSON.parse(text); } catch { return text.slice(0, 1000); } })(),
      };
    } else {
      results.pin_analytics_sample = { error: "No posted pin with pinterest_pin_id found" };
    }
  } catch (e) {
    results.pin_analytics_sample = { error: String(e) };
  }

  return NextResponse.json(results);
}
