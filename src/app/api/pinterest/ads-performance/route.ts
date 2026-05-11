import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface AdsPerformancePin {
  id: string;
  pinterest_pin_id: string | null;
  title: string;
  image_url: string | null;
  posted_at: string | null;
  created_at: string;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("pinterest_access_token_encrypted, settings")
    .eq("id", orgId)
    .single();

  // Date range
  const days = Math.min(parseInt(request.nextUrl.searchParams.get("days") || "30"), 90);
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().split("T")[0];
  const startDate = start.toISOString().split("T")[0];

  // Pull pins from our DB for this org within (or overlapping) the timeframe.
  const { data: pinRows } = await admin
    .from("pins")
    .select("id, pinterest_pin_id, title, image_url, posted_at, created_at")
    .eq("org_id", orgId)
    .not("pinterest_pin_id", "is", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(50);

  const pins: AdsPerformancePin[] = (pinRows || []).map((p) => ({
    id: p.id as string,
    pinterest_pin_id: (p.pinterest_pin_id as string) || null,
    title: (p.title as string) || "Untitled",
    image_url: (p.image_url as string) || null,
    posted_at: (p.posted_at as string) || null,
    created_at: p.created_at as string,
    spend: null,
    revenue: null,
    purchases: null,
    impressions: null,
    clicks: null,
  }));

  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({
      pins,
      ads_connected: false,
      reason: "no_token",
    });
  }

  // Try to enrich with paid metrics from Pinterest Ads.
  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial = ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const adAccounts = await client.getAdAccounts();
    const adAccountId = adAccounts.items?.[0]?.id;
    if (!adAccountId) {
      return NextResponse.json({
        pins,
        ads_connected: false,
        reason: "no_ad_account",
      });
    }

    const pinIds = pins
      .map((p) => p.pinterest_pin_id)
      .filter((id): id is string => !!id);

    if (pinIds.length === 0) {
      return NextResponse.json({
        pins,
        ads_connected: true,
        ad_account_id: adAccountId,
        reason: "no_promoted_pins",
      });
    }

    const analytics = await client.getAdPinAnalytics(adAccountId, pinIds, startDate, endDate);

    // Pinterest returns one row per pin. Index by PIN_ID.
    const byPin = new Map<string, Record<string, number | string>>();
    for (const row of analytics || []) {
      const pid = String(row["PIN_ID"] ?? "");
      if (pid) byPin.set(pid, row);
    }

    for (const pin of pins) {
      if (!pin.pinterest_pin_id) continue;
      const m = byPin.get(pin.pinterest_pin_id);
      if (!m) continue;
      const spend = num(m["SPEND_IN_DOLLAR"]);
      const purchases = num(m["TOTAL_CHECKOUT"]);
      const revenue = num(m["TOTAL_CHECKOUT_VALUE_IN_DOLLAR"]);
      const impressions = num(m["IMPRESSION_1"]);
      const clicks = num(m["CLICKTHROUGH_1"]);
      pin.spend = spend;
      pin.purchases = purchases;
      pin.revenue = revenue;
      pin.impressions = impressions;
      pin.clicks = clicks;
    }

    return NextResponse.json({
      pins,
      ads_connected: true,
      ad_account_id: adAccountId,
      currency: adAccounts.items[0]?.currency || "USD",
      start_date: startDate,
      end_date: endDate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json({
      pins,
      ads_connected: false,
      reason: "fetch_failed",
      error: message,
    });
  }
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return isNaN(parsed) ? null : parsed;
}
