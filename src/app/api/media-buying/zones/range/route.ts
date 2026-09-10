/**
 * GET /api/media-buying/zones/range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per-store zone + totals over a period the user picked themselves — the
 * custom-range tab on the Zones page. Everything else that page needs
 * (department, media buyer, filters) already comes from /api/media-buying/hub,
 * so this returns only what the period changes and the UI joins the two on
 * org_id.
 *
 * Deliberately not a parameter on /api/media-buying/hub: that endpoint
 * recomputes campaigns, benchmarks, movers, exceptions and 30 days of series
 * on every call, none of which changes when you drag a date. Changing the
 * range should cost one query, not the whole hub.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStoreZonesForRange } from "@/lib/media-buying/zones";
import { parseZoneRange } from "@/lib/media-buying/range-params";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = parseZoneRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
    new Date().toISOString().slice(0, 10)
  );
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const rows = await computeStoreZonesForRange(supabase, parsed.from, parsed.to);
    return NextResponse.json({
      rows,
      meta: {
        from: parsed.from,
        to: parsed.to,
        days: parsed.days,
        includes_today: parsed.includes_today,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
