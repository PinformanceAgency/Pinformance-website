/**
 * Weekly Update Sync — writes each store's week figures into the subitems of
 * the Monday board "Weekly Updates". Runs Monday 12:00 UTC (see vercel.json).
 *
 * The logic itself lives in scripts/weekly-update-sync.ts, which can also be
 * run on its own with `npx tsx`. This route is only the cron entrance.
 *
 * WHY A DYNAMIC IMPORT
 * --------------------
 * The script throws at module level when MONDAY_API_TOKEN is missing. With a
 * static import that would fire during the Next build and break the deploy.
 * With `await import()` it happens on a request instead, so a missing env var
 * gives a clean 500 on this route rather than a broken build across all four
 * domains.
 *
 * Env vars needed in Vercel (besides CRON_SECRET):
 *   MONDAY_API_TOKEN, DATABASE_URL, ENCRYPTION_KEY
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// NOTE: this 300 is not what you get in practice. On 17-08-2026 12:00 UTC the
// run stopped after 13 of 37 stores -- around a minute, same as the seed that
// stopped after 18 of 49 a week earlier. run() therefore budgets for ~60s:
// stores in batches (SYNC_BATCH), the fixed queries in parallel, and the frozen
// stores dropped before the Pinterest call. Do not count on more than that
// minute here, and see the second cron (weekly-update-sync-retry) for the
// safety net around it.
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
    const { run: runWeeklySync } = await import(
      "../../../../../scripts/weekly-update-sync"
    );
    // run() logs per store to the console (visible in the Vercel logs) and
    // throws only on a fatal error, such as Monday refusing the token. Per-store
    // failures are caught inside and reported at the end.
    const summary = await runWeeklySync();

    // A failed store does not block the rest, so this run still ends ok:true.
    // Without this message the only record that stores were skipped was in the
    // logs -- and nobody is reading those on a Monday afternoon.
    if (summary.failed.length) {
      await alertCronFailure({
        cron: "weekly-update-sync",
        level: "attention",
        message:
          `${summary.failed.length} of ${summary.failed.length + summary.ok} stores ` +
          `got no figures on the Weekly Updates board. Check by hand: ` +
          summary.failed.join(", "),
      });
    }

    // The end check reads the board back. What lands here is not quite the
    // same as `failed`: those stores threw an error, these went quiet. Exactly
    // the gap the run of 17-08-2026 fell into, so this is a real failure and
    // not a "needs a look".
    if (summary.missing.length) {
      await alertCronFailure({
        cron: "weekly-update-sync",
        message:
          `End check: ${summary.missing.length} stores are still without ` +
          `figures on the Weekly Updates board, without the run reporting any ` +
          `error: ${summary.missing.join(", ")}`,
      });
    }

    return NextResponse.json({
      ok: summary.missing.length === 0,
      elapsed_ms: Date.now() - started,
      stores_ok: summary.ok,
      stores_already_done: summary.alreadyDone.length,
      stores_failed: summary.failed,
      stores_missing: summary.missing,
    });
  } catch (e) {
    await alertCronFailure({
      cron: "weekly-update-sync",
      message:
        "Spend and revenue were not written into the week rows. The Weekly " +
        "Updates board may be sitting without figures.",
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
