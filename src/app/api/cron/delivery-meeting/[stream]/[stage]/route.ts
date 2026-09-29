/**
 * Delivery meeting cron — /api/cron/delivery-meeting/<stream>/<stage>.
 * The pipeline is in src/lib/delivery-meeting/pipeline.ts; this is only the
 * cron entry around it.
 *
 * Each stream runs on its own day (vercel.json, UTC):
 *
 *   dropship/run    Tue every 10 min 04:00–09:50   delivers Tue 10:00 Amsterdam
 *   dropship/check  Tue 09:30
 *   branded/run     Wed every 10 min 02:00–07:50   delivers Wed 08:00 Amsterdam
 *   branded/check   Wed 07:30
 *
 * Branded runs a day later on purpose: Tycho records the brand deep dives
 * later, often on the Tuesday, and the run only sees what exists when it
 * reads Fathom (Tristan, 29-09-2026).
 *
 * "run" advances everything up to and including deliver, one step at a time
 * within the ~60 s an invocation really gets; the next tick carries on. Deliver
 * waits for the meeting's local hour — the crons fire at both the summer and
 * the winter UTC hour, so there is nothing to change twice a year. A single
 * stage (collect … deliver) can be named instead of "run", and "check" is the
 * watchdog. Manual:
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" \
 *     "https://dashboard.pinformance-agency.com/api/cron/delivery-meeting/branded/run?date=2026-10-06"
 *
 *   ?date=   the meeting TUESDAY of that week (branded too — the runs are keyed on it)
 *   ?force=1 throw that stream's run away and collect again
 *   ?now=1   deliver when done, without waiting for the hour
 *
 * Env: CRON_SECRET, MONDAY_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, FATHOM_API_KEY. Loaded lazily
 * (dynamic import), so a missing one is a 500 on this route, never a broken
 * build.
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// Not what we get: ~60 s is (see weekly-update-sync). The pipeline budgets
// itself and stops cleanly; the next tick carries on.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const STREAMS = ["dropship", "branded"] as const;
const STAGES = ["run", "collect", "fathom", "targets", "compute", "briefs", "render", "deliver", "check"] as const;

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function handle(request: NextRequest, streamParam: string, stageParam: string) {
  if (!verifyCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stream = STREAMS.find((s) => s === streamParam);
  const stage = STAGES.find((s) => s === stageParam);
  if (!stream || !stage) {
    return NextResponse.json({ error: `Unknown path ${streamParam}/${stageParam}`, streams: STREAMS, stages: STAGES }, { status: 404 });
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const cron = `delivery-meeting-${stream}-${stage}`;

  try {
    const { advance, check, reportProblems } = await import("@/lib/delivery-meeting/pipeline");
    const { meetingTuesday, weekday } = await import("@/lib/delivery-meeting/util");
    // on the Wednesday this is still the Tuesday of the same week
    const meetingDate = date ?? meetingTuesday();
    if (weekday(meetingDate) !== 1) {
      return NextResponse.json({ error: `${meetingDate} is not a Tuesday (runs are keyed on the Tuesday)` }, { status: 400 });
    }

    if (stage === "check") {
      const r = await check(meetingDate, [stream]);
      if (!r.ok) {
        await alertCronFailure({ cron, message: `Delivery meeting ${stream} ${meetingDate} is niet bezorgd:\n${r.problems.join("\n")}` });
        // onto monday, where it is seen: no Slack webhook is configured
        try {
          await reportProblems(meetingDate, r.problems);
        } catch (e) {
          console.error("[delivery-meeting] check could not post to monday:", e instanceof Error ? e.message : e);
        }
      }
      return NextResponse.json({ ok: r.ok, stream, meeting_date: meetingDate, problems: r.problems });
    }

    const res = await advance({
      meetingDate,
      streams: [stream],
      ceiling: stage === "run" ? "deliver" : stage,
      force: url.searchParams.get("force") === "1",
      ignoreSchedule: url.searchParams.get("now") === "1",
    });
    const errors = Object.values(res.streams).filter((s) => s.status === "error");
    return NextResponse.json({ ok: errors.length === 0, ...res });
  } catch (e) {
    await alertCronFailure({
      cron,
      message: "De delivery-meeting-pipeline viel om vóór hij de run kon oppakken.",
      error: e,
    });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

type Ctx = { params: Promise<{ stream: string; stage: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { stream, stage } = await ctx.params;
  return handle(request, stream, stage);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  const { stream, stage } = await ctx.params;
  return handle(request, stream, stage);
}
