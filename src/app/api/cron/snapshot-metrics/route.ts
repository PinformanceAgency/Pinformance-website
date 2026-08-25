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
import { attributionToDays, DEFAULT_ATTRIBUTION_SETTING } from "@/lib/media-buying/config";

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

interface DailyMetric {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  add_to_carts: number;
  add_to_cart_value: number;
  roas: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  raw: Record<string, unknown>;
}

/** Columns we ask Pinterest for on every analytics call in this cron. Extending
 *  the default list here (rather than overriding it in the client) so future
 *  cron additions stay in one place.
 *
 *  Pinterest does NOT expose an aggregate TOTAL_ADD_TO_CART column (unlike
 *  TOTAL_CHECKOUT). We pull click + view ATCs separately and sum them in
 *  toDaily(). There's also no ATC value column — so ATC ROAS is not
 *  available and we don't expose it as a KPI. */
const ANALYTICS_COLUMNS = [
  "SPEND_IN_DOLLAR",
  "IMPRESSION_1",
  "CLICKTHROUGH_1",
  "CTR",
  "CPM_IN_DOLLAR",
  "ECPC_IN_DOLLAR",
  "TOTAL_CHECKOUT",
  "TOTAL_CHECKOUT_VALUE_IN_MICRO_DOLLAR",
  "CHECKOUT_ROAS",
  "TOTAL_CLICK_ADD_TO_CART",
  "TOTAL_VIEW_ADD_TO_CART",
];

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
  // Pinterest returns click + view attributed ATCs separately; sum them
  // to get the total the user cares about.
  const addToCarts =
    Math.round(num(m["TOTAL_CLICK_ADD_TO_CART"])) +
    Math.round(num(m["TOTAL_VIEW_ADD_TO_CART"]));
  // Pinterest doesn't expose an ATC-value column, so this stays 0.
  const addToCartValue = 0;
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
    add_to_carts: addToCarts,
    add_to_cart_value: addToCartValue,
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
  // Self-heal window: on every scheduled run, ALSO look back this many days
  // and refetch any per-org dates that are missing (Vercel cron misses,
  // transient 5xx, timeout, etc). Cheap when everything is healthy — the
  // account-level query is one API call regardless of how many dates it
  // covers — and prevents holes from becoming permanent.
  // Override with ?heal_days=N (0 disables); default 7d covers typical
  // "last 7 days" reporting windows the Media Buying Hub uses.
  const healDays = Math.max(
    0,
    Math.min(30, Number(url.searchParams.get("heal_days") ?? 7))
  );
  // Account-level refresh window.
  //
  // Healing only ever filled *holes*: a date that already had a row was
  // never fetched again. With a 30-day click window a day's revenue keeps
  // maturing for a month, so writing it once — the day after — froze it at
  // a near-empty value and left it there. Measured against Pinterest, that
  // put revenue anywhere from -34% to +100% out, in both directions,
  // because every day was frozen at a different point in its maturation.
  //
  // The account-level call costs one request regardless of how many days
  // it spans, so re-reading the whole attribution window every run is
  // nearly free. Entity-level pulls keep the narrow window — those are per
  // campaign/ad-group/ad and widening them would multiply the run.
  const refreshDays = Math.max(
    1,
    Math.min(90, Number(url.searchParams.get("refresh_days") ?? 30))
  );
  // Pinterest DAY granularity is inclusive on both ends; we always end at
  // "yesterday" so we don't capture a partial-day today.
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const startISO = startDate.toISOString().slice(0, 10);
  const endISO = endDate.toISOString().slice(0, 10);
  // Heal window is always [yesterday - healDays + 1, yesterday]. Used only to
  // extend the fetch on a per-org basis if holes exist in that window.
  const healStart = new Date(endDate);
  healStart.setUTCDate(healStart.getUTCDate() - (healDays - 1));
  const healStartISO = healStart.toISOString().slice(0, 10);
  const refreshStart = new Date(endDate);
  refreshStart.setUTCDate(refreshStart.getUTCDate() - (refreshDays - 1));
  const refreshStartISO = refreshStart.toISOString().slice(0, 10);

  const admin = createAdminClient();
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, pinterest_access_token_encrypted, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  // Pull per-store attribution overrides once. Absent = default 30/1.
  const { data: settingsRows } = await admin
    .from("store_settings")
    .select("org_id, attribution_setting");
  const attrByOrg = new Map<string, string>(
    (settingsRows ?? [])
      .filter((r) => r.attribution_setting)
      .map((r) => [r.org_id as string, r.attribution_setting as string])
  );

  type Result = {
    org_id: string;
    org_name: string;
    ok: boolean;
    days?: number;
    row_count?: number;
    error?: string;
    healed_from?: string;
    /** How far back the account-level refresh actually read. Worth having
     *  in the response: if this ever silently narrows, revenue starts
     *  freezing again and nothing else would show it. */
    account_refreshed_from?: string;
  };

  // Per-org processing extracted so we can run several orgs concurrently.
  // Pinterest's per-app rate limit sits around ~1000/hour and each org fires
  // ~10-15 calls, so a small concurrency cap (3) keeps us well under it while
  // still cutting wall-clock time to a fraction of the sequential version —
  // which was regularly hitting the Vercel 300s timeout and truncating the
  // org list mid-run (that's how Nova Jewelry, Sarah Oliver, and 15+ others
  // were silently missing 4-5 days of snapshots).
  const orgList = orgs || [];
  const CONCURRENCY = 3;
  const results: Result[] = new Array(orgList.length);

  async function processOrg(orgIndex: number): Promise<void> {
    const org = orgList[orgIndex];
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
        results[orgIndex] = {
          org_id: org.id as string,
          org_name: org.name as string,
          ok: false,
          error: "No ad account",
        };
        return;
      }
      const currency = adAccount.currency ?? null;

      // Use this store's Pinterest attribution setting so the numbers we
      // snapshot match what Campaign Manager shows for that account.
      const attrKey = attrByOrg.get(org.id as string) ?? DEFAULT_ATTRIBUTION_SETTING;
      const attr = attributionToDays(attrKey);
      const analyticsOpts = {
        granularity: "DAY" as const,
        clickWindowDays: attr.click,
        viewWindowDays: attr.view,
        columns: ANALYTICS_COLUMNS,
        // Credit a conversion to the day of the click that drove it, which
        // is how Ads Manager reports by default. The client falls back to
        // TIME_OF_CONVERSION when this is omitted, which books revenue on
        // the purchase date instead — a different metric that measured
        // 17-27% away from the platform on live accounts.
        conversionReportTime: "TIME_OF_AD_ACTION" as const,
      };

      // Self-heal: if any dates in [healStartISO, endISO] have no account
      // snapshot for THIS org, extend the fetch back to the earliest hole
      // so a single Pinterest call refills all missing days. When everything
      // is already covered, the fetch stays at [startISO, endISO].
      let fetchStartISO = startISO;
      const fetchEndISO = endISO;
      if (healDays > 0) {
        const { data: existingRows } = await admin
          .from("pinterest_metrics_snapshots")
          .select("snapshot_date")
          .eq("org_id", org.id as string)
          .eq("entity_type", "account")
          .gte("snapshot_date", healStartISO)
          .lte("snapshot_date", endISO);
        const present = new Set(
          (existingRows ?? []).map((r) => String(r.snapshot_date).slice(0, 10))
        );
        // Walk healStart..end forward; the earliest missing date extends the
        // fetch range. Any hole between it and endISO gets refilled too.
        let earliestHole: string | null = null;
        const cursor = new Date(healStart);
        while (cursor <= endDate) {
          const iso = cursor.toISOString().slice(0, 10);
          if (!present.has(iso)) {
            earliestHole = iso;
            break;
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        if (earliestHole && earliestHole < fetchStartISO) {
          fetchStartISO = earliestHole;
        }
      }

      // ── 1. Account-level daily ──────────────────────────────────────────
      // Always the full refresh window, never just the holes — see
      // refreshDays above. One request whatever the span, and the upsert
      // overwrites on (org, type, entity, date), so maturing days correct
      // themselves on every run instead of staying frozen.
      const accountStartISO =
        refreshStartISO < fetchStartISO ? refreshStartISO : fetchStartISO;
      const accountResp = (await client.getAdAccountAnalytics(
        adAccount.id,
        accountStartISO,
        fetchEndISO,
        analyticsOpts
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

      // Per-entity calls use the same widened range as the account call so
      // healed dates get campaign/ad_group/ad rows too. Same API-call count,
      // just a wider date filter on each — no extra Pinterest quota.
      const [campRows, agRows, adRows] = await Promise.all([
        batchAnalytics(campaigns.map((c) => c.id), (b) =>
          client.getCampaignAnalytics(adAccount.id, b, fetchStartISO, fetchEndISO, analyticsOpts)
        ),
        batchAnalytics(adGroups.map((g) => g.id), (b) =>
          client.getAdGroupAnalytics(adAccount.id, b, fetchStartISO, fetchEndISO, analyticsOpts)
        ),
        batchAnalytics(ads.map((a) => a.id), (b) =>
          client.getAdAnalytics(adAccount.id, b, fetchStartISO, fetchEndISO, analyticsOpts)
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
          add_to_carts: d.add_to_carts,
          add_to_cart_value: d.add_to_cart_value,
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
            add_to_carts: d.add_to_carts,
            add_to_cart_value: d.add_to_cart_value,
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

      results[orgIndex] = {
        org_id: org.id as string,
        org_name: org.name as string,
        ok: true,
        days,
        row_count: rows.length,
        // Was the range widened beyond the requested `days` because holes
        // were detected? Surfaces silent self-heal activity in logs.
        healed_from: fetchStartISO !== startISO ? fetchStartISO : undefined,
        account_refreshed_from: accountStartISO,
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

  // Worker-pool: keeps `CONCURRENCY` promises running until every org has
  // been claimed. `next` is the shared cursor so each worker picks the next
  // unstarted org rather than dividing the list up-front (avoids uneven
  // finish times when one org is much slower than others).
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
    range: { start: startISO, end: endISO, days },
    org_count: results.length,
    results,
  });
}
