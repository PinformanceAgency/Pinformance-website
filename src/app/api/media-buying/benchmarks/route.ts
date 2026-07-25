/**
 * GET /api/media-buying/benchmarks
 *
 * Query params:
 *   department, niche, country, media_buyer, invoicing_model — optional filters
 *   kpi        — one of roas/cpm/cpc/ctr/cpa/spend/revenue/conversions
 *   days       — window size (default 30, max 90)
 *
 * Returns the aggregate for that filter + KPI, distribution, daily series,
 * and per-store contributions.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  BENCHMARK_KPIS,
  computeBenchmark,
  type BenchmarkKpi,
} from "@/lib/media-buying/benchmark-query";

const VALID_KPIS = new Set(BENCHMARK_KPIS.map((k) => k.key));

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const kpiParam = searchParams.get("kpi") ?? "roas";
  const kpi: BenchmarkKpi = VALID_KPIS.has(kpiParam as BenchmarkKpi)
    ? (kpiParam as BenchmarkKpi)
    : "roas";
  const days = Number(searchParams.get("days") ?? 30);

  try {
    const rawInvoicing = searchParams.get("invoicing_model") || null;
    const invoicing_model =
      rawInvoicing === "revenue_fee" || rawInvoicing === "spend_fee"
        ? rawInvoicing
        : null;
    const result = await computeBenchmark(
      supabase,
      {
        department: searchParams.get("department") || null,
        niche: searchParams.get("niche") || null,
        country: searchParams.get("country") || null,
        media_buyer: searchParams.get("media_buyer") || null,
        invoicing_model,
        days,
      },
      kpi
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
