/**
 * Recompute the Team Activity snapshot and cache it in team_activity_cache.
 * Called by the Vercel cron every 6h. The API endpoint reads the cached
 * blob so page loads finish in <100ms even for the biggest advertisers.
 *
 * Vercel cron runtime has a 300s ceiling (Pro plan) — plenty for the
 * per-org LAG() aggregation (~30-60s total wall clock).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  computeTeamActivity,
  writeCachedTeamActivity,
} from "@/lib/media-buying/team-activity";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.CRON_SET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const started = Date.now();
    const data = await computeTeamActivity();
    await writeCachedTeamActivity(data);
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      weeks: data.weeks.length,
      buyers: data.buyers.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}
export async function POST(request: NextRequest) {
  return run(request);
}
