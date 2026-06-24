/**
 * Creative cadence + fatigue per campaign and across the ad account.
 *
 * Two questions we answer in one roundtrip:
 *   1. How often is the media buyer adding new ads to each campaign?
 *      → derive from Pinterest's `created_time` on each ad. Reliable
 *        immediately, no snapshot history needed.
 *   2. Are existing creatives wearing out?
 *      → Pinterest's FREQUENCY metric (impressions / unique reach) over
 *        the last 7d and 30d, fetched per campaign and account-wide.
 *
 * Returning both windows lets the UI show acute-vs-chronic fatigue in
 * one table, which is what the head of mediabuying asked for.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface CampaignCadenceRow {
  id: string;
  name: string;
  status: string | null;
  ads_total: number;
  ads_added_7d: number;
  ads_added_30d: number;
  /** Unix seconds — null if no ads in this campaign. */
  last_ad_created_at: number | null;
  /** Days since the most recent ad was created in this campaign. */
  days_since_last_ad: number | null;
  /** Average days between the last 10 ad additions (or all if fewer). */
  avg_interval_days: number | null;
  frequency_7d: number | null;
  frequency_30d: number | null;
  ctr_7d: number | null;
  ctr_30d: number | null;
  impressions_7d: number;
  impressions_30d: number;
  /** "fresh" | "aging" | "fatigued" — driven by frequency_30d. */
  fatigue: "fresh" | "aging" | "fatigued" | "no_data";
}

interface AccountTotals {
  ads_added_7d: number;
  ads_added_30d: number;
  frequency_7d: number | null;
  frequency_30d: number | null;
  avg_days_between_ads: number | null;
  campaigns_total: number;
  campaigns_fatigued: number;
  campaigns_aging: number;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const p = Number(v);
  return isNaN(p) ? 0 : p;
}

function fatigueFromFrequency(freq: number | null): CampaignCadenceRow["fatigue"] {
  if (freq == null || freq <= 0) return "no_data";
  if (freq < 2.5) return "fresh";
  if (freq <= 4) return "aging";
  return "fatigued";
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
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

  // Allow an admin override of the org if the route ever needs to be reused
  // by /admin/* — for now we trust the caller's effective org.
  await request.json().catch(() => ({}));

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
    const adAccountId = adAccount.id;

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const start7 = isoDaysAgo(7);
    const start30 = isoDaysAgo(30);
    const nowSec = Math.floor(today.getTime() / 1000);
    const sec7 = nowSec - 7 * 86400;
    const sec30 = nowSec - 30 * 86400;

    async function pullAll<T>(
      fetcher: (bookmark?: string) => Promise<{ items: T[]; bookmark?: string }>
    ): Promise<T[]> {
      const out: T[] = [];
      let bookmark: string | undefined;
      do {
        const page = await fetcher(bookmark);
        out.push(...(page.items || []));
        bookmark = page.bookmark;
        if (out.length >= MAX_PINTEREST_FETCH) break;
      } while (bookmark);
      return out;
    }

    const [campaigns, adGroups, ads] = await Promise.all([
      pullAll((bookmark) => client.getCampaigns(adAccountId, { bookmark, pageSize: 250 })),
      pullAll((bookmark) => client.getAdGroups(adAccountId, { bookmark, pageSize: 250 })),
      pullAll((bookmark) => client.getAds(adAccountId, { bookmark, pageSize: 250 })),
    ]);

    // Pinterest's /ads endpoint returns campaign_id inconsistently — sometimes
    // it's there, sometimes only ad_group_id is set. Build a fallback lookup
    // so every ad can be attributed to its campaign.
    const adGroupToCampaign = new Map<string, string>();
    for (const g of adGroups) {
      if (g.id && g.campaign_id) adGroupToCampaign.set(g.id, g.campaign_id);
    }

    function resolveCampaignId(a: { campaign_id?: string; ad_group_id?: string }): string | null {
      if (a.campaign_id) return a.campaign_id;
      if (a.ad_group_id) return adGroupToCampaign.get(a.ad_group_id) || null;
      return null;
    }

    // Bucket ad created_times by campaign.
    const adsByCampaign = new Map<string, number[]>();
    for (const a of ads) {
      const cid = resolveCampaignId(a);
      if (!cid) continue;
      const t = typeof a.created_time === "number" ? a.created_time : null;
      if (t == null) continue;
      const arr = adsByCampaign.get(cid) || [];
      arr.push(t);
      adsByCampaign.set(cid, arr);
    }

    // Account-level ad-addition counts.
    const addedTimes = ads
      .map((a) => (typeof a.created_time === "number" ? a.created_time : null))
      .filter((t): t is number => t != null)
      .sort((a, b) => a - b);
    const adsAdded7dAccount = addedTimes.filter((t) => t >= sec7).length;
    const adsAdded30dAccount = addedTimes.filter((t) => t >= sec30).length;

    // Account-wide average interval between additions over the last 30d.
    const recent30 = addedTimes.filter((t) => t >= sec30);
    let avgDaysBetweenAdsAccount: number | null = null;
    if (recent30.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < recent30.length; i++) {
        intervals.push((recent30[i] - recent30[i - 1]) / 86400);
      }
      avgDaysBetweenAdsAccount =
        intervals.reduce((s, x) => s + x, 0) / intervals.length;
    }

    // Fetch campaign-level analytics in two windows. We compute frequency
    // ourselves (IMPRESSION_1 / IMPRESSION_USER) — Pinterest's bundled
    // FREQUENCY column is inconsistently returned per account.
    const cols = ["IMPRESSION_1", "IMPRESSION_USER", "CLICKTHROUGH_1", "CTR"];
    async function fetchCampaignWindow(start: string) {
      const out = new Map<string, Record<string, number | string>>();
      for (let i = 0; i < campaigns.length; i += 100) {
        const batch = campaigns.slice(i, i + 100).map((c) => c.id);
        try {
          const rows = await client.getCampaignAnalytics(
            adAccountId,
            batch,
            start,
            todayIso,
            { columns: cols, granularity: "TOTAL" }
          );
          for (const r of rows || []) {
            const cid = String(r["CAMPAIGN_ID"] ?? "");
            if (cid) out.set(cid, r);
          }
        } catch {
          // One bad batch shouldn't tank the whole report.
        }
      }
      return out;
    }

    const [cmp7, cmp30] = await Promise.all([
      fetchCampaignWindow(start7),
      fetchCampaignWindow(start30),
    ]);

    // Account-wide frequency for both windows. Pinterest's response shape
    // for /ad_accounts/{id}/analytics?granularity=TOTAL varies — sometimes
    // it's `[{...}]`, sometimes `{ summary_metrics: {...} }`, sometimes
    // `{ FREQUENCY: ... }` at the top level. We probe all three.
    async function fetchAccountFrequency(start: string): Promise<number | null> {
      try {
        const res = await client.getAdAccountAnalytics(adAccountId, start, todayIso, {
          columns: ["IMPRESSION_1", "IMPRESSION_USER"],
          granularity: "TOTAL",
        });
        // Pinterest's TOTAL response shape varies — array of one row,
        // { summary_metrics: {...} }, top-level fields, or { all: { daily_metrics } }.
        let imp = 0,
          reach = 0;
        if (Array.isArray(res) && res[0]) {
          const r = res[0] as Record<string, unknown>;
          imp = num(r["IMPRESSION_1"]);
          reach = num(r["IMPRESSION_USER"]);
        } else if (res && typeof res === "object") {
          const obj = res as Record<string, unknown>;
          const src =
            (obj.summary_metrics as Record<string, unknown> | undefined) ||
            (("IMPRESSION_1" in obj) ? obj : undefined);
          if (src) {
            imp = num(src["IMPRESSION_1"]);
            reach = num(src["IMPRESSION_USER"]);
          } else if (
            obj.all &&
            typeof obj.all === "object" &&
            Array.isArray((obj.all as Record<string, unknown>).daily_metrics)
          ) {
            const days = (obj.all as { daily_metrics: Array<{ metrics?: Record<string, number> }> })
              .daily_metrics;
            for (const d of days) {
              imp += num(d.metrics?.IMPRESSION_1);
              reach += num(d.metrics?.IMPRESSION_USER);
            }
          }
        }
        return reach > 0 ? imp / reach : null;
      } catch {
        return null;
      }
    }

    const [accFreq7, accFreq30] = await Promise.all([
      fetchAccountFrequency(start7),
      fetchAccountFrequency(start30),
    ]);

    // Build per-campaign rows.
    const rows: CampaignCadenceRow[] = campaigns.map((c) => {
      const times = (adsByCampaign.get(c.id) || []).slice().sort((a, b) => a - b);
      const total = times.length;
      const added7d = times.filter((t) => t >= sec7).length;
      const added30d = times.filter((t) => t >= sec30).length;
      const last = total ? times[total - 1] : null;
      const daysSince = last != null ? Math.round(((nowSec - last) / 86400) * 10) / 10 : null;

      let avgInterval: number | null = null;
      if (total >= 2) {
        const window = times.slice(-10);
        const intervals: number[] = [];
        for (let i = 1; i < window.length; i++) {
          intervals.push((window[i] - window[i - 1]) / 86400);
        }
        avgInterval =
          Math.round((intervals.reduce((s, x) => s + x, 0) / intervals.length) * 10) / 10;
      }

      const a7 = cmp7.get(c.id);
      const a30 = cmp30.get(c.id);
      const imp7 = a7 ? num(a7["IMPRESSION_1"]) : 0;
      const imp30 = a30 ? num(a30["IMPRESSION_1"]) : 0;
      const reach7 = a7 ? num(a7["IMPRESSION_USER"]) : 0;
      const reach30 = a30 ? num(a30["IMPRESSION_USER"]) : 0;
      const freq7 = reach7 > 0 ? imp7 / reach7 : 0;
      const freq30 = reach30 > 0 ? imp30 / reach30 : 0;
      const ctr7 = a7 ? num(a7["CTR"]) : 0;
      const ctr30 = a30 ? num(a30["CTR"]) : 0;

      return {
        id: c.id,
        name: c.name || "(unnamed)",
        status: c.status ?? null,
        ads_total: total,
        ads_added_7d: added7d,
        ads_added_30d: added30d,
        last_ad_created_at: last,
        days_since_last_ad: daysSince,
        avg_interval_days: avgInterval,
        frequency_7d: freq7 > 0 ? Math.round(freq7 * 100) / 100 : null,
        frequency_30d: freq30 > 0 ? Math.round(freq30 * 100) / 100 : null,
        ctr_7d: ctr7 > 0 ? Math.round(ctr7 * 100) / 100 : null,
        ctr_30d: ctr30 > 0 ? Math.round(ctr30 * 100) / 100 : null,
        impressions_7d: imp7,
        impressions_30d: imp30,
        fatigue: fatigueFromFrequency(freq30 > 0 ? freq30 : null),
      };
    });

    const totals: AccountTotals = {
      ads_added_7d: adsAdded7dAccount,
      ads_added_30d: adsAdded30dAccount,
      frequency_7d: accFreq7,
      frequency_30d: accFreq30,
      avg_days_between_ads:
        avgDaysBetweenAdsAccount != null
          ? Math.round(avgDaysBetweenAdsAccount * 10) / 10
          : null,
      campaigns_total: rows.length,
      campaigns_fatigued: rows.filter((r) => r.fatigue === "fatigued").length,
      campaigns_aging: rows.filter((r) => r.fatigue === "aging").length,
    };

    // Sort by impressions_30d desc so the busiest campaigns are at the top.
    rows.sort((a, b) => b.impressions_30d - a.impressions_30d);

    // Lightweight diagnostics so we can tell from the wire payload whether
    // ad → campaign attribution actually worked. If diag.ads_with_campaign
    // is 0 while diag.total_ads > 0, Pinterest stopped returning campaign_id
    // and we'd need to fetch ad_fields explicitly.
    const totalAds = ads.length;
    const adsWithCampaignDirect = ads.filter((a) => !!a.campaign_id).length;
    const adsWithAdGroup = ads.filter((a) => !!a.ad_group_id).length;
    const adsAttributed = ads.filter((a) => !!resolveCampaignId(a)).length;
    // How many campaigns ACTUALLY received an ad in last 7d/30d, broken
    // down by campaign status — answers "where did the 779 new ads go?"
    const campStatusById = new Map<string, string>();
    for (const c of campaigns) campStatusById.set(c.id, (c.status || "UNKNOWN").toUpperCase());
    const campAdds7 = new Set<string>();
    const campAdds30 = new Set<string>();
    for (const a of ads) {
      const cid = resolveCampaignId(a);
      const t = typeof a.created_time === "number" ? a.created_time : null;
      if (!cid || t == null) continue;
      if (t >= sec7) campAdds7.add(cid);
      if (t >= sec30) campAdds30.add(cid);
    }
    function statusBreakdown(ids: Set<string>): Record<string, number> {
      const out: Record<string, number> = {};
      for (const id of ids) {
        const s = campStatusById.get(id) || "UNKNOWN";
        out[s] = (out[s] || 0) + 1;
      }
      return out;
    }

    const diag = {
      total_ads_fetched: totalAds,
      ads_with_campaign_id_direct: adsWithCampaignDirect,
      ads_with_ad_group_id: adsWithAdGroup,
      ads_attributed_to_campaign: adsAttributed,
      ad_groups_fetched: adGroups.length,
      campaigns_fetched: campaigns.length,
      campaigns_receiving_ads_7d: campAdds7.size,
      campaigns_receiving_ads_30d: campAdds30.size,
      campaigns_with_ads_7d_by_status: statusBreakdown(campAdds7),
      campaigns_with_ads_30d_by_status: statusBreakdown(campAdds30),
      sample_ad_keys: ads[0] ? Object.keys(ads[0]) : [],
    };

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      totals,
      campaigns: rows,
      diag,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
