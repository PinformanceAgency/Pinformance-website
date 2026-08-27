/**
 * P5.1.1 — the organic analytics cron.
 *
 * Daily. Re-reads a rolling window rather than pulling only what is new:
 * Pinterest revises recent days for about a day, so a one-shot incremental
 * pull freezes numbers that were still moving. Upserting over the window is
 * what makes the record converge on what Pinterest will eventually agree
 * with.
 *
 * Runs after the main dashboard's own analytics pull (06:00) so the two are
 * not asking Pinterest for the same accounts at the same minute.
 */
import { NextRequest, NextResponse } from "next/server";
import { pullOrganicAnalytics } from "@/lib/organic/analytics-pull";
import { alertCronFailure } from "@/lib/alerts";

export const maxDuration = 300;

function verifyCron(request: NextRequest): boolean {
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return request.headers.get("x-cron-secret") === process.env.CRON_SECRET;
}

export async function GET(request: NextRequest) { return run(request); }
export async function POST(request: NextRequest) { return run(request); }

async function run(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = request.nextUrl.searchParams.get("org") ?? undefined;
  const days = Number(request.nextUrl.searchParams.get("days") ?? 14);
  const months = Number(request.nextUrl.searchParams.get("months") ?? 2);

  try {
    const report = await pullOrganicAnalytics({ orgId, days, months });

    const rows = report.orgs.reduce((t, o) => t + o.days_written, 0);
    console.log(
      `[organic-pull-analytics] EINDCONTROLE: ${report.orgs.length} store(s), ` +
      `${rows} dagrijen, ${report.reconnect_required.length} herkoppelen, ${report.errors.length} fout`
    );

    if (report.reconnect_required.length > 0) {
      await alertCronFailure({
        cron: "organic-pull-analytics",
        level: "attention",
        message:
          `Geen organic-cijfers op te halen voor ${report.reconnect_required.length} store(s) — ` +
          `Pinterest-koppeling opnieuw leggen: ` +
          report.reconnect_required.map((r) => r.org_name).join(", "),
      });
    }
    if (report.errors.length > 0) {
      await alertCronFailure({
        cron: "organic-pull-analytics",
        level: "attention",
        message: `${report.errors.length} store(s) gaven een fout bij het ophalen van organic-analytics.`,
      });
    }

    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("[organic-pull-analytics] run omgevallen:", e);
    await alertCronFailure({
      cron: "organic-pull-analytics",
      message: "De organic analytics-cron is omgevallen — fase 5 draait deze dag op oude cijfers.",
      error: e,
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
