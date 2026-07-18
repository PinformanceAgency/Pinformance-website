/**
 * Daily paid-metrics snapshot for the Media Buying Hub (Task 5.1).
 *
 * For every org with a Pinterest ad account, pulls yesterday's totals at the
 * account, campaign, ad-group and ad level, and upserts them into
 * pinterest_metrics_snapshots. Zones (Task 2), benchmarks (Task 4), WoW +
 * movers (Task 5.2/5.3) and exceptions (Task 6) all read from this table.
 *
 * Query param `?days=N` (default 1) backfills the last N days — used once
 * on rollout to seed 30 days of history without hitting Pinterest 30 times.
 *
 * Idempotent: re-running any (org, entity, date) overwrites via UNIQUE.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient, MAX_PINTEREST_FETCH } from "@/lib/pinterest/client";
import { selectAdAccount } from "@/lib/pinterest/select-ad-account";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.CRON_SET;
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

interface DailyMetric {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  raw: Record<string, unknown>;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/** Convert one Pinterest daily-metric row into the shape we store. */
function toDaily(m: Record<string, number | string>): DailyMetric {
  const spend = num(m["SPEND_IN_DOLLAR"]);
  const revenueMicro = num(m["TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR"]);
  const revenue = revenueMicro / 1_000_000;
  const conversions = Math.round(num(m["TOTAL_CHECKOUT"]));
  const impressions = Math.round(num(m["IMPRESSION_1"]));
  const clicks = Math.round(num(m["CLICKTHROUGH_1"]));
  let roas = num(m["CHECKOUT_ROAS"]);
  if (!roas && spend > 0) roas = revenue / spend;
  const cpm = num(m["CPM_IN_DOLLAR"]) || (impressions > 0 ? (spend / impressions) * 1000 : null);
  const cpc = num(m["ECPC_IN_DOLLAR"]) || (clicks > 0 ? spend / clicks : null);
  const ctr = num(m["CTR"]) || (impressions > 0 ? (clicks / impressions) * 100 : null);
  const cpa = conversions > 0 && spend > 0 ? spend / conversions : null;
  return {
    date: String(m["DATE"] ?? m["date"] ?? "").slice(0, 10),
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    roas: roas || null,
    cpm: cpm || null,
    cpc: cpc || null,
    ctr: ctr || null,
    cpa,
    raw: m,
  };
}

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 1)));
  // Pinterest DAY granularity is inclusive on both ends; we always end at
  // "yesterday" so we don't capture a partial-day today.
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const startISO = startDate.toISOString().slice(0, 10);
  const endISO = endDate.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  const results: Array<{
    org_id: string;
    org_name: string;
    ok: boolean;
    days?: number;
    row_count?: number;
    error?: string;
  }> = [];

  for (const org of orgs || []) {
    try {
      const token = decrypt(org.pinterest_access_token_encrypted as string);
      const isTrial =
        ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
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
        results.push({
          org_id: org.id as string,
          org_name: org.name as string,
          ok: false,
          error: "No ad account",
        });
        continue;
      }
      const currency = adAccount.currency ?? null;

      // ── 1. Account-level daily ──────────────────────────────────────────
      const accountResp = (await client.getAdAccountAnalytics(
        adAccount.id,
        startISO,
        endISO,
        { granularity: "DAY" }
      )) as unknown;
      // Pinterest returns either an object with .all.daily_metrics OR a plain
      // array of daily rows depending on granularity — normalize both.
      const accountRows: Array<Record<string, number | string>> = (() => {
        if (Array.isArray(accountResp)) return accountResp;
        const withAll = accountResp as {
          all?: { daily_metrics?: Array<{ date: string; metrics: Record<string, number> }> };
        };
        const dm = withAll.all?.daily_metrics;
        if (!dm) return [];
        return dm.map((r) => ({ ...r.metrics, DATE: r.date }));
      })();

      // ── 2. Fetch all campaigns/ad_groups/ads to know what IDs exist ─────
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
        pullAll((bookmark) => client.getCampaigns(adAccount.id, { bookmark, pageSize: 250 })),
        pullAll((bookmark) => client.getAdGroups(adAccount.id, { bookmark, pageSize: 250 })),
        pullAll((bookmark) => client.getAds(adAccount.id, { bookmark, pageSize: 250 })),
      ]);

      const campaignNames = new Map(campaigns.map((c) => [c.id, c.name ?? null]));
      const adGroupNames = new Map(adGroups.map((g) => [g.id, g.name ?? null]));
      const adNames = new Map(ads.map((a) => [a.id, a.name ?? null]));

      // ── 3. Per-campaign daily (batches of 100) ──────────────────────────
      async function batchAnalytics(
        ids: string[],
        fetcher: (batch: string[]) => Promise<Array<Record<string, number | string>>>
      ): Promise<Array<Record<string, number | string>>> {
        const out: Array<Record<string, number | string>> = [];
        for (let i = 0; i < ids.length; i += 100) {
          const slice = ids.slice(i, i + 100);
          const rows = await fetcher(slice);
          out.push(...rows);
        }
        return out;
      }

      const [campRows, agRows, adRows] = await Promise.all([
        batchAnalytics(campaigns.map((c) => c.id), (b) =>
          client.getCampaignAnalytics(adAccount.id, b, startISO, endISO, {
            granularity: "DAY",
          })
        ),
        batchAnalytics(adGroups.map((g) => g.id), (b) =>
          client.getAdGroupAnalytics(adAccount.id, b, startISO, endISO, {
            granularity: "DAY",
          })
        ),
        batchAnalytics(ads.map((a) => a.id), (b) =>
          client.getAdAnalytics(adAccount.id, b, startISO, endISO, {
            granularity: "DAY",
          })
        ),
      ]);

      // ── 4. Turn all rows into snapshot upsert payloads ──────────────────
      const rows: Array<Record<string, unknown>> = [];

      for (const r of accountRows) {
        const d = toDaily(r);
        if (!d.date) continue;
        rows.push({
          org_id: org.id,
          ad_account_id: adAccount.id,
          entity_type: "account",
          entity_id: adAccount.id,
          snapshot_date: d.date,
          entity_name: adAccount.name ?? null,
          currency,
          spend: d.spend,
          revenue: d.revenue,
          conversions: d.conversions,
          impressions: d.impressions,
          clicks: d.clicks,
          roas: d.roas,
          cpm: d.cpm,
          cpc: d.cpc,
          ctr: d.ctr,
          cpa: d.cpa,
          raw: d.raw,
        });
      }

      function pushRows(
        type: "campaign" | "ad_group" | "ad",
        list: Array<Record<string, number | string>>,
        nameFor: (id: string) => string | null | undefined,
        idKey: "CAMPAIGN_ID" | "AD_GROUP_ID" | "AD_ID"
      ) {
        for (const r of list) {
          const d = toDaily(r);
          if (!d.date) continue;
          const id = String(r[idKey] ?? "");
          if (!id) continue;
          rows.push({
            org_id: org.id,
            ad_account_id: adAccount!.id,
            entity_type: type,
            entity_id: id,
            snapshot_date: d.date,
            entity_name: nameFor(id) ?? null,
            currency,
            spend: d.spend,
            revenue: d.revenue,
            conversions: d.conversions,
            impressions: d.impressions,
            clicks: d.clicks,
            roas: d.roas,
            cpm: d.cpm,
            cpc: d.cpc,
            ctr: d.ctr,
            cpa: d.cpa,
            raw: d.raw,
          });
        }
      }
      pushRows("campaign", campRows, (id) => campaignNames.get(id) ?? null, "CAMPAIGN_ID");
      pushRows("ad_group", agRows, (id) => adGroupNames.get(id) ?? null, "AD_GROUP_ID");
      pushRows("ad", adRows, (id) => adNames.get(id) ?? null, "AD_ID");

      // ── 5. Chunked upsert ───────────────────────────────────────────────
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const { error } = await admin
          .from("pinterest_metrics_snapshots")
          .upsert(slice, { onConflict: "org_id,entity_type,entity_id,snapshot_date" });
        if (error) throw new Error(error.message);
      }

      results.push({
        org_id: org.id as string,
        org_name: org.name as string,
        ok: true,
        days,
        row_count: rows.length,
      });
    } catch (e) {
      results.push({
        org_id: org.id as string,
        org_name: org.name as string,
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    range: { start: startISO, end: endISO, days },
    org_count: results.length,
    results,
  });
}
