/**
 * GET /api/team-activity
 *
 * Manager view. Returns the last 8 weeks of team output: campaigns launched
 * + paused per week (paid), boards + pins created per week (organic), each
 * broken down per media_buyer.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readCachedTeamActivity } from "@/lib/media-buying/team-activity";

// Reads a cached snapshot from team_activity_cache — the refresh cron
// (`/api/cron/refresh-team-activity`) recomputes every 6h. This request
// finishes in <100ms; the ceiling only matters on cold-start when the
// cache is empty and we compute inline once.
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { data, refreshed_at } = await readCachedTeamActivity();
    return NextResponse.json({ ...data, refreshed_at });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
