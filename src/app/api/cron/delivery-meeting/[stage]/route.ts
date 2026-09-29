/**
 * Delivery meeting — one cron route per stage, all on Tuesday (UTC, see
 * vercel.json). The pipeline is in src/lib/delivery-meeting/pipeline.ts; this
 * is only the cron entry around it.
 *
 *   /api/cron/delivery-meeting/collect   06:00        store list, numbers, logs, to-dos
 *   /api/cron/delivery-meeting/fathom    every 10 min 06:00–07:50   one transcript chunk per step
 *   /api/cron/delivery-meeting/targets   07:30        week targets from the logs
 *   /api/cron/delivery-meeting/compute   08:00        deck data
 *   /api/cron/delivery-meeting/briefs    every 10 min 08:15–08:55   prep text, six stores per step
 *   /api/cron/delivery-meeting/render    09:00        3 decks + 2 preps → Storage
 *   /api/cron/delivery-meeting/deliver   09:15/30/45  a monday to-do for Tycho per meeting, files attached
 *   /api/cron/delivery-meeting/check     10:30        watchdog: problems → a to-do for Tristan
 *
 * Each route advances every run up to and including its own stage, so a late
 * stage is finished by the next cron rather than skipped for a week; a stage
 * already past is a no-op. Manual:
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" "https://dashboard.pinformance-agency.com/api/cron/delivery-meeting/collect?date=2026-10-06"
 *   ?force=1 on collect throws the day's runs away and starts over.
 *
 * Env: CRON_SECRET, MONDAY_API_TOKEN, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, FATHOM_API_KEY. Loaded lazily (dynamic import), so a
 * missing one is a 500 on this route, never a broken build.
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// Not what we get: ~60 s is (see weekly-update-sync). The pipeline budgets
// itself at RUN_BUDGET_MS and stops cleanly; the next cron carries on.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const STAGES = ["collect", "fathom", "targets", "compute", "briefs", "render", "deliver", "check"] as const;
type RouteStage = (typeof STAGES)[number];

function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (request.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (request.headers.get("x-cron-secret") === secret) return true;
  return false;
}

async function handle(request: NextRequest, stage: string) {
  if (!verifyCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(STAGES as readonly string[]).includes(stage)) {
    return NextResponse.json({ error: `Unknown stage "${stage}"`, stages: STAGES }, { status: 404 });
  }
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const cron = `delivery-meeting-${stage}`;

  try {
    const { advance, check } = await import("@/lib/delivery-meeting/pipeline");
    const { meetingTuesday, weekday } = await import("@/lib/delivery-meeting/util");
    const meetingDate = date ?? meetingTuesday();
    if (weekday(meetingDate) !== 1) {
      return NextResponse.json({ error: `${meetingDate} is not a Tuesday` }, { status: 400 });
    }

    if ((stage as RouteStage) === "check") {
      const r = await check(meetingDate);
      if (!r.ok) {
        const message = `Delivery meeting ${meetingDate} is niet (helemaal) bezorgd:\n${r.problems.join("\n")}`;
        await alertCronFailure({ cron, message });
        // and onto monday, where it is seen: no Slack webhook is configured
        try {
          const { reportProblems } = await import("@/lib/delivery-meeting/pipeline");
          await reportProblems(meetingDate, r.problems);
        } catch (e) {
          console.error("[delivery-meeting] check could not post to monday:", e instanceof Error ? e.message : e);
        }
      }
      return NextResponse.json({ ok: r.ok, meeting_date: meetingDate, problems: r.problems });
    }

    const res = await advance({
      meetingDate,
      ceiling: stage as Exclude<RouteStage, "check">,
      force: stage === "collect" && url.searchParams.get("force") === "1",
    });
    const errors = Object.entries(res.streams).filter(([, s]) => s.status === "error");
    return NextResponse.json({ ok: errors.length === 0, ...res }, { status: 200 });
  } catch (e) {
    await alertCronFailure({
      cron,
      message: "De delivery-meeting-pipeline viel om vóór hij een stream kon oppakken.",
      error: e,
    });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

type Ctx = { params: Promise<{ stage: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(request, (await ctx.params).stage);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return handle(request, (await ctx.params).stage);
}
