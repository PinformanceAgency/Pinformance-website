/**
 * GET /api/media-buying/hub
 *
 * The single endpoint that powers the Media Buying Hub page. Returns:
 *  - `stores`     — every configured store's zone + metrics + benchmarks
 *  - `campaigns`  — every campaign's zone + parsed attrs (naming-explorer)
 *  - `zone_tally` — counts of red/orange/green at store + campaign level
 *  - `buyer_scorecard` — per-media-buyer aggregate
 *  - `portfolio_health` — spend-weighted score for the whole book
 *  - `benchmarks` — per-niche / per-country / per-store rolling averages
 *  - `movers`     — zone flips vs the prior window (recover/alarm)
 *  - `exceptions` — auto-flagged stores per rule
 *  - `wow`        — week-over-week per store + agency-wide
 *  - `meta`       — window boundaries + config so the UI can show tooltips
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ZONE_ROAS_WINDOW_DAYS,
  BENCHMARK_WINDOW_DAYS_SHORT,
  BENCHMARK_WINDOW_DAYS_LONG,
  BENCHMARK_MIN_STORES,
  DEFAULT_ZONE_THRESHOLDS,
  DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR,
} from "@/lib/media-buying/config";
import {
  computeStoreZones,
  computeCampaignZones,
  tallyZones,
  zoneWindow,
} from "@/lib/media-buying/zones";
import { computeBenchmarks } from "@/lib/media-buying/benchmarks";
import { computeMovers, computeWeekOverWeek } from "@/lib/media-buying/history";
import { computeExceptions } from "@/lib/media-buying/exceptions";
import {
  computeBuyerScorecard,
  computeDepartmentBreakdown,
  computePortfolioHealth,
} from "@/lib/media-buying/rollups";
import { computeHubSeries } from "@/lib/media-buying/hub-series";

const VALID_WINDOWS = new Set([7, 14, 30]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const winParam = Number(url.searchParams.get("window") ?? ZONE_ROAS_WINDOW_DAYS);
  const windowDays = VALID_WINDOWS.has(winParam) ? winParam : ZONE_ROAS_WINDOW_DAYS;

  try {
    const [stores, campaigns] = await Promise.all([
      computeStoreZones(supabase, windowDays),
      computeCampaignZones(supabase, { days: windowDays }),
    ]);
    const activeConfiguredStores = stores.filter((s) => s.configured && s.is_active);
    const benchmarks = computeBenchmarks(activeConfiguredStores);
    const [movers, wow, exceptions, series] = await Promise.all([
      computeMovers(supabase, activeConfiguredStores),
      computeWeekOverWeek(supabase, activeConfiguredStores, windowDays),
      computeExceptions(supabase, activeConfiguredStores),
      // Always pull 30 days for the analytics layer (weekly comparison and
      // the L7/L14/L30 window switcher on the company overview). The zone
      // engine still uses ZONE_ROAS_WINDOW_DAYS via computeStoreZones.
      computeHubSeries(supabase, activeConfiguredStores, 30),
    ]);
    const buyer_scorecard = computeBuyerScorecard(activeConfiguredStores, wow.byStore);
    const department_breakdown = computeDepartmentBreakdown(
      activeConfiguredStores,
      wow.byStore
    );
    const portfolio_health = computePortfolioHealth(
      activeConfiguredStores,
      wow.byStore
    );

    return NextResponse.json({
      stores,
      campaigns,
      zone_tally: {
        stores: tallyZones(activeConfiguredStores),
        campaigns: tallyZones(campaigns),
      },
      buyer_scorecard,
      department_breakdown,
      portfolio_health,
      benchmarks,
      movers,
      exceptions,
      wow,
      series,
      meta: {
        window: zoneWindow(windowDays),
        window_days: windowDays,
        benchmark_windows: {
          short: BENCHMARK_WINDOW_DAYS_SHORT,
          long: BENCHMARK_WINDOW_DAYS_LONG,
        },
        benchmark_min_stores: BENCHMARK_MIN_STORES,
        default_zone_thresholds: DEFAULT_ZONE_THRESHOLDS,
        default_green_revenue_weekly_floor: DEFAULT_GREEN_REVENUE_WEEKLY_FLOOR,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
