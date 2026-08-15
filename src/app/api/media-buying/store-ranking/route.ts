/**
 * GET /api/media-buying/store-ranking?days=N
 *
 * Powers the Store Ranking page — a scanning tool for the media buying team
 * to see all configured stores ranked by zone + ROAS for a selectable window
 * (yesterday, last 3d, last 7d, last 14d). Trimmed down from the main hub
 * response so the page is fast and holds only what the ranking table needs.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeStoreZones } from "@/lib/media-buying/zones";

const VALID_WINDOWS = new Set([1, 3, 7, 14]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const winParam = Number(url.searchParams.get("days") ?? 7);
  const days = VALID_WINDOWS.has(winParam) ? winParam : 7;

  try {
    const stores = await computeStoreZones(supabase, days);
    // Only include configured, active stores — this view is for scanning
    // live-managed stores, not onboarding/inactive ones.
    const rows = stores
      .filter((s) => s.configured && s.is_active)
      .map((s) => ({
        org_id: s.org_id,
        store_name: s.store_name,
        media_buyer: s.media_buyer,
        department: s.department,
        currency: s.currency,
        zone: s.zone,
        roas: s.roas,
        spend: s.spend,
        revenue: s.revenue,
        breakeven_roas: s.breakeven_roas,
        invoice_roas: s.invoice_roas,
      }));

    return NextResponse.json({ days, stores: rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
