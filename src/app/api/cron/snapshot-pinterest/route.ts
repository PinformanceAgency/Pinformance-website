/**
 * Daily Pinterest entity snapshot.
 *
 * For every org with a connected Pinterest ad account, pull every campaign /
 * ad group / ad and write one row per entity into pinterest_entity_snapshots
 * keyed by today's date. The diff between today's row and yesterday's row
 * for the same entity is what powers the admin Ad Activity "changes" feed
 * (status flips, budget edits, paused ads, etc.) — Pinterest's API does not
 * expose this history, so we have to build it ourselves.
 *
 * Idempotent: re-running the same day overwrites today's snapshot via the
 * (org_id, entity_id, snapshot_date) UNIQUE constraint.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";
import { parseCampaignName } from "@/lib/pinterest/naming-conventions";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  const today = new Date().toISOString().slice(0, 10);
  type Result = {
    org_id: string;
    org_name: string;
    ok: boolean;
    counts?: { campaign: number; ad_group: number; ad: number };
    error?: string;
  };

  // Parallelize per org — sequential was blowing the Vercel 300s ceiling on
  // large accounts, leaving 4–8 day gaps in the entity snapshot table (which
  // then makes the Team Activity page under-count new campaigns for the
  // current week). Concurrency 3 keeps Pinterest API calls well under any
  // per-app rate limit while cutting wall clock ~3×.
  const orgList = orgs || [];
  const CONCURRENCY = 3;
  const results: Result[] = new Array(orgList.length);

  async function processOrg(orgIndex: number): Promise<void> {
    const org = orgList[orgIndex];
    try {
      const token = decrypt(org.pinterest_access_token_encrypted as string);
      const isTrial =
        ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) ===
        "trial";
      const client = new PinterestClient(token, isTrial);
      const settings = (org.settings as Record<string, unknown>) || {};
      const preferredAdAccountId =
        typeof settings.pinterest_ad_account_id === "string"
          ? (settings.pinterest_ad_account_id as string)
          : null;
      const { chosen: adAccount } = await selectAdAccount(
        client,
        org.name as string | null,
        preferredAdAccountId
      );
      if (!adAccount) {
        results[orgIndex] = {
          org_id: org.id as string,
          org_name: org.name as string,
          ok: false,
          error: "No ad account",
        };
        return;
      }

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
        pullAll((bookmark) =>
          client.getCampaigns(adAccount.id, { bookmark, pageSize: 250 })
        ),
        pullAll((bookmark) =>
          client.getAdGroups(adAccount.id, { bookmark, pageSize: 250 })
        ),
        pullAll((bookmark) =>
          client.getAds(adAccount.id, { bookmark, pageSize: 250 })
        ),
      ]);

      const rows: Array<Record<string, unknown>> = [];
      for (const c of campaigns) {
        // Parse the naming convention so the hub can filter across all stores
        // by country / funnel / P+ / etc. without re-parsing on every request.
        const parsed = c.name ? parseCampaignName(c.name) : null;
        rows.push({
          org_id: org.id,
          ad_account_id: adAccount.id,
          entity_type: "campaign",
          entity_id: c.id,
          snapshot_date: today,
          name: c.name ?? null,
          status: c.status ?? null,
          parent_campaign_id: null,
          parent_ad_group_id: null,
          daily_spend_cap_dollars: c.daily_spend_cap ?? null,
          lifetime_spend_cap_dollars: c.lifetime_spend_cap ?? null,
          budget_in_micro_currency: null,
          bid_in_micro_currency: null,
          pin_id: null,
          creative_type: null,
          created_time: c.created_time ?? null,
          raw: c as unknown,
          parsed_country: parsed?.country ?? null,
          parsed_funnel: parsed?.funnel ?? null,
          parsed_performance_plus: parsed?.performancePlus ?? null,
          parsed_strategy: parsed?.strategy ?? null,
          parsed_strategy_category: parsed?.strategyCategory ?? null,
          parsed_catalog: parsed?.catalog ?? null,
          parsed_objective: parsed?.objective ?? null,
        });
      }
      for (const g of adGroups) {
        rows.push({
          org_id: org.id,
          ad_account_id: adAccount.id,
          entity_type: "ad_group",
          entity_id: g.id,
          snapshot_date: today,
          name: g.name ?? null,
          status: g.status ?? null,
          parent_campaign_id: g.campaign_id ?? null,
          parent_ad_group_id: null,
          daily_spend_cap_dollars: null,
          lifetime_spend_cap_dollars: null,
          budget_in_micro_currency: g.budget_in_micro_currency ?? null,
          bid_in_micro_currency: g.bid_in_micro_currency ?? null,
          pin_id: null,
          creative_type: null,
          created_time: g.created_time ?? null,
          raw: g as unknown,
        });
      }
      for (const a of ads) {
        rows.push({
          org_id: org.id,
          ad_account_id: adAccount.id,
          entity_type: "ad",
          entity_id: a.id,
          snapshot_date: today,
          name: a.name ?? null,
          status: a.status ?? null,
          parent_campaign_id: a.campaign_id ?? null,
          parent_ad_group_id: a.ad_group_id ?? null,
          daily_spend_cap_dollars: null,
          lifetime_spend_cap_dollars: null,
          budget_in_micro_currency: null,
          bid_in_micro_currency: null,
          pin_id: a.pin_id ?? null,
          creative_type: a.creative_type ?? null,
          created_time: a.created_time ?? null,
          raw: a as unknown,
        });
      }

      // Upsert in chunks — Supabase rejects huge single payloads.
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error } = await admin
          .from("pinterest_entity_snapshots")
          .upsert(slice, { onConflict: "org_id,entity_id,snapshot_date" });
        if (error) throw new Error(error.message);
      }

      results[orgIndex] = {
        org_id: org.id as string,
        org_name: org.name as string,
        ok: true,
        counts: {
          campaign: campaigns.length,
          ad_group: adGroups.length,
          ad: ads.length,
        },
      };
    } catch (e) {
      results[orgIndex] = {
        org_id: org.id as string,
        org_name: org.name as string,
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      };
    }
  }

  // Worker pool — same pattern as snapshot-metrics.
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= orgList.length) return;
      await processOrg(i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, orgList.length) }, () => worker())
  );

  return NextResponse.json({
    ok: true,
    snapshot_date: today,
    org_count: results.length,
    results,
  });
}
