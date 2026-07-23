/**
 * Task 5.2 + 5.3 — week-over-week + zone-movers.
 *
 * WoW: sum metrics for the current 7-day window vs the prior 7-day window,
 *      both per-store and agency-wide.
 * Movers: classify each store's zone in the current vs prior window and
 *         surface transitions worth acting on (recovery vs alarm).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyZone, ZONE_ROAS_WINDOW_DAYS, type Zone } from "./config";
import type { StoreZoneRow } from "./zones";

export interface WoWStore {
  org_id: string;
  store_name: string;
  spend_prev: number;
  spend_curr: number;
  spend_delta_pct: number | null;
  revenue_prev: number;
  revenue_curr: number;
  revenue_delta_pct: number | null;
  roas_prev: number | null;
  roas_curr: number | null;
}

export interface WoWAgency {
  spend_prev: number;
  spend_curr: number;
  spend_delta_pct: number | null;
  revenue_prev: number;
  revenue_curr: number;
  revenue_delta_pct: number | null;
  roas_prev: number | null;
  roas_curr: number | null;
  /** "good"/"bad"/"flat" summary — spec §5.2 wants an agency-wide feel. */
  verdict: "good" | "flat" | "bad";
}

export interface Mover {
  org_id: string;
  store_name: string;
  from: Zone | null;
  to: Zone | null;
  category: "recovery" | "alarm" | "improvement" | "regression";
  spend_curr: number;
  roas_curr: number | null;
  roas_prev: number | null;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function pct(prev: number, curr: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

async function fetchAccountWindow(
  supabase: SupabaseClient,
  orgIds: string[],
  startISO: string,
  endISO: string
): Promise<
  Map<
    string,
    { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
  >
> {
  if (orgIds.length === 0) return new Map();
  const { data } = await supabase
    .from("pinterest_metrics_snapshots")
    .select("org_id, spend, revenue, conversions, impressions, clicks, snapshot_date")
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", startISO)
    .lte("snapshot_date", endISO);
  const out = new Map<
    string,
    { spend: number; revenue: number; conversions: number; impressions: number; clicks: number }
  >();
  for (const r of data ?? []) {
    const cur = out.get(r.org_id as string) ?? {
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    };
    cur.spend += Number(r.spend) || 0;
    cur.revenue += Number(r.revenue) || 0;
    cur.conversions += Number(r.conversions) || 0;
    cur.impressions += Number(r.impressions) || 0;
    cur.clicks += Number(r.clicks) || 0;
    out.set(r.org_id as string, cur);
  }
  return out;
}

export async function computeWeekOverWeek(
  supabase: SupabaseClient,
  stores: StoreZoneRow[],
  days = 7
): Promise<{ byStore: WoWStore[]; agency: WoWAgency }> {
  const currEnd = isoDaysAgo(1);
  const currStart = isoDaysAgo(days);
  const prevEnd = isoDaysAgo(days + 1);
  const prevStart = isoDaysAgo(days * 2);

  const orgIds = stores.map((s) => s.org_id);
  const [prev, curr] = await Promise.all([
    fetchAccountWindow(supabase, orgIds, prevStart, prevEnd),
    fetchAccountWindow(supabase, orgIds, currStart, currEnd),
  ]);

  const byStore: WoWStore[] = stores.map((s) => {
    const p = prev.get(s.org_id) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    const c = curr.get(s.org_id) ?? { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
    return {
      org_id: s.org_id,
      store_name: s.store_name,
      spend_prev: p.spend,
      spend_curr: c.spend,
      spend_delta_pct: pct(p.spend, c.spend),
      revenue_prev: p.revenue,
      revenue_curr: c.revenue,
      revenue_delta_pct: pct(p.revenue, c.revenue),
      roas_prev: p.spend > 0 ? p.revenue / p.spend : null,
      roas_curr: c.spend > 0 ? c.revenue / c.spend : null,
    };
  });

  let spendPrev = 0,
    spendCurr = 0,
    revPrev = 0,
    revCurr = 0;
  for (const v of prev.values()) {
    spendPrev += v.spend;
    revPrev += v.revenue;
  }
  for (const v of curr.values()) {
    spendCurr += v.spend;
    revCurr += v.revenue;
  }
  const roasPrev = spendPrev > 0 ? revPrev / spendPrev : null;
  const roasCurr = spendCurr > 0 ? revCurr / spendCurr : null;
  const revenueDeltaPct = pct(revPrev, revCurr);
  // "Good week" = revenue up ≥5% or ROAS up ≥5%. "Bad" mirror. Else flat.
  const roasDeltaPct = roasPrev && roasCurr ? ((roasCurr - roasPrev) / roasPrev) * 100 : null;
  let verdict: "good" | "flat" | "bad" = "flat";
  if ((revenueDeltaPct ?? 0) >= 5 || (roasDeltaPct ?? 0) >= 5) verdict = "good";
  else if ((revenueDeltaPct ?? 0) <= -5 || (roasDeltaPct ?? 0) <= -5) verdict = "bad";

  return {
    byStore,
    agency: {
      spend_prev: spendPrev,
      spend_curr: spendCurr,
      spend_delta_pct: pct(spendPrev, spendCurr),
      revenue_prev: revPrev,
      revenue_curr: revCurr,
      revenue_delta_pct: revenueDeltaPct,
      roas_prev: roasPrev,
      roas_curr: roasCurr,
      verdict,
    },
  };
}

export async function computeMovers(
  supabase: SupabaseClient,
  stores: StoreZoneRow[]
): Promise<Mover[]> {
  const days = ZONE_ROAS_WINDOW_DAYS;
  const currEnd = isoDaysAgo(1);
  const currStart = isoDaysAgo(days);
  const prevEnd = isoDaysAgo(days + 1);
  const prevStart = isoDaysAgo(days * 2);

  const orgIds = stores.map((s) => s.org_id);
  const [prev, curr] = await Promise.all([
    fetchAccountWindow(supabase, orgIds, prevStart, prevEnd),
    fetchAccountWindow(supabase, orgIds, currStart, currEnd),
  ]);

  const out: Mover[] = [];
  for (const s of stores) {
    const p = prev.get(s.org_id);
    const c = curr.get(s.org_id);
    if (!p && !c) continue;
    const roasPrev = p && p.spend > 0 ? p.revenue / p.spend : null;
    const roasCurr = c && c.spend > 0 ? c.revenue / c.spend : null;
    const zonePrev = classifyZone({
      liveRoas: roasPrev,
      breakevenRoas: s.breakeven_roas,
      invoiceRoas: s.invoice_roas,
      spend: p?.spend ?? 0,
      windowRevenue: p?.revenue ?? 0,
      overrides: s.zone_thresholds,
      invoicingModel: s.invoicing_model,
      minMonthlySpend: s.min_monthly_spend,
    });
    const zoneCurr = classifyZone({
      liveRoas: roasCurr,
      breakevenRoas: s.breakeven_roas,
      invoiceRoas: s.invoice_roas,
      spend: c?.spend ?? 0,
      windowRevenue: c?.revenue ?? 0,
      overrides: s.zone_thresholds,
      invoicingModel: s.invoicing_model,
      minMonthlySpend: s.min_monthly_spend,
    });
    if (zonePrev === zoneCurr) continue;

    // Categorize: red→orange/green = recovery, orange→red / green→red = alarm,
    // orange→green = improvement, green→orange = regression.
    let category: Mover["category"] | null = null;
    if (zonePrev === "red" && (zoneCurr === "orange" || zoneCurr === "green")) category = "recovery";
    else if (zoneCurr === "red" && (zonePrev === "orange" || zonePrev === "green")) category = "alarm";
    else if (zonePrev === "orange" && zoneCurr === "green") category = "improvement";
    else if (zonePrev === "green" && zoneCurr === "orange") category = "regression";
    if (!category) continue;

    out.push({
      org_id: s.org_id,
      store_name: s.store_name,
      from: zonePrev,
      to: zoneCurr,
      category,
      spend_curr: c?.spend ?? 0,
      roas_curr: roasCurr,
      roas_prev: roasPrev,
    });
  }
  // Alarms first, then recoveries, then improvement, then regression.
  const rank: Record<Mover["category"], number> = {
    alarm: 0,
    recovery: 1,
    regression: 2,
    improvement: 3,
  };
  out.sort((a, b) => rank[a.category] - rank[b.category] || b.spend_curr - a.spend_curr);
  return out;
}
