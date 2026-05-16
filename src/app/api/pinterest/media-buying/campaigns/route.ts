/**
 * Campaign-level breakdown for the Media Online → Campaign Level tab.
 *
 * Returns one row per campaign with:
 *  - Pinterest metrics (spend, revenue, conversions, roas, cpa, ctr, cpm,
 *    impressions, clicks)
 *  - Parsed naming-convention dimensions (country, catalog, performance+,
 *    funnel, strategy, strategyCategory, objective, unknown tokens)
 *
 * The UI slices/filters/groups client-side so tab interactions don't trigger
 * new Pinterest API calls — only date-range / conversion-window changes do.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import {
  parseCampaignName,
  type CampaignParsed,
} from "@/lib/pinterest/naming-conventions";

interface CampaignRow {
  id: string;
  name: string;
  status: string | null;
  parsed: CampaignParsed;
  // Metrics (currency in account currency unless noted)
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number;
  cpa: number | null;
  ctr: number; // percent
  cpm: number; // currency
}

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

    // 1) Pull all campaigns (paginate).
    const campaigns: Array<{ id: string; name?: string; status?: string }> = [];
    let bookmark: string | undefined;
    do {
      const page = await client.getCampaigns(adAccount.id, { bookmark, pageSize: 250 });
      campaigns.push(...(page.items || []));
      bookmark = page.bookmark;
      if (campaigns.length >= 3000) break;
    } while (bookmark);

    // 2) Batch-fetch analytics for all campaigns (100/call).
    const analyticsByCampaign = new Map<string, Record<string, number | string>>();
    for (let i = 0; i < campaigns.length; i += 100) {
      const batch = campaigns.slice(i, i + 100).map((c) => c.id);
      const rows = await client.getCampaignAnalytics(
        adAccount.id,
        batch,
        body.start_date,
        body.end_date,
        opts
      );
      for (const r of rows || []) {
        const cid = String(r["CAMPAIGN_ID"] ?? "");
        if (cid) analyticsByCampaign.set(cid, r);
      }
    }

    // 3) Combine: campaign metadata + analytics + parsed naming.
    const rows: CampaignRow[] = campaigns.map((c) => {
      const m = analyticsByCampaign.get(c.id) || {};
      const spend = num(m["SPEND_IN_DOLLAR"]);
      const revenue = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]) / 1_000_000;
      const conversions = num(m["TOTAL_CHECKOUT"]);
      const impressions = num(m["IMPRESSION_1"]);
      const clicks = num(m["CLICKTHROUGH_1"]);
      let roas = num(m["CHECKOUT_ROAS"]);
      if (!roas && spend > 0) roas = revenue / spend;
      const cpa = conversions > 0 && spend > 0 ? spend / conversions : null;
      const ctrFromApi = num(m["CTR"]);
      const ctr = ctrFromApi > 0 ? ctrFromApi : impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpmFromApi = num(m["CPM_IN_DOLLAR"]);
      const cpm = cpmFromApi > 0 ? cpmFromApi : impressions > 0 ? (spend / impressions) * 1000 : 0;

      const name = c.name || "(unnamed)";
      return {
        id: c.id,
        name,
        status: c.status ?? null,
        parsed: parseCampaignName(name),
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        roas,
        cpa,
        ctr,
        cpm,
      };
    });

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      start_date: body.start_date,
      end_date: body.end_date,
      click_window_days: clickWindow,
      view_window_days: viewWindow,
      campaigns: rows,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
