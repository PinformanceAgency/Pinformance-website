/**
 * Ad-level breakdown for the Media Online → Ad Level tab.
 *
 * Returns one row per ad with daily metrics + parsed naming-convention
 * dimensions (format, content type, creator type, category, offer, LP type,
 * launch date, version, unknown tokens). Ads with zero spend in the period
 * are filtered out server-side to keep the response size manageable.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import {
  PinterestClient,
  MAX_PINTEREST_FETCH,
  extractPinImageUrl,
  fetchPinOgImage,
} from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import { parseAdName, type AdParsed } from "@/lib/pinterest/naming-conventions";

interface DailyRow {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

interface AdRow {
  id: string;
  name: string;
  status: string | null;
  parsed: AdParsed;
  pin_id: string | null;
  creative_type: string | null;
  created_time: number | null;
  image_url: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
  cpm: number;
  daily: DailyRow[];
}

// Cap image lookups so a wide ad account doesn't take minutes to load. Top
// performers + recently launched ads are prioritized; the rest fall back to
// the format icon in the UI.
const MAX_PIN_DETAILS = 150;
const IMAGE_BATCH_SIZE = 15;

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const p = Number(v);
  return isNaN(p) ? 0 : p;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "Pinterest not connected" }, { status: 400 });
  }

  const body = (await request.json()) as {
    start_date: string;
    end_date: string;
    click_window?: number;
    view_window?: number;
  };
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(body.start_date) || !dateRe.test(body.end_date)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const allowed = new Set([1, 7, 14, 30, 60]);
  const clickWindow = (allowed.has(body.click_window ?? 30) ? body.click_window ?? 30 : 30) as
    | 1
    | 7
    | 14
    | 30
    | 60;
  const viewWindow = (allowed.has(body.view_window ?? 1) ? body.view_window ?? 1 : 1) as
    | 1
    | 7
    | 14
    | 30
    | 60;

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    const isTrial =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const settings = (org.settings as Record<string, unknown>) || {};
    const preferredAdAccountId =
      typeof settings.pinterest_ad_account_id === "string"
        ? settings.pinterest_ad_account_id
        : null;
    const { chosen: adAccount } = await selectAdAccount(
      client,
      org.name as string | null,
      preferredAdAccountId
    );
    if (!adAccount) {
      return NextResponse.json({ error: "No ad account" }, { status: 400 });
    }

    const opts = {
      clickWindowDays: clickWindow,
      viewWindowDays: viewWindow,
      conversionReportTime: "TIME_OF_CONVERSION" as const,
    };

    // 0) Pinterest's authoritative account-level totals for the period.
    //    These match what Campaign Manager (and our Overview tab) show.
    //    They can be higher than the sum of per-ad rows because Pinterest
    //    sometimes attributes conversions / revenue at campaign or
    //    ad-group level instead of all the way down to an ad.
    const accountResp = (await client.getAdAccountAnalytics(
      adAccount.id,
      body.start_date,
      body.end_date,
      opts
    )) as Array<Record<string, number | string>>;
    const accountRow = accountResp?.[0] || {};
    const acctSpend = num(accountRow["SPEND_IN_DOLLAR"]);
    const acctRevenue =
      num(accountRow["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
    const acctConv = num(accountRow["TOTAL_CHECKOUT"]);
    const acctImpr = num(accountRow["IMPRESSION_1"]);
    const acctClicks = num(accountRow["CLICKTHROUGH_1"]);
    let acctRoas = num(accountRow["CHECKOUT_ROAS"]);
    if (!acctRoas && acctSpend > 0) acctRoas = acctRevenue / acctSpend;
    const acctCpa = acctConv > 0 && acctSpend > 0 ? acctSpend / acctConv : null;
    const account_totals = {
      spend: acctSpend,
      revenue: acctRevenue,
      conversions: acctConv,
      impressions: acctImpr,
      clicks: acctClicks,
      roas: acctRoas,
      cpa: acctCpa,
    };

    // 1) Pull all ads (paginate). Capped at 5000 to avoid runaway responses
    //    on huge accounts. Keep the full ad object (pin_id, creative_type,
    //    created_time) — the UI needs them to render thumbnails + launch
    //    dates on the per-ad table.
    const ads: Array<{
      id: string;
      name?: string;
      status?: string;
      pin_id?: string;
      creative_type?: string;
      created_time?: number;
    }> = [];
    let bookmark: string | undefined;
    do {
      const page = await client.getAds(adAccount.id, { bookmark, pageSize: 250 });
      ads.push(...(page.items || []));
      bookmark = page.bookmark;
      if (ads.length >= MAX_PINTEREST_FETCH) break;
    } while (bookmark);

    // 2) Batch-fetch daily analytics (100/call).
    const dailyByAd = new Map<string, DailyRow[]>();
    for (let i = 0; i < ads.length; i += 100) {
      const batch = ads.slice(i, i + 100).map((a) => a.id);
      const rows = await client.getAdAnalytics(
        adAccount.id,
        batch,
        body.start_date,
        body.end_date,
        { ...opts, granularity: "DAY" }
      );
      for (const r of rows || []) {
        const aid = String(r["AD_ID"] ?? "");
        if (!aid) continue;
        const date = String(r["DATE"] ?? r["date"] ?? "");
        if (!date) continue;
        const dailyRow: DailyRow = {
          date,
          spend: num(r["SPEND_IN_DOLLAR"]),
          revenue: num(r["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000,
          conversions: num(r["TOTAL_CHECKOUT"]),
          impressions: num(r["IMPRESSION_1"]),
          clicks: num(r["CLICKTHROUGH_1"]),
        };
        const arr = dailyByAd.get(aid) || [];
        arr.push(dailyRow);
        dailyByAd.set(aid, arr);
      }
    }

    // 3) Combine + filter to ads with spend > 0 in the period. Ad accounts
    //    accumulate thousands of paused/never-ran ads over time; sending
    //    them all to the client would bloat the payload without adding
    //    signal to any dimension breakdown.
    const rows: AdRow[] = [];
    for (const a of ads) {
      const dailyUnsorted = dailyByAd.get(a.id) || [];
      if (dailyUnsorted.length === 0) continue;
      const daily = [...dailyUnsorted].sort((a, b) => a.date.localeCompare(b.date));
      let spend = 0,
        revenue = 0,
        conversions = 0,
        impressions = 0,
        clicks = 0;
      for (const d of daily) {
        spend += d.spend;
        revenue += d.revenue;
        conversions += d.conversions;
        impressions += d.impressions;
        clicks += d.clicks;
      }
      if (spend === 0) continue;
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = conversions > 0 && spend > 0 ? spend / conversions : null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

      const name = a.name || "(unnamed)";
      rows.push({
        id: a.id,
        name,
        status: a.status ?? null,
        parsed: parseAdName(name),
        pin_id: a.pin_id ?? null,
        creative_type: a.creative_type ?? null,
        created_time: a.created_time ?? null,
        image_url: null,
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        roas,
        cpa,
        ctr,
        cpm,
        daily,
      });
    }

    // 4) Resolve pin thumbnails for the most "interesting" rows so the
    //    per-ad table can render visuals. Cap at MAX_PIN_DETAILS to keep
    //    page load times bounded — top spenders / top ROAS / top revenue /
    //    top conversions / recently launched all get prioritized.
    const interestingPinIds = new Set<string>();
    function addTop(by: (r: AdRow) => number, n: number, ascending = false) {
      const sorted = [...rows].sort((a, b) =>
        ascending ? by(a) - by(b) : by(b) - by(a)
      );
      for (const r of sorted.slice(0, n)) {
        if (r.pin_id) interestingPinIds.add(r.pin_id);
      }
    }
    addTop((r) => r.spend, 60);
    addTop((r) => r.roas, 40);
    addTop((r) => r.revenue, 40);
    addTop((r) => r.conversions, 30);
    addTop((r) => -(r.cpa ?? Number.POSITIVE_INFINITY), 30); // low-CPA first
    // Recently launched (by created_time desc).
    const byRecent = [...rows]
      .filter((r) => r.created_time != null)
      .sort((a, b) => (b.created_time ?? 0) - (a.created_time ?? 0))
      .slice(0, 30);
    for (const r of byRecent) if (r.pin_id) interestingPinIds.add(r.pin_id);

    const pinIdsToFetch = Array.from(interestingPinIds).slice(0, MAX_PIN_DETAILS);
    const imageByPin = new Map<string, string>();
    const adAccountIdForPins = adAccount.id;

    async function fetchPinImageWithRetry(pinId: string, attempt = 0): Promise<void> {
      try {
        const pin = await client.getPin(pinId, adAccountIdForPins);
        const url = extractPinImageUrl(pin);
        if (url) {
          imageByPin.set(pinId, url);
          return;
        }
        const og = await fetchPinOgImage(pinId);
        if (og) imageByPin.set(pinId, og);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        const isRateLimitOr5xx = /\b(429|5\d\d)\b/.test(msg);
        if (attempt < 2 && isRateLimitOr5xx) {
          await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
          return fetchPinImageWithRetry(pinId, attempt + 1);
        }
        const og = await fetchPinOgImage(pinId);
        if (og) imageByPin.set(pinId, og);
      }
    }
    for (let i = 0; i < pinIdsToFetch.length; i += IMAGE_BATCH_SIZE) {
      const batch = pinIdsToFetch.slice(i, i + IMAGE_BATCH_SIZE);
      await Promise.all(batch.map((pinId) => fetchPinImageWithRetry(pinId)));
      if (i + IMAGE_BATCH_SIZE < pinIdsToFetch.length) {
        await new Promise((res) => setTimeout(res, 120));
      }
    }
    for (const r of rows) {
      if (r.pin_id) r.image_url = imageByPin.get(r.pin_id) || null;
    }

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      start_date: body.start_date,
      end_date: body.end_date,
      click_window_days: clickWindow,
      view_window_days: viewWindow,
      items: rows,
      account_totals,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
