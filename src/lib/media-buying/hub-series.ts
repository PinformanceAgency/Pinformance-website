/**
 * Time-series aggregations for the Media Buying Hub charts.
 * Reads pinterest_metrics_snapshots at the account level and rolls up per-day
 * totals for the whole book plus per-department and per-media-buyer splits.
 *
 * All series are aligned to the same date grid so charts can slot them into
 * one <ResponsiveContainer> without gap handling.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreZoneRow } from "./zones";

export interface DailyPoint {
  date: string;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  add_to_carts: number;
  roas: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
  atc_cpa: number | null;
}

export interface HubSeries {
  window_days: number;
  window: { start: string; end: string };
  /** Daily totals for the whole (filtered) book — the main trend chart. */
  agency: DailyPoint[];
  /** Daily totals per department (label = "branding" / "dropship" / …). */
  byDepartment: Record<string, DailyPoint[]>;
  /** Daily totals per media buyer. */
  byBuyer: Record<string, DailyPoint[]>;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return isFinite(n) ? n : 0;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function emptyBucket(): {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  add_to_carts: number;
} {
  return {
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    add_to_carts: 0,
  };
}

function bucketToPoint(date: string, b: ReturnType<typeof emptyBucket>): DailyPoint {
  return {
    date,
    spend: b.spend,
    revenue: b.revenue,
    conversions: b.conversions,
    impressions: b.impressions,
    clicks: b.clicks,
    add_to_carts: b.add_to_carts,
    roas: b.spend > 0 ? b.revenue / b.spend : null,
    cpm: b.impressions > 0 ? (b.spend / b.impressions) * 1000 : null,
    cpc: b.clicks > 0 ? b.spend / b.clicks : null,
    ctr: b.impressions > 0 ? (b.clicks / b.impressions) * 100 : null,
    cpa: b.conversions > 0 ? b.spend / b.conversions : null,
    atc_cpa: b.add_to_carts > 0 ? b.spend / b.add_to_carts : null,
  };
}

/** Fill missing days with zero rows so charts don't show phantom gaps. */
function fillDailyGrid(
  start: string,
  end: string,
  perDay: Map<string, ReturnType<typeof emptyBucket>>
): DailyPoint[] {
  const out: DailyPoint[] = [];
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  for (const d = new Date(startD); d <= endD; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const b = perDay.get(iso) ?? emptyBucket();
    out.push(bucketToPoint(iso, b));
  }
  return out;
}

/** Build every hub time-series in a single query + in-memory group. */
export async function computeHubSeries(
  supabase: SupabaseClient,
  stores: StoreZoneRow[],
  windowDays: number
): Promise<HubSeries> {
  const start = isoDaysAgo(windowDays);
  const end = isoDaysAgo(1);
  const emptyResult: HubSeries = {
    window_days: windowDays,
    window: { start, end },
    agency: fillDailyGrid(start, end, new Map()),
    byDepartment: {},
    byBuyer: {},
  };
  if (stores.length === 0) return emptyResult;

  const orgIds = stores.map((s) => s.org_id);
  const settingsByOrg = new Map<string, StoreZoneRow>(stores.map((s) => [s.org_id, s]));

  const { data, error } = await supabase
    .from("pinterest_metrics_snapshots")
    .select(
      "org_id, snapshot_date, spend, revenue, conversions, impressions, clicks, add_to_carts"
    )
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", start)
    .lte("snapshot_date", end);
  if (error) throw new Error(error.message);

  const agencyDay = new Map<string, ReturnType<typeof emptyBucket>>();
  const deptDay = new Map<string, Map<string, ReturnType<typeof emptyBucket>>>();
  const buyerDay = new Map<string, Map<string, ReturnType<typeof emptyBucket>>>();

  for (const r of data ?? []) {
    const orgId = r.org_id as string;
    const date = r.snapshot_date as string;
    const store = settingsByOrg.get(orgId);
    if (!store) continue;

    const rowSpend = num(r.spend);
    const rowRev = num(r.revenue);
    const rowConv = num(r.conversions);
    const rowImp = num(r.impressions);
    const rowClk = num(r.clicks);
    const rowAtc = num(r.add_to_carts);

    const bumpBucket = (b: ReturnType<typeof emptyBucket>) => {
      b.spend += rowSpend;
      b.revenue += rowRev;
      b.conversions += rowConv;
      b.impressions += rowImp;
      b.clicks += rowClk;
      b.add_to_carts += rowAtc;
    };

    // Agency-wide.
    let ag = agencyDay.get(date);
    if (!ag) {
      ag = emptyBucket();
      agencyDay.set(date, ag);
    }
    bumpBucket(ag);

    // Per department.
    const dept = store.department ?? "(no department)";
    let deptMap = deptDay.get(dept);
    if (!deptMap) {
      deptMap = new Map();
      deptDay.set(dept, deptMap);
    }
    let deptBucket = deptMap.get(date);
    if (!deptBucket) {
      deptBucket = emptyBucket();
      deptMap.set(date, deptBucket);
    }
    bumpBucket(deptBucket);

    // Per buyer.
    const buyer = store.media_buyer ?? "(unassigned)";
    let buyerMap = buyerDay.get(buyer);
    if (!buyerMap) {
      buyerMap = new Map();
      buyerDay.set(buyer, buyerMap);
    }
    let buyerBucket = buyerMap.get(date);
    if (!buyerBucket) {
      buyerBucket = emptyBucket();
      buyerMap.set(date, buyerBucket);
    }
    bumpBucket(buyerBucket);
  }

  const byDepartment: Record<string, DailyPoint[]> = {};
  for (const [dept, map] of deptDay) {
    byDepartment[dept] = fillDailyGrid(start, end, map);
  }
  const byBuyer: Record<string, DailyPoint[]> = {};
  for (const [buyer, map] of buyerDay) {
    byBuyer[buyer] = fillDailyGrid(start, end, map);
  }

  return {
    window_days: windowDays,
    window: { start, end },
    agency: fillDailyGrid(start, end, agencyDay),
    byDepartment,
    byBuyer,
  };
}
