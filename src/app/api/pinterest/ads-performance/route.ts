import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH, extractPinImageUrl, fetchPinOgImage } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface AdRow {
  ad_id: string;
  ad_name: string;
  pin_id: string | null;
  ad_group_id: string | null;
  campaign_id: string | null;
  status: string | null;
  creative_type: string | null;
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

// Re-export under the old name for backwards compatibility within this
// file; the shared cap is centralized in lib/pinterest/client.
const MAX_ADS_TO_FETCH = MAX_PINTEREST_FETCH;
const MAX_PIN_DETAILS = 120;
const IMAGE_BATCH_SIZE = 15;

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
    .select("name, pinterest_access_token_encrypted, settings")
    .eq("id", orgId)
    .single();

  // Accept either explicit start_date/end_date (YYYY-MM-DD) or a `days` lookback.
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const startParam = request.nextUrl.searchParams.get("start_date");
  const endParam = request.nextUrl.searchParams.get("end_date");
  let startDate: string;
  let endDate: string;
  if (startParam && endParam && dateRe.test(startParam) && dateRe.test(endParam)) {
    startDate = startParam;
    endDate = endParam;
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  } else {
    const days = Math.min(parseInt(request.nextUrl.searchParams.get("days") || "30"), 365);
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    endDate = end.toISOString().split("T")[0];
    startDate = start.toISOString().split("T")[0];
  }

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

    const settings = (org.settings as Record<string, unknown>) || {};
    const preferredAdAccountId =
      typeof settings.pinterest_ad_account_id === "string"
        ? settings.pinterest_ad_account_id
        : null;
    const { chosen: adAccount, all: allAdAccounts } = await selectAdAccount(
      client,
      org.name as string | null,
      preferredAdAccountId
    );
    if (!adAccount?.id) {
      return NextResponse.json({
        ads: [],
        ads_connected: false,
        reason: "no_ad_account",
      });
    }

    // 0. Account-level totals (what Pinterest Campaign Manager shows in the
    //    headline). Summing ad-level analytics doesn't always match these
    //    because Pinterest sometimes attributes conversions at campaign/ad-
    //    group level rather than to a specific ad.
    let accountTotals: {
      spend: number | null;
      revenue: number | null;
      purchases: number | null;
      impressions: number | null;
      clicks: number | null;
      roas: number | null;
      cpa: number | null;
    } | null = null;
    try {
      const accountRows = (await client.getAdAccountAnalytics(adAccount.id, startDate, endDate, {
        clickWindowDays: clickWindow,
        viewWindowDays: viewWindow,
        conversionReportTime,
      })) as Array<Record<string, number | string>>;
      const t = accountRows?.[0] || {};
      const aSpend = num(t["SPEND_IN_DOLLAR"]);
      const aPurchases = num(t["TOTAL_CHECKOUT"]);
      const aRevenueMicro = num(t["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]);
      const aRevenue = aRevenueMicro != null ? aRevenueMicro / 1_000_000 : null;
      const aImpressions = num(t["IMPRESSION_1"]);
      const aClicks = num(t["CLICKTHROUGH_1"]);
      let aRoas = num(t["CHECKOUT_ROAS"]);
      if (aRoas == null && aSpend != null && aSpend > 0 && aRevenue != null) {
        aRoas = aRevenue / aSpend;
      }
      const aCpa = aPurchases != null && aPurchases > 0 && aSpend != null ? aSpend / aPurchases : null;
      accountTotals = {
        spend: aSpend,
        revenue: aRevenue,
        purchases: aPurchases,
        impressions: aImpressions,
        clicks: aClicks,
        roas: aRoas,
        cpa: aCpa,
      };
    } catch {
      // If account-level fails for some reason, fall back to ad-level summed.
    }

    // 1. List ads (paginate up to MAX_ADS_TO_FETCH). We deliberately omit
    //    entity_statuses so Pinterest returns its full default set — passing
    //    an explicit filter (esp. unknown values like DRAFT) can cause some
    //    statuses to be silently excluded.
    const adList: Array<{
      id: string;
      name?: string;
      pin_id?: string;
      ad_group_id?: string;
      campaign_id?: string;
      status?: string;
      creative_type?: string;
      created_time?: number;
    }> = [];
    let bookmark: string | undefined;
    let pages = 0;
    do {
      const page = await client.getAds(adAccount.id, {
        bookmark,
        pageSize: 250,
      });
      adList.push(...(page.items || []));
      bookmark = page.bookmark;
      pages++;
      if (adList.length >= MAX_ADS_TO_FETCH) break;
    } while (bookmark);
    const totalAdsFetched = adList.length;
    const pagesFetched = pages;

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
        creative_type: a.creative_type || null,
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

    // 4. Build the union of "interesting" ads across KPIs so we fetch images
    //    for whatever the user might end up sorting by, not just spend.
    const interestingPinIds = new Set<string>();
    function addTop(by: (r: AdRow) => number, n: number, ascending = false) {
      const sorted = [...rows].sort((a, b) =>
        ascending ? by(a) - by(b) : by(b) - by(a)
      );
      for (const r of sorted.slice(0, n)) {
        if (r.pin_id) interestingPinIds.add(r.pin_id);
      }
    }
    addTop((r) => r.spend ?? -Infinity, 60);
    addTop((r) => r.roas ?? -Infinity, 40);
    addTop((r) => r.revenue ?? -Infinity, 40);
    addTop((r) => r.purchases ?? -Infinity, 30);
    addTop((r) => -(r.cpa ?? Number.POSITIVE_INFINITY), 30); // low-CPA first
    // Recently launched (by created_at desc).
    const byRecent = [...rows]
      .filter((r) => r.created_at)
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 30);
    for (const r of byRecent) if (r.pin_id) interestingPinIds.add(r.pin_id);

    // Cap total unique pins fetched.
    const pinIdsToFetch = Array.from(interestingPinIds).slice(0, MAX_PIN_DETAILS);

    const imageByPin = new Map<string, string>();
    let imageFetchFailures = 0;

    const adAccountIdForPins = adAccount.id;
    let ogFallbackUsed = 0;
    async function fetchPinImageWithRetry(pinId: string, attempt = 0): Promise<void> {
      try {
        const pin = await client.getPin(pinId, adAccountIdForPins);
        const url = extractPinImageUrl(pin);
        if (url) {
          imageByPin.set(pinId, url);
          return;
        }
        // API returned the pin but had no image in any expected shape — fall
        // back to scraping the public pin page's og:image (works for video
        // ads where the API hides the cover frame).
        const og = await fetchPinOgImage(pinId);
        if (og) {
          imageByPin.set(pinId, og);
          ogFallbackUsed++;
          return;
        }
        imageFetchFailures++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const isRateLimitOr5xx = /\b(429|5\d\d)\b/.test(msg);
        if (attempt < 2 && isRateLimitOr5xx) {
          await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
          return fetchPinImageWithRetry(pinId, attempt + 1);
        }
        // After API retries are exhausted, try the og:image fallback once.
        const og = await fetchPinOgImage(pinId);
        if (og) {
          imageByPin.set(pinId, og);
          ogFallbackUsed++;
          return;
        }
        imageFetchFailures++;
      }
    }

    for (let i = 0; i < pinIdsToFetch.length; i += IMAGE_BATCH_SIZE) {
      const batch = pinIdsToFetch.slice(i, i + IMAGE_BATCH_SIZE);
      await Promise.all(batch.map((pinId) => fetchPinImageWithRetry(pinId)));
      // Brief pause between batches to ease Pinterest's per-second rate limit.
      if (i + IMAGE_BATCH_SIZE < pinIdsToFetch.length) {
        await new Promise((res) => setTimeout(res, 120));
      }
    }
    for (const r of rows) {
      if (r.pin_id) r.image_url = imageByPin.get(r.pin_id) || null;
    }

    const adsWithSpendCount = rows.filter((r) => r.spend != null && r.spend > 0).length;
    return NextResponse.json({
      ads: rows,
      account_totals: accountTotals,
      ads_connected: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      available_ad_accounts: allAdAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
      currency: adAccount.currency || "USD",
      start_date: startDate,
      end_date: endDate,
      click_window_days: clickWindow,
      view_window_days: viewWindow,
      conversion_report_time: conversionReportTime,
      diagnostics: {
        total_ads_fetched: totalAdsFetched,
        pages_fetched: pagesFetched,
        ads_with_spend: adsWithSpendCount,
        ads_with_analytics: byAdId.size,
        image_lookups_attempted: pinIdsToFetch.length,
        image_lookups_failed: imageFetchFailures,
        image_og_fallback_used: ogFallbackUsed,
      },
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
