/**
 * Aggregate rollups: portfolio health, department breakdown, media-buyer
 * scorecard. All three collapse a filtered list of StoreZoneRow[] into one
 * row per group (or one row for the whole book) with spend-weighted ROAS,
 * spend-weighted BER + invoice, a "group zone" (classifyZone on the aggregate
 * numbers), a zone-count distribution and WoW deltas.
 *
 * Every hub feature reads from the same StoreZoneRow[] input so a store's
 * zone in the Zones panel and its contribution to the department average
 * always agree.
 */
import {
  classifyZone,
  DEFAULT_ZONE_THRESHOLDS,
  type Zone,
} from "./config";
import { tallyZones, type StoreZoneRow } from "./zones";
import type { WoWStore } from "./history";

/** Aggregate the given stores into one row of spend-weighted totals + zone. */
export interface GroupAggregate {
  stores: number;
  spend: number;
  revenue: number;
  roas: number | null;
  weighted_ber: number | null;
  weighted_invoice_roas: number | null;
  /** classifyZone applied to the spend-weighted aggregate. */
  zone: Zone | null;
  zones: { red: number; orange: number; green: number };
}

function aggregateStores(list: StoreZoneRow[]): GroupAggregate {
  let spend = 0,
    revenue = 0,
    berNum = 0,
    berDen = 0,
    invNum = 0,
    invDen = 0;
  for (const s of list) {
    spend += s.spend;
    revenue += s.revenue;
    if (s.spend > 0 && s.breakeven_roas != null) {
      berNum += s.spend * s.breakeven_roas;
      berDen += s.spend;
      // Effective invoice ROAS per store: prefer explicit value, else fall
      // back to BER × green_ratio so partially-configured stores don't skew
      // the average toward a lower "invoice" than they actually run against.
      const eff =
        s.invoice_roas != null && s.invoice_roas > 0
          ? s.invoice_roas
          : s.breakeven_roas *
            (s.zone_thresholds?.green_ratio ?? DEFAULT_ZONE_THRESHOLDS.green_ratio);
      invNum += s.spend * eff;
      invDen += s.spend;
    }
  }
  const roas = spend > 0 ? revenue / spend : null;
  const weighted_ber = berDen > 0 ? berNum / berDen : null;
  const weighted_invoice_roas = invDen > 0 ? invNum / invDen : null;
  const zone = classifyZone({
    liveRoas: roas,
    breakevenRoas: weighted_ber,
    invoiceRoas: weighted_invoice_roas,
    spend,
    windowRevenue: revenue,
  });
  const zt = tallyZones(list);
  return {
    stores: list.length,
    spend,
    revenue,
    roas,
    weighted_ber,
    weighted_invoice_roas,
    zone,
    zones: { red: zt.red, orange: zt.orange, green: zt.green },
  };
}

// ─── Portfolio health (whole book) ─────────────────────────────────────────
export interface PortfolioHealth extends GroupAggregate {
  wow_spend_delta_pct: number | null;
  wow_revenue_delta_pct: number | null;
  wow_roas_delta_pct: number | null;
}

export function computePortfolioHealth(
  stores: StoreZoneRow[],
  wow: WoWStore[] = []
): PortfolioHealth {
  const agg = aggregateStores(stores);
  const wowSet = new Set(stores.map((s) => s.org_id));
  let spPrev = 0,
    spCurr = 0,
    revPrev = 0,
    revCurr = 0;
  for (const w of wow) {
    if (!wowSet.has(w.org_id)) continue;
    spPrev += w.spend_prev;
    spCurr += w.spend_curr;
    revPrev += w.revenue_prev;
    revCurr += w.revenue_curr;
  }
  return {
    ...agg,
    wow_spend_delta_pct: spPrev > 0 ? ((spCurr - spPrev) / spPrev) * 100 : null,
    wow_revenue_delta_pct: revPrev > 0 ? ((revCurr - revPrev) / revPrev) * 100 : null,
    wow_roas_delta_pct: (() => {
      const p = spPrev > 0 ? revPrev / spPrev : null;
      const c = spCurr > 0 ? revCurr / spCurr : null;
      return p && c ? ((c - p) / p) * 100 : null;
    })(),
  };
}

// ─── Rollup by any store attribute ─────────────────────────────────────────
interface GroupRow extends GroupAggregate {
  key: string;
  wow_spend_delta_pct: number | null;
  wow_roas_delta_pct: number | null;
}

function rollupBy(
  stores: StoreZoneRow[],
  wow: WoWStore[],
  keyOf: (s: StoreZoneRow) => string | null,
  fallbackKey: string
): GroupRow[] {
  const groups = new Map<string, StoreZoneRow[]>();
  for (const s of stores) {
    const k = keyOf(s) ?? fallbackKey;
    const list = groups.get(k) ?? [];
    list.push(s);
    groups.set(k, list);
  }
  const wowByOrg = new Map(wow.map((w) => [w.org_id, w]));
  const out: GroupRow[] = [];
  for (const [key, list] of groups) {
    const agg = aggregateStores(list);
    let spPrev = 0,
      spCurr = 0,
      revPrev = 0,
      revCurr = 0;
    for (const s of list) {
      const w = wowByOrg.get(s.org_id);
      if (w) {
        spPrev += w.spend_prev;
        spCurr += w.spend_curr;
        revPrev += w.revenue_prev;
        revCurr += w.revenue_curr;
      }
    }
    const p = spPrev > 0 ? revPrev / spPrev : null;
    const c = spCurr > 0 ? revCurr / spCurr : null;
    out.push({
      key,
      ...agg,
      wow_spend_delta_pct: spPrev > 0 ? ((spCurr - spPrev) / spPrev) * 100 : null,
      wow_roas_delta_pct: p && c ? ((c - p) / p) * 100 : null,
    });
  }
  out.sort((a, b) => b.spend - a.spend);
  return out;
}

// ─── Department breakdown ──────────────────────────────────────────────────
export interface DepartmentRow extends GroupRow {
  department: string;
}

export function computeDepartmentBreakdown(
  stores: StoreZoneRow[],
  wow: WoWStore[]
): DepartmentRow[] {
  return rollupBy(stores, wow, (s) => s.department, "(no department)").map((r) => ({
    ...r,
    department: r.key,
  }));
}

// ─── Media buyer scorecard ─────────────────────────────────────────────────
export interface BuyerScorecardRow extends GroupRow {
  media_buyer: string;
}

export function computeBuyerScorecard(
  stores: StoreZoneRow[],
  wow: WoWStore[]
): BuyerScorecardRow[] {
  return rollupBy(stores, wow, (s) => s.media_buyer, "(unassigned)").map((r) => ({
    ...r,
    media_buyer: r.key,
  }));
}
