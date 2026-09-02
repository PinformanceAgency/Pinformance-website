/**
 * Store Ranking data — lightweight per-store aggregation for the Store
 * Ranking page. Separate from computeStoreZones() because that one pulls
 * 12-week zone history + weekly + monthly buckets for the Zones page, which
 * is overkill and slow when all we need is "sum spend/revenue for [start,end]
 * and classify the zone".
 *
 * Accepts a custom [start, end] date range (inclusive, UTC ISO YYYY-MM-DD)
 * so the user can pick any window they want — not just "last 7d ending
 * yesterday" that zoneWindow() enforces.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyZone, type InvoicingModel, type Zone } from "./config";
import type { StoreSettings } from "./store-settings-types";

export interface StoreRankingRow {
  org_id: string;
  store_name: string;
  media_buyer: string | null;
  department: string | null;
  currency: string | null;
  zone: Zone | null;
  roas: number | null;
  spend: number;
  revenue: number;
  breakeven_roas: number | null;
  invoice_roas: number | null;
}

interface MetricRow {
  org_id: string;
  spend: number | string;
  revenue: number | string;
  currency: string | null;
  snapshot_date: string;
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return isFinite(x) ? x : 0;
}

export async function computeStoreRankingForRange(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
): Promise<StoreRankingRow[]> {
  // Configured + active stores only — this view is for live management,
  // not onboarding/inactive orgs.
  const { data: settings, error: setErr } = await supabase
    .from("store_settings")
    .select("*");
  if (setErr) throw new Error(setErr.message);
  const settingsByOrg = new Map<string, StoreSettings>(
    (settings ?? []).map((s) => [s.org_id, s as StoreSettings])
  );

  const { data: orgs, error: orgsErr } = await supabase
    .from("organizations")
    .select("id, name, pinterest_user_id");
  if (orgsErr) throw new Error(orgsErr.message);

  const orgIds = (orgs ?? [])
    .filter((o) => o.pinterest_user_id)
    .map((o) => o.id as string);
  if (orgIds.length === 0) return [];

  // Paginate account-level metrics for the requested window. PostgREST caps
  // responses at 1000 rows; a 14-day window × 40+ orgs stays under that but
  // wider windows can exceed it.
  const PAGE = 1000;
  const rows: MetricRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("pinterest_metrics_snapshots")
      .select("org_id, spend, revenue, currency, snapshot_date")
      .eq("entity_type", "account")
      .gte("snapshot_date", startISO)
      .lte("snapshot_date", endISO)
      .in("org_id", orgIds)
      .order("snapshot_date", { ascending: false })
      // Tiebreaker on the primary key — snapshot_date alone is not a total
      // order, and PostgREST may then return a row on two pages or on none.
      // These rows are SUMMED, so that lands as a wrong number rather than as
      // an error. Same defect measured and fixed in zones.ts on 02-09-2026.
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as MetricRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // Aggregate per org.
  const perOrg = new Map<
    string,
    { spend: number; revenue: number; currency: string | null }
  >();
  for (const r of rows) {
    const acc = perOrg.get(r.org_id) ?? { spend: 0, revenue: 0, currency: null };
    acc.spend += n(r.spend);
    acc.revenue += n(r.revenue);
    if (r.currency && !acc.currency) acc.currency = r.currency;
    perOrg.set(r.org_id, acc);
  }

  const result: StoreRankingRow[] = [];
  for (const o of orgs ?? []) {
    const s = settingsByOrg.get(o.id as string);
    // Filter to configured + active
    const configured = !!(s && s.department != null && s.breakeven_roas != null);
    const isActive = s?.is_active ?? true;
    if (!configured || !isActive || !o.pinterest_user_id) continue;

    const tot = perOrg.get(o.id as string) ?? { spend: 0, revenue: 0, currency: null };
    const roas = tot.spend > 0 ? tot.revenue / tot.spend : null;
    const invoicingModel: InvoicingModel =
      (s?.invoicing_model as InvoicingModel | undefined) ?? "revenue_fee";
    const zone = classifyZone({
      liveRoas: roas,
      breakevenRoas: s?.breakeven_roas ?? null,
      invoiceRoas: s?.invoice_roas ?? null,
      spend: tot.spend,
      windowRevenue: tot.revenue,
      overrides: s?.zone_thresholds,
      invoicingModel,
      minMonthlySpend: s?.min_monthly_spend ?? null,
    });

    result.push({
      org_id: o.id as string,
      store_name: (o.name as string) || "(unnamed)",
      media_buyer: s?.media_buyer ?? null,
      department: s?.department ?? null,
      currency: tot.currency,
      zone,
      roas,
      spend: tot.spend,
      revenue: tot.revenue,
      breakeven_roas: s?.breakeven_roas ?? null,
      invoice_roas: s?.invoice_roas ?? null,
    });
  }

  return result;
}
