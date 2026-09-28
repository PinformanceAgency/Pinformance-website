/**
 * GET /api/media-buying/store-ranking[?week=YYYY-MM-DD | ?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Powers the Store Ranking page: per store the delivery-meeting view — the
 * last full Mon–Sun week against the one before, and month to date up to the
 * day before yesterday. `week` picks an older week (any date inside it);
 * `from` + `to` switch to a custom range against the period before it.
 * See lib/media-buying/store-ranking.ts for the rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeStoreRanking,
  storeRankingPeriods,
  storeRankingRangePeriods,
} from "@/lib/media-buying/store-ranking";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  let periods;
  try {
    periods = sp.get("from") && sp.get("to")
      ? storeRankingRangePeriods(sp.get("from")!, sp.get("to")!)
      : storeRankingPeriods(sp.get("week"));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const stores = await computeStoreRanking(supabase, periods);
    return NextResponse.json({ periods, stores });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
