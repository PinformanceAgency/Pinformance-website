import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  ad_group_id: string | null;
  campaign_id: string | null;
  status: string | null;
  created_at: string | null;
  image_url: string | null;
  spend: number | null;
  revenue: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  roas: number | null;
  cpa: number | null;
}

const MAX_ADS_TO_FETCH = 500;
const MAX_PIN_DETAILS = 50;

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

  const days = Math.min(parseInt(request.nextUrl.searchParams.get("days") || "30"), 90);
  const end = new Date();
  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().split("T")[0];
  const startDate = start.toISOString().split("T")[0];

  // Conversion attribution settings. Default to 30-day click / 1-day view +
  // TIME_OF_CONVERSION to match Pinterest Campaign Manager defaults.
  const allowedWindows = new Set([1, 7, 14, 30, 60]);
  const clickWindowParam = parseInt(request.nextUrl.searchParams.get("click_window") || "30");
  const viewWindowParam = parseInt(request.nextUrl.searchParams.get("view_window") || "1");
  const clickWindow = (allowedWindows.has(clickWindowParam) ? clickWindowParam : 30) as
    | 1
    | 7
    | 14
    | 30
    | 60;
  const viewWindow = (allowedWindows.has(viewWindowParam) ? viewWindowParam : 1) as
    | 1
    | 7
    | 14
    | 30
    | 60;
  const conversionReportTime =
    request.nextUrl.searchParams.get("report_time") === "TIME_OF_AD_ACTION"
      ? "TIME_OF_AD_ACTION"
      : "TIME_OF_CONVERSION";

  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({
      ads: [],
      ads_connected: false,
      reason: "no_token",
    });
  }

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial = ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const adAccounts = await client.getAdAccounts();
    const adAccount = adAccounts.items?.[0];
    if (!adAccount?.id) {
      return NextResponse.json({
        ads: [],
        ads_connected: false,
        reason: "no_ad_account",
      });
    }

    // 1. List ads (paginate up to MAX_ADS_TO_FETCH).
    const adList: Array<{
      id: string;
      name?: string;
      pin_id?: string;
      ad_group_id?: string;
      campaign_id?: string;
      status?: string;
      created_time?: number;
    }> = [];
    let bookmark: string | undefined;
    do {
      const page = await client.getAds(adAccount.id, { bookmark, pageSize: 100 });
      adList.push(...(page.items || []));
      bookmark = page.bookmark;
      if (adList.length >= MAX_ADS_TO_FETCH) break;
    } while (bookmark);

    if (adList.length === 0) {
      return NextResponse.json({
        ads: [],
        ads_connected: true,
        ad_account_id: adAccount.id,
        currency: adAccount.currency || "USD",
        reason: "no_ads",
      });
    }

    // 2. Fetch analytics in batches of 100.
    const byAdId = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < adList.length; i += 100) {
      const batch = adList.slice(i, i + 100).map((a) => a.id);
      const analytics = await client.getAdAnalytics(adAccount.id, batch, startDate, endDate, {
        clickWindowDays: clickWindow,
        viewWindowDays: viewWindow,
        conversionReportTime,
      });
      for (const row of analytics || []) {
        const adId = String(row["AD_ID"] ?? "");
        if (adId) byAdId.set(adId, row);
      }
    }

    // 3. Build rows with computed metrics.
    const rows: AdRow[] = adList.map((a) => {
      const m = byAdId.get(a.id) || {};
      const spend = num(m["SPEND_IN_DOLLAR"]);
      const purchases = num(m["TOTAL_CHECKOUT"]);
      const revenueMicro = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]);
      const revenue = revenueMicro != null ? revenueMicro / 1_000_000 : null;
      const impressions = num(m["IMPRESSION_1"]);
      const clicks = num(m["CLICKTHROUGH_1"]);
      const ctr = num(m["CTR"]);
      const cpm = num(m["CPM_IN_DOLLAR"]);
      const cpc = num(m["ECPC_IN_DOLLAR"]);
      let roas = num(m["CHECKOUT_ROAS"]);
      if (roas == null && spend != null && spend > 0 && revenue != null) {
        roas = revenue / spend;
      }
      const cpa =
        purchases != null && purchases > 0 && spend != null ? spend / purchases : null;

      return {
        ad_id: a.id,
        ad_name: a.name || `Ad ${a.id.slice(-6)}`,
        pin_id: a.pin_id || null,
        ad_group_id: a.ad_group_id || null,
        campaign_id: a.campaign_id || null,
        status: a.status || null,
        created_at: a.created_time
          ? new Date(a.created_time * 1000).toISOString()
          : null,
        image_url: null,
        spend,
        revenue,
        purchases,
        impressions,
        clicks,
        ctr,
        cpm,
        cpc,
        roas,
        cpa,
      };
    });

    // 4. Enrich top-spending ads with pin image (cap to MAX_PIN_DETAILS).
    const topForImages = [...rows]
      .filter((r) => r.pin_id && r.spend != null && r.spend > 0)
      .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
      .slice(0, MAX_PIN_DETAILS);

    const imageByPin = new Map<string, string>();
    await Promise.all(
      topForImages.map(async (r) => {
        if (!r.pin_id) return;
        try {
          const pin = await client.getPin(r.pin_id);
          const url =
            pin.media?.images?.["600x"]?.url ||
            pin.media?.images?.["400x300"]?.url ||
            pin.media?.images?.["150x150"]?.url ||
            "";
          if (url) imageByPin.set(r.pin_id, url);
        } catch {
          // pin lookup failed — skip
        }
      })
    );
    for (const r of rows) {
      if (r.pin_id) r.image_url = imageByPin.get(r.pin_id) || null;
    }

    return NextResponse.json({
      ads: rows,
      ads_connected: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      start_date: startDate,
      end_date: endDate,
      click_window_days: clickWindow,
      view_window_days: viewWindow,
      conversion_report_time: conversionReportTime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    return NextResponse.json({
      ads: [],
      ads_connected: false,
      reason: "fetch_failed",
      error: message,
    });
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const parsed = Number(v);
  return isNaN(parsed) ? null : parsed;
}
