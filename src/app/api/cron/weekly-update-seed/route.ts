/**
 * Weekly Update Seed — at Monday 01:00 UTC, puts an EMPTY week row on the
 * Monday board "Weekly Updates" for every active store (see vercel.json).
 *
 * The media buyers write their zone and text update into it in the morning;
 * at 12:00 UTC /api/cron/weekly-update-sync fills the same rows with spend
 * and revenue. Without this run an early buyer had to create the row first.
 *
 * The logic lives in scripts/weekly-update-sync.ts (section 5, runSeed), which
 * can also be run on its own with `npx tsx scripts/weekly-update-sync.ts seed`.
 * This route is only the cron entrance around it.
 *
 * WHY A DYNAMIC IMPORT
 * --------------------
 * Same reason as the sync route: the script throws at module level when
 * MONDAY_API_TOKEN is missing. Importing it statically would fire that during
 * the Next build and break the deploy for all four domains.
 *
 * Env vars needed in Vercel (besides CRON_SECRET):
 *   MONDAY_API_TOKEN
 * Deliberately no DATABASE_URL or ENCRYPTION_KEY: this run makes no Pinterest
 * call and no DB query, so it cannot fall over on a dead token.
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// Lighter than the sync: 2 Monday calls per store, no Pinterest. Set generously
// so growth of the store list does not run into it.
export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function handle(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const started = Date.now();
    const { runSeed } = await import(
      "../../../../../scripts/weekly-update-sync"
    );
    // runSeed() logs per store to the console (visible in the Vercel logs) and
    // throws only on a fatal error, such as Monday refusing the token.
    // Per-store failures are caught inside and reported at the end.
    await runSeed();
    return NextResponse.json({ ok: true, elapsed_ms: Date.now() - started });
  } catch (e) {
    // runSeed() throws when, among other things, the end check finds stores
    // left without a week row -- exactly the case that went unnoticed on
    // 17-08-2026. Awaited, so the message is out of the door before the
    // function shuts down.
    await alertCronFailure({
      cron: "weekly-update-seed",
      message:
        "The empty week rows were not created, or not all of them. Media " +
        "buyers may be missing their row on the Weekly Updates board.",
      error: e,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}
export async function POST(request: NextRequest) {
  return handle(request);
}
