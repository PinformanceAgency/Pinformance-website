/**
 * GET /api/media-buying/store-ranking[?end=YYYY-MM-DD | ?week=YYYY-MM-DD | ?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Powers the Store Ranking page: per store the last seven days ending the day
 * before yesterday against the seven before, and month to date up to the
 * same day against the same days of the month before. `end` picks an older
 * seven days; `week` keeps the Mon–Sun week the delivery deck uses; `from` +
 * `to` switch to a custom range against the period before it.
 * See lib/media-buying/store-ranking.ts for the rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeStoreRanking,
  storeRankingLast7Periods,
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
      : sp.get("week")
      ? storeRankingPeriods(sp.get("week"))
      : storeRankingLast7Periods(sp.get("end"));
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
