/**
 * GET /api/team-activity
 *
 * Manager view. Returns the last 8 weeks of team output: campaigns launched
 * + paused per week (paid), boards + pins created per week (organic), each
 * broken down per media_buyer.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeTeamActivity } from "@/lib/media-buying/team-activity";

// Compute bypasses PostgREST and hits Postgres directly via DATABASE_URL,
// but the per-org LAG() sweep can still take up to ~10s for the biggest
// advertiser. Give the function a comfortable ceiling.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const data = await computeTeamActivity();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
