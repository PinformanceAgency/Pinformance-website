/**
 * Task 4 — benchmarks. Aggregates ROAS, CPM, CPC, CTR, CPA per niche and per
 * country from the configured-store set so each figure in the hub can be
 * shown next to its relevant peer average.
 *
 * Guard: any niche/country with fewer than BENCHMARK_MIN_STORES stores in the
 * group is marked `sufficient=false` and its averages returned as null.
 * The UI shows an "insufficient data" pill instead of a noisy mean.
 */
import { BENCHMARK_MIN_STORES } from "./config";
import type { StoreZoneRow } from "./zones";

export interface BenchmarkStats {
  n: number;
  sufficient: boolean;
  roas: number | null;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  cpa: number | null;
}

export interface Benchmarks {
  byNiche: Record<string, BenchmarkStats>;
  byCountry: Record<string, BenchmarkStats>;
  overall: BenchmarkStats;
}

function averageStats(rows: StoreZoneRow[]): BenchmarkStats {
  const n = rows.length;
  const sufficient = n >= BENCHMARK_MIN_STORES;
  if (!sufficient) {
    return { n, sufficient, roas: null, cpm: null, cpc: null, ctr: null, cpa: null };
  }
  // Weighted-by-spend for ROAS/CPM/CPC/CTR/CPA — a $10 store shouldn't count
  // as much as a $10,000 store in the average.
  let spend = 0,
    revenue = 0,
    impressions = 0,
    clicks = 0,
    conversions = 0;
  for (const r of rows) {
    spend += r.spend;
    revenue += r.revenue;
    impressions += r.impressions;
    clicks += r.clicks;
    conversions += r.conversions;
  }
  const roas = spend > 0 ? revenue / spend : null;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : null;
  const cpc = clicks > 0 ? spend / clicks : null;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;
  const cpa = conversions > 0 ? spend / conversions : null;
  return { n, sufficient, roas, cpm, cpc, ctr, cpa };
}

export function computeBenchmarks(stores: StoreZoneRow[]): Benchmarks {
  const byNiche: Record<string, StoreZoneRow[]> = {};
  const byCountry: Record<string, StoreZoneRow[]> = {};
  for (const s of stores) {
    if (!s.spend) continue; // no signal, skip so it doesn't drag averages
    if (s.niche) (byNiche[s.niche] ??= []).push(s);
    // Multi-country stores contribute to each country's peer average — a
    // store running in both NL and BE lifts both benchmarks equally.
    const countryList =
      s.countries && s.countries.length > 0 ? s.countries : s.country ? [s.country] : [];
    for (const c of countryList) {
      (byCountry[c] ??= []).push(s);
    }
  }
  const nicheStats: Record<string, BenchmarkStats> = {};
  for (const k of Object.keys(byNiche)) nicheStats[k] = averageStats(byNiche[k]);
  const countryStats: Record<string, BenchmarkStats> = {};
  for (const k of Object.keys(byCountry)) countryStats[k] = averageStats(byCountry[k]);
  return {
    byNiche: nicheStats,
    byCountry: countryStats,
    overall: averageStats(stores.filter((s) => s.spend > 0)),
  };
}

/** Given a store row and the computed benchmarks, return the relevant peer
 *  averages (niche + country + overall) and a "vs" percentage for ROAS. */
export function benchmarksFor(
  store: StoreZoneRow,
  b: Benchmarks
): {
  niche: BenchmarkStats | null;
  country: BenchmarkStats | null;
  overall: BenchmarkStats;
  roasVsNichePct: number | null;
  roasVsCountryPct: number | null;
} {
  const niche = store.niche ? b.byNiche[store.niche] ?? null : null;
  // For multi-country stores show the peer average of the primary market
  // (first in the countries list) so the deep-dive stays a single number.
  const primaryCountry =
    store.countries && store.countries.length > 0 ? store.countries[0] : store.country;
  const country = primaryCountry ? b.byCountry[primaryCountry] ?? null : null;
  const roasVsNichePct =
    niche?.roas && store.roas ? ((store.roas - niche.roas) / niche.roas) * 100 : null;
  const roasVsCountryPct =
    country?.roas && store.roas ? ((store.roas - country.roas) / country.roas) * 100 : null;
  return { niche, country, overall: b.overall, roasVsNichePct, roasVsCountryPct };
}
