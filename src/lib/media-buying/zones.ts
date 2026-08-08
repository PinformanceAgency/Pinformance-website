/**
 * Server-side helpers to compute the red / orange / green zone for every
 * store (and optionally per-campaign) by reading pinterest_metrics_snapshots
 * and joining against store_settings' breakeven_roas + zone_thresholds.
 *
 * All hub features (Task 3, 4, 5, 6) go through here so the "which stores are
 * red" definition lives in exactly one place.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_ZONE_THRESHOLDS,
  ZONE_ROAS_WINDOW_DAYS,
  classifyZone,
  type InvoicingModel,
  type Zone,
  type ZoneThresholds,
} from "./config";
import type { StoreSettings } from "./store-settings-types";
import type { Department } from "./config";

export interface StoreZoneRow {
  org_id: string;
  store_name: string;
  ad_account_id: string | null;
  currency: string | null;
  // Metadata (may be null if store isn't configured yet — those are excluded).
  department: Department | null;
  niche: string | null;
  /** @deprecated Kept for legacy readers. Prefer `countries`. */
  country: string | null;
  countries: string[] | null;
  media_buyer: string | null;
  breakeven_roas: number | null;
  invoice_roas: number | null;
  invoicing_model: InvoicingModel;
  min_monthly_spend: number | null;
  attribution_setting: string | null;
  zone_thresholds: Partial<ZoneThresholds> | null;
  is_active: boolean;
  configured: boolean;
  // Metrics over the ZONE_ROAS_WINDOW_DAYS window.
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
  zone: Zone | null;
  /** Ratio = roas / ber, or null if either is missing. Handy for sorting. */
  ratio: number | null;
  /** Per-week zone for the last 4 rolling weeks, oldest first. Populated from
   *  28 days of account-level snapshots. Null entries mean "no data / no
   *  spend that week" — the UI shows those as dashes rather than a false
   *  green. */
  weekly_zones: (Zone | null)[];
  /** Per-month zone for the last 3 calendar months, oldest first:
   *  [prev month, last month, this month MTD]. The current-month bucket is
   *  partial by definition — the classifier still applies the invoicing-model
   *  gate, so early-in-the-month stores may sit in orange even at healthy ROAS
   *  until the spend/revenue floor is met. */
  monthly_zones: (Zone | null)[];
}

export interface CampaignZoneRow {
  org_id: string;
  store_name: string;
  entity_id: string;
  name: string | null;
  parsed_country: string | null;
  parsed_funnel: string | null;
  parsed_performance_plus: string | null;
  parsed_strategy: string | null;
  parsed_strategy_category: string | null;
  parsed_catalog: string | null;
  parsed_objective: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number | null;
  zone: Zone | null;
  ratio: number | null;
}

interface MetricRow {
  org_id: string;
  entity_id: string;
  entity_name: string | null;
  ad_account_id: string;
  currency: string | null;
  spend: number | string;
  revenue: number | string;
  conversions: number | string;
  impressions: number | string;
  clicks: number | string;
  snapshot_date: string;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

/** Sum a metrics-snapshot window per entity, returning a totals map. */
function sumWindow<T extends MetricRow>(
  rows: T[]
): Map<
  string,
  {
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
    name: string | null;
    currency: string | null;
    ad_account_id: string;
    org_id: string;
  }
> {
  const out = new Map<
    string,
    {
      spend: number;
      revenue: number;
      conversions: number;
      impressions: number;
      clicks: number;
      name: string | null;
      currency: string | null;
      ad_account_id: string;
      org_id: string;
    }
  >();
  for (const r of rows) {
    const key = `${r.org_id}::${r.entity_id}`;
    const cur = out.get(key) ?? {
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
      name: r.entity_name,
      currency: r.currency,
      ad_account_id: r.ad_account_id,
      org_id: r.org_id,
    };
    cur.spend += n(r.spend);
    cur.revenue += n(r.revenue);
    cur.conversions += n(r.conversions);
    cur.impressions += n(r.impressions);
    cur.clicks += n(r.clicks);
    // Latest name wins.
    if (r.entity_name) cur.name = r.entity_name;
    if (r.currency) cur.currency = r.currency;
    out.set(key, cur);
  }
  return out;
}

/** Window boundaries [startISO, endISO] inclusive, ending yesterday (UTC). */
export function zoneWindow(days = ZONE_ROAS_WINDOW_DAYS): {
  start: string;
  end: string;
} {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Compute per-store zones for every org the caller can see (RLS-filtered by
 * the passed supabase client). Includes unconfigured stores with
 * `configured=false` so the UI can render them separately.
 */
export async function computeStoreZones(
  supabase: SupabaseClient,
  days = ZONE_ROAS_WINDOW_DAYS
): Promise<StoreZoneRow[]> {
  const { start: currentStart, end } = zoneWindow(days);
  // Pull enough history for both the 4-week rolling weekly buckets AND the
  // 3-calendar-month buckets. The month-boundary calculation picks the first
  // day of "two months before end month" so we always cover the full oldest
  // month regardless of what day of the current month we're on.
  const endDate = new Date(end + "T00:00:00Z");
  const monthStart = (yearOffset: number, monthOffset: number) => {
    const d = new Date(Date.UTC(endDate.getUTCFullYear() + yearOffset, endDate.getUTCMonth() + monthOffset, 1));
    return d.toISOString().slice(0, 10);
  };
  const thisMonthStart = monthStart(0, 0);
  const lastMonthStart = monthStart(0, -1);
  const prevMonthStart = monthStart(0, -2);
  const { start: weeklyHistoryStart } = zoneWindow(28);
  const historyStart =
    prevMonthStart < weeklyHistoryStart ? prevMonthStart : weeklyHistoryStart;

  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id, settings");
  if (orgsErr) throw new Error(orgsErr.message);

  const { data: settings, error: setErr } = await supabase.from("store_settings").select("*");
  if (setErr) throw new Error(setErr.message);
  const settingsByOrg = new Map<string, StoreSettings>(
    (settings ?? []).map((s) => [s.org_id, s as StoreSettings])
  );

  const orgIds = (orgs ?? []).filter((o) => o.pinterest_user_id).map((o) => o.id as string);
  if (orgIds.length === 0) return [];

  const { data: metrics, error: mErr } = await supabase
    .from("pinterest_metrics_snapshots")
    .select(
      "org_id, entity_id, entity_name, ad_account_id, currency, spend, revenue, conversions, impressions, clicks, snapshot_date"
    )
    .eq("entity_type", "account")
    .gte("snapshot_date", historyStart)
    .lte("snapshot_date", end)
    .in("org_id", orgIds);
  if (mErr) throw new Error(mErr.message);

  const allMetrics = (metrics ?? []) as MetricRow[];
  // Existing behaviour: sum only rows within the current N-day window.
  const currentMetrics = allMetrics.filter((r) => r.snapshot_date >= currentStart);
  const totals = sumWindow(currentMetrics);

  // Weekly bucketing for the 4-week zone matrix. Bucket 0 = oldest (3w ago),
  // bucket 3 = most recent 7 days.
  // Monthly bucketing for the 3-month view. Bucket 0 = 2 months ago,
  // bucket 1 = last month, bucket 2 = this month MTD.
  const weeklyByOrg = new Map<string, Array<{ spend: number; revenue: number }>>();
  const monthlyByOrg = new Map<string, Array<{ spend: number; revenue: number }>>();
  const emptyBucket = () => ({ spend: 0, revenue: 0 });
  for (const orgId of orgIds) {
    weeklyByOrg.set(orgId, [emptyBucket(), emptyBucket(), emptyBucket(), emptyBucket()]);
    monthlyByOrg.set(orgId, [emptyBucket(), emptyBucket(), emptyBucket()]);
  }
  for (const r of allMetrics) {
    const d = new Date(r.snapshot_date + "T00:00:00Z");
    const daysBack = Math.floor(
      (endDate.getTime() - d.getTime()) / (24 * 3600 * 1000)
    );
    // Weekly bucket
    if (daysBack >= 0 && daysBack < 28) {
      // 0 days back → most recent week (bucket 3); 21+ days back → oldest week (bucket 0).
      const weekIndex = 3 - Math.floor(daysBack / 7);
      if (weekIndex >= 0 && weekIndex <= 3) {
        const bucket = weeklyByOrg.get(r.org_id);
        if (bucket) {
          bucket[weekIndex].spend += n(r.spend);
          bucket[weekIndex].revenue += n(r.revenue);
        }
      }
    }
    // Monthly bucket — YYYY-MM string compare is safe because all dates share
    // the ISO YYYY-MM-DD prefix format.
    if (r.snapshot_date >= prevMonthStart && r.snapshot_date <= end) {
      const monthIndex =
        r.snapshot_date >= thisMonthStart
          ? 2
          : r.snapshot_date >= lastMonthStart
          ? 1
          : 0;
      const mb = monthlyByOrg.get(r.org_id);
      if (mb) {
        mb[monthIndex].spend += n(r.spend);
        mb[monthIndex].revenue += n(r.revenue);
      }
    }
  }

  const rows: StoreZoneRow[] = (orgs ?? [])
    .filter((o) => o.pinterest_user_id)
    .map((o) => {
      const s = settingsByOrg.get(o.id as string) ?? null;
      const configured = !!(s && s.department != null && s.breakeven_roas != null);
      // Find any account snapshot for this org (any of its ad accounts).
      let tot: {
        spend: number;
        revenue: number;
        conversions: number;
        impressions: number;
        clicks: number;
        name: string | null;
        currency: string | null;
        ad_account_id: string;
        org_id: string;
      } | undefined;
      for (const [k, v] of totals) {
        if (k.startsWith(`${o.id}::`)) {
          tot = v;
          break;
        }
      }
      const spend = tot?.spend ?? 0;
      const revenue = tot?.revenue ?? 0;
      const roas = spend > 0 ? revenue / spend : null;
      const cpm = tot && tot.impressions > 0 ? (spend / tot.impressions) * 1000 : null;
      const cpc = tot && tot.clicks > 0 ? spend / tot.clicks : null;
      const ctr = tot && tot.impressions > 0 ? (tot.clicks / tot.impressions) * 100 : null;
      const cpa = tot && tot.conversions > 0 ? spend / tot.conversions : null;
      const invoicingModel: InvoicingModel =
        (s?.invoicing_model as InvoicingModel | undefined) ?? "revenue_fee";
      const minMonthlySpend = s?.min_monthly_spend ?? null;
      const zone = configured
        ? classifyZone({
            liveRoas: roas,
            breakevenRoas: s?.breakeven_roas ?? null,
            invoiceRoas: s?.invoice_roas ?? null,
            spend,
            windowRevenue: revenue,
            overrides: s?.zone_thresholds,
            invoicingModel,
            minMonthlySpend,
          })
        : null;
      const ber = s?.breakeven_roas ?? null;
      const ratio = ber && ber > 0 && roas != null ? roas / ber : null;
      // Weekly zones for this store using its own BER / invoice / thresholds.
      const buckets = weeklyByOrg.get(o.id as string) ?? [
        emptyBucket(), emptyBucket(), emptyBucket(), emptyBucket(),
      ];
      const classifyBucket = (b: { spend: number; revenue: number }) => {
        const wr = b.spend > 0 ? b.revenue / b.spend : null;
        return classifyZone({
          liveRoas: wr,
          breakevenRoas: s?.breakeven_roas ?? null,
          invoiceRoas: s?.invoice_roas ?? null,
          spend: b.spend,
          windowRevenue: b.revenue,
          overrides: s?.zone_thresholds,
          invoicingModel,
          minMonthlySpend,
        });
      };
      const weekly_zones: (Zone | null)[] = configured
        ? buckets.map(classifyBucket)
        : [null, null, null, null];
      const monthBuckets = monthlyByOrg.get(o.id as string) ?? [
        emptyBucket(), emptyBucket(), emptyBucket(),
      ];
      const monthly_zones: (Zone | null)[] = configured
        ? monthBuckets.map(classifyBucket)
        : [null, null, null];
      return {
        org_id: o.id as string,
        store_name: (o.name as string) || "(unnamed)",
        ad_account_id:
          tot?.ad_account_id ??
          s?.ad_account_id ??
          ((o.settings as { pinterest_ad_account_id?: string } | null)?.pinterest_ad_account_id ??
            null),
        currency: tot?.currency ?? null,
        department: s?.department ?? null,
        niche: s?.niche ?? null,
        country: s?.country ?? null,
        countries:
          s?.countries && s.countries.length > 0
            ? s.countries
            : s?.country
            ? [s.country]
            : null,
        media_buyer: s?.media_buyer ?? null,
        breakeven_roas: s?.breakeven_roas ?? null,
        invoice_roas: s?.invoice_roas ?? null,
        invoicing_model: invoicingModel,
        min_monthly_spend: minMonthlySpend,
        attribution_setting: s?.attribution_setting ?? null,
        zone_thresholds: s?.zone_thresholds ?? null,
        is_active: s?.is_active ?? true,
        configured,
        spend,
        revenue,
        conversions: tot?.conversions ?? 0,
        impressions: tot?.impressions ?? 0,
        clicks: tot?.clicks ?? 0,
        roas,
        cpm,
        cpc,
        ctr,
        cpa,
        zone,
        ratio,
        weekly_zones,
        monthly_zones,
      };
    });
  return rows;
}

/**
 * Compute per-campaign zones for a set of orgs (or all orgs, if omitted).
 * Joins live campaign snapshots against the naming-parse columns for filter
 * support in the naming-explorer.
 */
export async function computeCampaignZones(
  supabase: SupabaseClient,
  opts: { orgIds?: string[]; days?: number } = {}
): Promise<CampaignZoneRow[]> {
  const days = opts.days ?? ZONE_ROAS_WINDOW_DAYS;
  const { start, end } = zoneWindow(days);

  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id");
  if (orgsErr) throw new Error(orgsErr.message);
  const orgNameById = new Map<string, string>(
    (orgs ?? []).map((o) => [o.id as string, (o.name as string) || "(unnamed)"])
  );

  const { data: settings } = await supabase.from("store_settings").select("*");
  const settingsByOrg = new Map<string, StoreSettings>(
    (settings ?? []).map((s) => [s.org_id, s as StoreSettings])
  );

  const orgIds = opts.orgIds ?? (orgs ?? []).map((o) => o.id as string);
  if (orgIds.length === 0) return [];

  // Metrics for campaigns in window.
  const { data: metrics, error: mErr } = await supabase
    .from("pinterest_metrics_snapshots")
    .select("org_id, entity_id, entity_name, ad_account_id, currency, spend, revenue, conversions, impressions, clicks, snapshot_date")
    .eq("entity_type", "campaign")
    .gte("snapshot_date", start)
    .lte("snapshot_date", end)
    .in("org_id", orgIds);
  if (mErr) throw new Error(mErr.message);

  const totals = sumWindow(metrics as MetricRow[]);

  // Latest parsed attrs from pinterest_entity_snapshots (most recent snapshot
  // per campaign wins, so renamed campaigns re-classify on the next snapshot).
  const campaignIds = Array.from(new Set(Array.from(totals.values()).map((_, i) => {
    return null; // placeholder — real IDs below via key
  })));
  // Actually derive campaign IDs from map keys.
  const ids = Array.from(totals.keys()).map((k) => k.split("::")[1]);
  const { data: parsedRows } = ids.length
    ? await supabase
        .from("pinterest_entity_snapshots")
        .select(
          "entity_id, name, parsed_country, parsed_funnel, parsed_performance_plus, parsed_strategy, parsed_strategy_category, parsed_catalog, parsed_objective, snapshot_date"
        )
        .eq("entity_type", "campaign")
        .in("entity_id", ids)
        .order("snapshot_date", { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const parsedByEntity = new Map<
    string,
    {
      name: string | null;
      parsed_country: string | null;
      parsed_funnel: string | null;
      parsed_performance_plus: string | null;
      parsed_strategy: string | null;
      parsed_strategy_category: string | null;
      parsed_catalog: string | null;
      parsed_objective: string | null;
    }
  >();
  for (const p of (parsedRows ?? []) as Array<Record<string, unknown>>) {
    const id = String(p.entity_id);
    if (parsedByEntity.has(id)) continue; // first (most recent) wins
    parsedByEntity.set(id, {
      name: (p.name as string) ?? null,
      parsed_country: (p.parsed_country as string) ?? null,
      parsed_funnel: (p.parsed_funnel as string) ?? null,
      parsed_performance_plus: (p.parsed_performance_plus as string) ?? null,
      parsed_strategy: (p.parsed_strategy as string) ?? null,
      parsed_strategy_category: (p.parsed_strategy_category as string) ?? null,
      parsed_catalog: (p.parsed_catalog as string) ?? null,
      parsed_objective: (p.parsed_objective as string) ?? null,
    });
  }

  const rows: CampaignZoneRow[] = [];
  for (const [key, tot] of totals) {
    const [orgId, entityId] = key.split("::");
    const s = settingsByOrg.get(orgId);
    const parsed = parsedByEntity.get(entityId);
    const spend = tot.spend;
    const revenue = tot.revenue;
    const roas = spend > 0 ? revenue / spend : null;
    // Campaigns skip the revenue-floor gate — a smaller winning campaign
    // inside a healthy store shouldn't be dragged to orange just because it
    // alone doesn't do €5k/week.
    const zone = classifyZone({
      liveRoas: roas,
      breakevenRoas: s?.breakeven_roas ?? null,
      invoiceRoas: s?.invoice_roas ?? null,
      spend,
      requireRevenueFloor: false,
      overrides: s?.zone_thresholds,
    });
    const ber = s?.breakeven_roas ?? null;
    const ratio = ber && ber > 0 && roas != null ? roas / ber : null;
    rows.push({
      org_id: orgId,
      store_name: orgNameById.get(orgId) ?? "(unknown)",
      entity_id: entityId,
      name: parsed?.name ?? tot.name ?? null,
      parsed_country: parsed?.parsed_country ?? null,
      parsed_funnel: parsed?.parsed_funnel ?? null,
      parsed_performance_plus: parsed?.parsed_performance_plus ?? null,
      parsed_strategy: parsed?.parsed_strategy ?? null,
      parsed_strategy_category: parsed?.parsed_strategy_category ?? null,
      parsed_catalog: parsed?.parsed_catalog ?? null,
      parsed_objective: parsed?.parsed_objective ?? null,
      spend,
      revenue,
      conversions: tot.conversions,
      roas,
      zone,
      ratio,
    });
  }
  return rows;
}

/** Count zone buckets from a list. Unclassified (null) is not counted. */
export function tallyZones<T extends { zone: Zone | null }>(
  rows: T[]
): { red: number; orange: number; green: number; unclassified: number } {
  const out = { red: 0, orange: 0, green: 0, unclassified: 0 };
  for (const r of rows) {
    if (r.zone === "red") out.red++;
    else if (r.zone === "orange") out.orange++;
    else if (r.zone === "green") out.green++;
    else out.unclassified++;
  }
  return out;
}
