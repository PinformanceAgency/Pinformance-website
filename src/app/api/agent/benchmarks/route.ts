/**
 * GET /api/agent/benchmarks — how a store compares with its peers.
 *
 * `computeBenchmarks()` over the configured, active stores, which is the same
 * cohort and the same maths the Benchmarks page renders. Three cuts: per
 * niche, per country and per store against its own recent history.
 *
 * The one rule worth stating to whoever reads this: a benchmark needs
 * **BENCHMARK_MIN_STORES** peers before it says anything at all. Below that
 * an average is one account's good fortnight wearing the clothes of a
 * finding, and quoting it at a client is how a made-up number ends up in a
 * report. Cohorts under the floor come back with their size so the caller
 * can say "too few stores to compare", never as a figure.
 *
 * Countries are counted per store, and a store running in NL and BE lifts
 * both — that is deliberate, not double counting: it really is a peer in
 * both markets.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAgentKey, agentJson, agentError } from "@/lib/agent/auth";
import { computeStoreZones } from "@/lib/media-buying/zones";
import { computeBenchmarks } from "@/lib/media-buying/benchmarks";
import {
  ZONE_ROAS_WINDOW_DAYS,
  BENCHMARK_MIN_STORES,
  BENCHMARK_WINDOW_DAYS_SHORT,
  BENCHMARK_WINDOW_DAYS_LONG,
} from "@/lib/media-buying/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_WINDOWS = new Set([7, 14, 30]);

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const asked = Number(params.get("window") ?? ZONE_ROAS_WINDOW_DAYS);
  const windowDays = VALID_WINDOWS.has(asked) ? asked : ZONE_ROAS_WINDOW_DAYS;

  try {
    const supabase = createAdminClient();
    const stores = await computeStoreZones(supabase, windowDays);
    const cohort = stores.filter((s) => s.configured && s.is_active);
    const benchmarks = computeBenchmarks(cohort);

    return agentJson({
      window_days: windowDays,
      cohort_size: cohort.length,
      min_stores_for_a_benchmark: BENCHMARK_MIN_STORES,
      benchmark_windows: {
        short_days: BENCHMARK_WINDOW_DAYS_SHORT,
        long_days: BENCHMARK_WINDOW_DAYS_LONG,
      },
      benchmarks,
      note:
        `A cohort of fewer than ${BENCHMARK_MIN_STORES} stores is not a benchmark — report it as "too few stores to compare", never as an average. ` +
        "ROAS and rates compare across stores; amounts do not, because each store's spend and revenue are in its own currency. " +
        "A store running in several countries counts in each of those cohorts.",
    });
  } catch (err) {
    console.error("[agent/benchmarks]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not compute benchmarks",
      500
    );
  }
}
