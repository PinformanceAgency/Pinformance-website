/**
 * Aggregate rollups: media buyer scorecard + portfolio health.
 * Both take the same computed StoreZoneRow[] as everything else in the hub so
 * numbers can never drift.
 */
import { tallyZones, type StoreZoneRow } from "./zones";
import type { WoWStore } from "./history";

export interface BuyerScorecardRow {
  media_buyer: string;
  stores: number;
  spend: number;
  revenue: number;
  roas: number | null;
  zones: { red: number; orange: number; green: number };
  wow_spend_delta_pct: number | null;
  wow_roas_delta_pct: number | null;
}

export function computeBuyerScorecard(
  stores: StoreZoneRow[],
  wow: WoWStore[]
): BuyerScorecardRow[] {
  const byBuyer = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const key = s.media_buyer ?? "(unassigned)";
    (byBuyer.get(key) ?? byBuyer.set(key, []).get(key)!).push(s);
  }
  const wowByOrg = new Map(wow.map((w) => [w.org_id, w]));

  const out: BuyerScorecardRow[] = [];
  for (const [buyer, list] of byBuyer) {
    let spend = 0,
      revenue = 0,
      wowSpendPrev = 0,
      wowSpendCurr = 0,
      wowRevPrev = 0,
      wowRevCurr = 0;
    for (const s of list) {
      spend += s.spend;
      revenue += s.revenue;
      const w = wowByOrg.get(s.org_id);
      if (w) {
        wowSpendPrev += w.spend_prev;
        wowSpendCurr += w.spend_curr;
        wowRevPrev += w.revenue_prev;
        wowRevCurr += w.revenue_curr;
      }
    }
    const zones = tallyZones(list);
    const wowSpendPct = wowSpendPrev > 0 ? ((wowSpendCurr - wowSpendPrev) / wowSpendPrev) * 100 : null;
    const prevRoas = wowSpendPrev > 0 ? wowRevPrev / wowSpendPrev : null;
    const currRoas = wowSpendCurr > 0 ? wowRevCurr / wowSpendCurr : null;
    const wowRoasPct = prevRoas && currRoas ? ((currRoas - prevRoas) / prevRoas) * 100 : null;
    out.push({
      media_buyer: buyer,
      stores: list.length,
      spend,
      revenue,
      roas: spend > 0 ? revenue / spend : null,
      zones: { red: zones.red, orange: zones.orange, green: zones.green },
      wow_spend_delta_pct: wowSpendPct,
      wow_roas_delta_pct: wowRoasPct,
    });
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

export interface PortfolioHealth {
  /** Spend-weighted ROAS ratio across the portfolio. 1.0 = at breakeven. */
  weighted_roas_ratio: number | null;
  total_spend: number;
  total_revenue: number;
  overall_roas: number | null;
  weighted_ber: number | null;
  /** 0–100 score. Simple: clamp((weighted_roas_ratio / 1.3) * 100). */
  score: number | null;
  /** Verdict label used in the UI. */
  verdict: "healthy" | "watch" | "concerning" | "critical" | "unknown";
}

export function computePortfolioHealth(stores: StoreZoneRow[]): PortfolioHealth {
  let totalSpend = 0,
    totalRevenue = 0,
    weightedBerNum = 0,
    weightedBerDen = 0;
  for (const s of stores) {
    totalSpend += s.spend;
    totalRevenue += s.revenue;
    if (s.spend > 0 && s.breakeven_roas != null) {
      weightedBerNum += s.spend * s.breakeven_roas;
      weightedBerDen += s.spend;
    }
  }
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : null;
  const weightedBer = weightedBerDen > 0 ? weightedBerNum / weightedBerDen : null;
  const ratio = overallRoas && weightedBer ? overallRoas / weightedBer : null;
  const score = ratio == null ? null : Math.max(0, Math.min(100, Math.round((ratio / 1.3) * 100)));
  let verdict: PortfolioHealth["verdict"] = "unknown";
  if (score == null) verdict = "unknown";
  else if (score >= 80) verdict = "healthy";
  else if (score >= 60) verdict = "watch";
  else if (score >= 40) verdict = "concerning";
  else verdict = "critical";
  return {
    weighted_roas_ratio: ratio,
    total_spend: totalSpend,
    total_revenue: totalRevenue,
    overall_roas: overallRoas,
    weighted_ber: weightedBer,
    score,
    verdict,
  };
}
