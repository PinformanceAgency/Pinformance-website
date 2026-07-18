/**
 * Task 6 — exception engine.
 *
 * Auto-flags stores that need attention so the head of media buying doesn't
 * need to eyeball 30+ dashboards. All thresholds configurable in one place
 * below.
 *
 * Rules:
 *  - RED_STREAK       — store has been red for N consecutive days
 *  - SPEND_DROP       — 7d spend down >X% vs prior 7d
 *  - ROAS_CRASH       — 3d avg ROAS down >X% vs the 7 days before it
 *  - STALE_ACCOUNT    — no snapshot activity for N days (proxy for silence)
 *
 * Unconfigured stores are silently skipped (they're already flagged on the
 * Store Settings page — no need to double up).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyZone } from "./config";
import type { StoreZoneRow } from "./zones";

export const EXCEPTION_THRESHOLDS = {
  RED_STREAK_DAYS: 3,
  SPEND_DROP_PCT: 30,
  ROAS_CRASH_PCT: 25,
  STALE_ACCOUNT_DAYS: 5,
};

export type ExceptionRule = "red_streak" | "spend_drop" | "roas_crash" | "stale_account";

export interface Exception {
  org_id: string;
  store_name: string;
  rule: ExceptionRule;
  severity: "high" | "medium" | "low";
  detail: string;
  spend_context: number | null;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function computeExceptions(
  supabase: SupabaseClient,
  stores: StoreZoneRow[]
): Promise<Exception[]> {
  if (stores.length === 0) return [];
  const orgIds = stores.map((s) => s.org_id);
  // Pull enough history for the longest rule (2x 7d + a buffer).
  const historyStart = isoDaysAgo(21);
  const historyEnd = isoDaysAgo(1);
  const { data } = await supabase
    .from("pinterest_metrics_snapshots")
    .select("org_id, spend, revenue, snapshot_date")
    .eq("entity_type", "account")
    .in("org_id", orgIds)
    .gte("snapshot_date", historyStart)
    .lte("snapshot_date", historyEnd)
    .order("snapshot_date", { ascending: false });

  // Group by org.
  const byOrg = new Map<string, Array<{ date: string; spend: number; revenue: number }>>();
  for (const r of data ?? []) {
    const key = r.org_id as string;
    const list = byOrg.get(key) ?? [];
    list.push({ date: r.snapshot_date as string, spend: Number(r.spend) || 0, revenue: Number(r.revenue) || 0 });
    byOrg.set(key, list);
  }

  const out: Exception[] = [];
  const storeByOrg = new Map(stores.map((s) => [s.org_id, s]));

  for (const [orgId, days] of byOrg) {
    const store = storeByOrg.get(orgId);
    if (!store) continue;
    days.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

    // ── STALE_ACCOUNT ──────────────────────────────────────────────────
    if (days.length === 0 || days[0].date < isoDaysAgo(EXCEPTION_THRESHOLDS.STALE_ACCOUNT_DAYS)) {
      out.push({
        org_id: orgId,
        store_name: store.store_name,
        rule: "stale_account",
        severity: "medium",
        detail: `No snapshot activity for ${EXCEPTION_THRESHOLDS.STALE_ACCOUNT_DAYS}+ days.`,
        spend_context: null,
      });
      continue; // stale trumps the rest
    }

    // ── RED_STREAK ─────────────────────────────────────────────────────
    let streak = 0;
    for (const d of days.slice(0, EXCEPTION_THRESHOLDS.RED_STREAK_DAYS + 1)) {
      const roas = d.spend > 0 ? d.revenue / d.spend : null;
      const z = classifyZone(roas, store.breakeven_roas, d.spend, store.zone_thresholds);
      if (z === "red") streak++;
      else break;
    }
    if (streak >= EXCEPTION_THRESHOLDS.RED_STREAK_DAYS) {
      out.push({
        org_id: orgId,
        store_name: store.store_name,
        rule: "red_streak",
        severity: "high",
        detail: `Red ${streak} days in a row.`,
        spend_context: store.spend,
      });
    }

    // ── SPEND_DROP ─────────────────────────────────────────────────────
    let currSpend = 0,
      prevSpend = 0;
    for (const d of days) {
      if (d.date >= isoDaysAgo(7)) currSpend += d.spend;
      else if (d.date >= isoDaysAgo(14)) prevSpend += d.spend;
    }
    if (prevSpend > 0) {
      const drop = ((prevSpend - currSpend) / prevSpend) * 100;
      if (drop >= EXCEPTION_THRESHOLDS.SPEND_DROP_PCT) {
        out.push({
          org_id: orgId,
          store_name: store.store_name,
          rule: "spend_drop",
          severity: drop >= 50 ? "high" : "medium",
          detail: `Spend down ${Math.round(drop)}% week-over-week.`,
          spend_context: currSpend,
        });
      }
    }

    // ── ROAS_CRASH ─────────────────────────────────────────────────────
    let curr3Spend = 0,
      curr3Rev = 0,
      prev7Spend = 0,
      prev7Rev = 0;
    for (const d of days) {
      if (d.date >= isoDaysAgo(3)) {
        curr3Spend += d.spend;
        curr3Rev += d.revenue;
      } else if (d.date >= isoDaysAgo(10)) {
        prev7Spend += d.spend;
        prev7Rev += d.revenue;
      }
    }
    if (curr3Spend > 0 && prev7Spend > 0) {
      const currRoas = curr3Rev / curr3Spend;
      const prevRoas = prev7Rev / prev7Spend;
      if (prevRoas > 0) {
        const drop = ((prevRoas - currRoas) / prevRoas) * 100;
        if (drop >= EXCEPTION_THRESHOLDS.ROAS_CRASH_PCT) {
          out.push({
            org_id: orgId,
            store_name: store.store_name,
            rule: "roas_crash",
            severity: drop >= 40 ? "high" : "medium",
            detail: `ROAS down ${Math.round(drop)}% (last 3d vs prior 7d).`,
            spend_context: curr3Spend,
          });
        }
      }
    }
  }

  // High severity first, then by spend context descending.
  const sevRank: Record<Exception["severity"], number> = { high: 0, medium: 1, low: 2 };
  out.sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.spend_context ?? 0) - (a.spend_context ?? 0)
  );
  return out;
}
