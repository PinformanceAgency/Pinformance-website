import { NextResponse } from "next/server";
import { saveGoodFit, saveRedFlags, saveVerdict } from "@/lib/organic/viability";
import type { ViabilityVerdict } from "@/lib/organic/types";

export const runtime = "nodejs";

interface Body {
  section: "good_fit" | "red_flags" | "verdict";
  time_spent_min: number;
  notes?: string | null;
  // section=good_fit
  visual_first?: boolean;
  more_than_5_products?: boolean;
  url_volume?: boolean;
  high_aov?: boolean;
  existing_assets?: boolean;
  longterm_mindset?: boolean;
  // section=red_flags
  rf_technical_b2b?: boolean;
  rf_local_only?: boolean;
  rf_single_landing?: boolean;
  rf_needs_sales_now?: boolean;
  rf_low_effort_ds?: boolean;
  rf_restricted_niche?: boolean;
  // section=verdict
  verdict?: ViabilityVerdict;
  rationale?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const body = (await req.json()) as Body;

  if (!(body.time_spent_min > 0)) {
    return NextResponse.json({ error: "time_spent_min (positive) required" }, { status: 400 });
  }

  try {
    let recomputed = 0;
    if (body.section === "good_fit") {
      recomputed = await saveGoodFit(orgId, {
        visual_first: !!body.visual_first,
        more_than_5_products: !!body.more_than_5_products,
        url_volume: !!body.url_volume,
        high_aov: !!body.high_aov,
        existing_assets: !!body.existing_assets,
        longterm_mindset: !!body.longterm_mindset,
        time_spent_min: body.time_spent_min,
        notes: body.notes ?? null,
      });
    } else if (body.section === "red_flags") {
      recomputed = await saveRedFlags(orgId, {
        rf_technical_b2b: !!body.rf_technical_b2b,
        rf_local_only: !!body.rf_local_only,
        rf_single_landing: !!body.rf_single_landing,
        rf_needs_sales_now: !!body.rf_needs_sales_now,
        rf_low_effort_ds: !!body.rf_low_effort_ds,
        rf_restricted_niche: !!body.rf_restricted_niche,
        time_spent_min: body.time_spent_min,
        notes: body.notes ?? null,
      });
    } else if (body.section === "verdict") {
      if (!body.verdict) {
        return NextResponse.json({ error: "verdict is required" }, { status: 400 });
      }
      if (!body.rationale?.trim()) {
        return NextResponse.json({ error: "rationale is required" }, { status: 400 });
      }
      recomputed = await saveVerdict(orgId, {
        verdict: body.verdict,
        rationale: body.rationale,
        time_spent_min: body.time_spent_min,
        notes: body.notes ?? null,
      });
    } else {
      return NextResponse.json({ error: "invalid section" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, recomputed });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
