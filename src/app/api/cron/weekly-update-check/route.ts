/**
 * Weekly Update Check — checks whether the week rows on the Monday board
 * "Weekly Updates" are actually filled. Runs Monday 13:00 UTC, an hour after
 * the sync (see vercel.json). Writes nothing.
 *
 * WHY THIS IS SEPARATE FROM THE SYNC
 * ----------------------------------
 * The sync checks itself at the end of its own run. That does not help in the
 * case we want to catch: on 17-08-2026 that run was cut off after 13 of 37
 * stores, and then its own end check -- and so the Slack message -- is never
 * reached. The only signal was a log that stopped, and nobody is watching
 * those on a Monday afternoon.
 *
 * This route runs in its own invocation and makes four calls: the client board
 * and three pages of subitems. That finishes in seconds, so it cannot run into
 * the same time limit as the run it is checking.
 *
 * One Slack message goes out if something is missing, and nothing otherwise --
 * a channel that says "all good" every Monday stops being read after three
 * weeks.
 *
 * Env vars needed in Vercel (besides CRON_SECRET):
 *   MONDAY_API_TOKEN, SLACK_ALERT_WEBHOOK
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// Four reads. Well inside any limit; this is here only so a slow Monday
// response is not cut off halfway.
export const maxDuration = 60;

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
    const { checkWeekFilled } = await import(
      "../../../../../scripts/weekly-update-sync"
    );
    const check = await checkWeekFilled();

    // Two different failures, deliberately in one message: if the seed did not
    // finish then the rows themselves are missing, and there is little point
    // also reporting that they hold no figures.
    const problems: string[] = [];
    if (check.noRow.length) {
      problems.push(
        `${check.noRow.length} stores have no week row at all for ` +
          `${check.week} -- either the 01:00 seed did not finish, or they were ` +
          `onboarded after it ran: ${check.noRow.join(", ")}`
      );
    }
    if (check.missing.length) {
      problems.push(
        `${check.missing.length} connected stores have no figures for ` +
          `${check.week}: ${check.missing.join(", ")}`
      );
    }

    if (problems.length) {
      // The manual stores are listed only when a message is going out anyway:
      // their being empty is normal, but if somebody is about to go and check,
      // it helps to have them in the same message.
      if (check.manual.length) {
        problems.push(
          `Still to be filled in by hand (not connected): ${check.manual.join(", ")}`
        );
      }
      await alertCronFailure({
        cron: "weekly-update-check",
        message: problems.join("\n"),
      });
    }

    return NextResponse.json({
      ok: problems.length === 0,
      elapsed_ms: Date.now() - started,
      week: check.week,
      stores_total: check.total,
      stores_missing: check.missing,
      stores_without_row: check.noRow,
      stores_manual: check.manual,
    });
  } catch (e) {
    // This reports itself too: a check that falls over is a check you do not
    // have.
    await alertCronFailure({
      cron: "weekly-update-check",
      message:
        "The check on the Weekly Updates board did not run. Whether last " +
        "week's figures are on it is now unknown -- go and look at the board.",
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
