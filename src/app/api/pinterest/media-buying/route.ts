/**
 * Aggregated paid-ads view for the Media Buying tab:
 *  - Current period totals (spend, revenue, conversions, roas, cpa, ctr).
 *  - Previous-period totals for delta % comparison.
 *  - Daily data series for the trend chart.
 *  - Landing page breakdown (URL → ad_count + spend/conv/rev/roas/cpa).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface Totals {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number;
}

interface DailyRow {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
}

interface LandingPageRow {
  url: string;
  ad_count: number;
  spend: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number | null;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const p = Number(v);
  return isNaN(p) ? 0 : p;
}

function rowToTotals(m: Record<string, number | string>): Totals {
  const spend = num(m["SPEND_IN_DOLLAR"]);
  const revenueMicro = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]);
  const revenue = revenueMicro / 1_000_000;
  const conversions = num(m["TOTAL_CHECKOUT"]);
  const impressions = num(m["IMPRESSION_1"]);
  const clicks = num(m["CLICKTHROUGH_1"]);
  let roas = num(m["CHECKOUT_ROAS"]);
  if (!roas && spend > 0) roas = revenue / spend;
  const cpa = conversions > 0 && spend > 0 ? spend / conversions : null;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  return { spend, revenue, conversions, impressions, clicks, roas, cpa, ctr };
}

function previousRange(startISO: string, endISO: string): { start: string; end: string } {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000)) + 1
  );
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    start: prevStart.toISOString().split("T")[0],
    end: prevEnd.toISOString().split("T")[0],
  };
}

function normalizeUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "(no link)";
  try {
    const u = new URL(rawUrl);
    const hostname = u.hostname.replace(/^www\./, "");
    // Trim trailing slash, query, fragment for grouping.
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${hostname}${path}`;
  } catch {
    return rawUrl;
  }
}

export async function POST(request: NextRequest) {
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
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) ===
      "trial";
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

    const prev = previousRange(body.start_date, body.end_date);
    const opts = {
      clickWindowDays: clickWindow,
      viewWindowDays: viewWindow,
      conversionReportTime: "TIME_OF_CONVERSION" as const,
    };

    // Current totals (granularity=TOTAL → array of one row).
    const curResp = (await client.getAdAccountAnalytics(
      adAccount.id,
      body.start_date,
      body.end_date,
      opts
    )) as Array<Record<string, number | string>>;
    const currentTotals = rowToTotals(curResp?.[0] || {});

    // Previous totals.
    const prevResp = (await client.getAdAccountAnalytics(
      adAccount.id,
      prev.start,
      prev.end,
      opts
    )) as Array<Record<string, number | string>>;
    const previousTotals = rowToTotals(prevResp?.[0] || {});

    // Daily series (granularity=DAY → returns array of daily rows).
    const dailyRespRaw = await client.getAdAccountAnalytics(
      adAccount.id,
      body.start_date,
      body.end_date,
      { ...opts, granularity: "DAY" }
    );
    const dailyRows: DailyRow[] = [];
    // Pinterest can shape the response a few ways depending on endpoint
    // version. Handle both array-of-rows and { all: { daily_metrics } }.
    const dailyArray = Array.isArray(dailyRespRaw)
      ? dailyRespRaw
      : Array.isArray((dailyRespRaw as { all?: { daily_metrics?: unknown[] } })?.all?.daily_metrics)
        ? ((dailyRespRaw as { all?: { daily_metrics?: Array<{ date: string; metrics: Record<string, number> }> } }).all!.daily_metrics!).map(
            (d) => ({ DATE: d.date, ...d.metrics })
          )
        : [];
    for (const row of dailyArray as Array<Record<string, number | string>>) {
      const date = String(row.DATE ?? row.date ?? "");
      if (!date) continue;
      const t = rowToTotals(row);
      dailyRows.push({
        date,
        spend: t.spend,
        revenue: t.revenue,
        conversions: t.conversions,
        impressions: t.impressions,
        clicks: t.clicks,
        roas: t.roas,
        cpa: t.cpa,
      });
    }
    dailyRows.sort((a, b) => a.date.localeCompare(b.date));

    // Landing page breakdown.
    // 1) Pull all ads in the account.
    const adList: Array<{ id: string; pin_id?: string; name?: string }> = [];
    let bookmark: string | undefined;
    do {
      const page = await client.getAds(adAccount.id, { bookmark, pageSize: 250 });
      adList.push(...(page.items || []));
      bookmark = page.bookmark;
      if (adList.length >= MAX_PINTEREST_FETCH) break;
    } while (bookmark);

    // 2) Get analytics for each ad (so we can attribute spend/conv/rev).
    const adAnalytics = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < adList.length; i += 100) {
      const batch = adList.slice(i, i + 100).map((a) => a.id);
      const rows = await client.getAdAnalytics(
        adAccount.id,
        batch,
        body.start_date,
        body.end_date,
        opts
      );
      for (const r of rows || []) {
        const adId = String(r["AD_ID"] ?? "");
        if (adId) adAnalytics.set(adId, r);
      }
    }

    // 3) Resolve pin link for each ad with spend (skip ads with no spend to
    //    keep pin lookups bounded). Cache by pin_id.
    const adsWithSpend = adList.filter((a) => {
      const m = adAnalytics.get(a.id);
      return m && num(m["SPEND_IN_DOLLAR"]) > 0 && a.pin_id;
    });
    const pinLinkCache = new Map<string, string>();
    const PIN_BATCH = 10;
    for (let i = 0; i < adsWithSpend.length; i += PIN_BATCH) {
      const batch = adsWithSpend.slice(i, i + PIN_BATCH);
      await Promise.all(
        batch.map(async (a) => {
          if (!a.pin_id || pinLinkCache.has(a.pin_id)) return;
          try {
            const pin = await client.getPin(a.pin_id, adAccount.id);
            if (pin.link) pinLinkCache.set(a.pin_id, pin.link);
          } catch {
            // skip
          }
        })
      );
      // tiny pause to ease rate limits
      if (i + PIN_BATCH < adsWithSpend.length) {
        await new Promise((res) => setTimeout(res, 80));
      }
    }

    // 4) Aggregate by normalized URL.
    type Agg = { adIds: Set<string>; spend: number; revenue: number; conversions: number };
    const byUrl = new Map<string, Agg>();
    for (const a of adsWithSpend) {
      const link = a.pin_id ? pinLinkCache.get(a.pin_id) || null : null;
      const url = normalizeUrl(link);
      const m = adAnalytics.get(a.id)!;
      const cur = byUrl.get(url) || {
        adIds: new Set<string>(),
        spend: 0,
        revenue: 0,
        conversions: 0,
      };
      cur.adIds.add(a.id);
      cur.spend += num(m["SPEND_IN_DOLLAR"]);
      cur.revenue += num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
      cur.conversions += num(m["TOTAL_CHECKOUT"]);
      byUrl.set(url, cur);
    }

    const landingPages: LandingPageRow[] = Array.from(byUrl.entries())
      .map(([url, agg]) => {
        const roas = agg.spend > 0 ? agg.revenue / agg.spend : 0;
        const cpa = agg.conversions > 0 ? agg.spend / agg.conversions : null;
        return {
          url,
          ad_count: agg.adIds.size,
          spend: agg.spend,
          conversions: agg.conversions,
          revenue: agg.revenue,
          roas,
          cpa,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      start_date: body.start_date,
      end_date: body.end_date,
      previous_start: prev.start,
      previous_end: prev.end,
      click_window_days: clickWindow,
      view_window_days: viewWindow,
      current_totals: currentTotals,
      previous_totals: previousTotals,
      daily: dailyRows,
      landing_pages: landingPages,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
