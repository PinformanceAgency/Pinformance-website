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

    const [campaigns, ads] = await Promise.all([
      pullAll((bookmark) => client.getCampaigns(adAccountId, { bookmark, pageSize: 250 })),
      pullAll((bookmark) => client.getAds(adAccountId, { bookmark, pageSize: 250 })),
    ]);

    // Bucket ad created_times by campaign.
    const adsByCampaign = new Map<string, number[]>();
    for (const a of ads) {
      if (!a.campaign_id) continue;
      const t = typeof a.created_time === "number" ? a.created_time : null;
      if (t == null) continue;
      const arr = adsByCampaign.get(a.campaign_id) || [];
      arr.push(t);
      adsByCampaign.set(a.campaign_id, arr);
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

    // Fetch campaign-level analytics in two windows. We only need FREQUENCY,
    // IMPRESSION_1, CLICKTHROUGH_1 — keep the payload tight to stay under
    // Pinterest's column limits.
    const cols = ["FREQUENCY", "IMPRESSION_1", "CLICKTHROUGH_1", "CTR"];
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
          columns: ["FREQUENCY", "IMPRESSION_1"],
          granularity: "TOTAL",
        });
        let row: Record<string, unknown> | null = null;
        if (Array.isArray(res) && res[0]) {
          row = res[0] as Record<string, unknown>;
        } else if (res && typeof res === "object") {
          const obj = res as Record<string, unknown>;
          if (obj.summary_metrics && typeof obj.summary_metrics === "object") {
            row = obj.summary_metrics as Record<string, unknown>;
          } else if ("FREQUENCY" in obj) {
            row = obj;
          } else if (
            obj.all &&
            typeof obj.all === "object" &&
            Array.isArray((obj.all as Record<string, unknown>).daily_metrics)
          ) {
            // Sum daily — should match TOTAL.
            const days = (obj.all as { daily_metrics: Array<{ metrics?: Record<string, number> }> })
              .daily_metrics;
            let totalImp = 0,
              totalReach = 0;
            for (const d of days) {
              totalImp += num(d.metrics?.IMPRESSION_1);
              totalReach += num(d.metrics?.IMPRESSION_USER);
            }
            return totalReach > 0 ? totalImp / totalReach : null;
          }
        }
        if (!row) return null;
        const f = num(row["FREQUENCY"]);
        return f > 0 ? f : null;
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
      const freq7 = a7 ? num(a7["FREQUENCY"]) : 0;
      const freq30 = a30 ? num(a30["FREQUENCY"]) : 0;
      const ctr7 = a7 ? num(a7["CTR"]) : 0;
      const ctr30 = a30 ? num(a30["CTR"]) : 0;
      const imp7 = a7 ? num(a7["IMPRESSION_1"]) : 0;
      const imp30 = a30 ? num(a30["IMPRESSION_1"]) : 0;

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

    return NextResponse.json({
      ok: true,
      ad_account_id: adAccount.id,
      ad_account_name: adAccount.name,
      currency: adAccount.currency || "USD",
      totals,
      campaigns: rows,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
