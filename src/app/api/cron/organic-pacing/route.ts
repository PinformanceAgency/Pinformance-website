/**
 * The nightly step up the ramp.
 *
 * `scale_up_eligible_date` had been in the schema since the first organic
 * migration and nothing ever acted on it: it was rendered in the fact bar and
 * re-armed by the settings form, and that was all. So every store in the book
 * sat at 1 pin a day — sixteen a month — from onboarding onwards, which is
 * where the method says to *start*, not where it says to stay. Measured
 * 15-09-2026: eight stores, eight targets of 1/day, four of them past the
 * point where the method would have stepped them up.
 *
 * This route is the missing half. It walks the book once a night, raises the
 * target by one wherever the store has earned it, and reports what it did and
 * what it held back — see stepUpDailyTargets() for what "earned it" means and
 * why each condition is there.
 *
 * WHY 03:00 UTC
 * -------------
 * After the watchdog at 02:00, so the watchdog reports on the day that has
 * just finished under the allowance it actually had. Before any of the
 * morning's publishing, so a raised target takes effect the same day. It
 * matters less than the other crons' timing — nothing downstream depends on
 * it inside a day — but a target that moves halfway through a day makes the
 * publishing log harder to read afterwards.
 *
 *     curl -H "x-cron-secret: $CRON_SECRET" \
 *       "https://dashboard.pinformance-agency.com/api/cron/organic-pacing"
 *
 * `?dry_run=1` reports what it would do and writes nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { stepUpDailyTargets } from "@/lib/organic/scale-up";
import { alertCronFailure } from "@/lib/alerts";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorised(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  try {
    const report = await stepUpDailyTargets({ dryRun });
    for (const r of report.raised) {
      console.log(
        `[organic-pacing] ${r.store}: ${r.from} → ${r.to} pins/day ` +
        `(${r.urls_per_month} URLs/month, next step ${r.next_step})`
      );
    }
    console.log(
      `[organic-pacing] EINDCONTROLE: ${report.checked} store(s) bekeken, ` +
      `${report.raised.length} opgehoogd, ${report.held.length} ongewijzigd` +
      (dryRun ? " (dry run)" : "")
    );
    return NextResponse.json({ ok: true, dry_run: dryRun, ...report });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await alertCronFailure({
      cron: "organic-pacing",
      message,
      webhookEnv: "SLACK_ORGANIC_WEBHOOK",
      mention: process.env.SLACK_ORGANIC_MENTION ?? null,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
