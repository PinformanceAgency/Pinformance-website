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
import { alertCronFailure } from "@/lib/alerts";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const data = await computeTeamActivity();
    await writeCachedTeamActivity(data);
    const elapsed = Date.now() - started;
    // Hoe dicht we bij het plafond zitten hoort in het antwoord, niet in
    // iemands hoofd: deze run is op 13-09-2026 stilletjes over de 300s
    // gegaan en heeft daarna vier dagen niets meer geschreven.
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      budget_ms: 300_000,
      weeks: data.weeks.length,
      buyers: data.buyers.length,
      stores: data.stores.length,
    });
  } catch (e) {
    // De cache is het enige wat de pagina ooit leest, en oude cijfers
    // renderen exact zoals verse -- dus een mislukte run die niemand meldt
    // is vier dagen verkeerde cijfers waar niemand aan twijfelt. Awaiten,
    // anders sluit de functie af voordat het bericht weg is.
    await alertCronFailure({
      cron: "refresh-team-activity",
      message:
        `Team Activity is niet ververst na ${((Date.now() - started) / 1000).toFixed(0)}s. ` +
        `De pagina toont nu de vorige cache -- zonder te zeggen hoe oud die is.`,
      error: e,
    });
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
