/**
 * P4.4.1 / P4.4.2 — the organic publishing cron.
 *
 * Every fifteen minutes: take the organic pins whose scheduled date has
 * arrived and post them to Pinterest. Mirrors `/api/cron/post-pins`, which
 * does the same job for the main dashboard, but reads and writes the
 * `organic` schema through the direct pg pool — that schema is not exposed
 * via PostgREST, so the Supabase JS client cannot see it.
 *
 * Two things this route deliberately does that a counter cannot:
 *
 *   - A store whose token is dead is reported separately from a store whose
 *     pin failed. The first needs a person and will not fix itself; the
 *     second is a bad pin. Collapsing them into one "errors" number is how
 *     an expired token sits unnoticed until the next cycle also fails.
 *
 *   - The run alerts on `attention`, not `failed`, when some stores went out
 *     and others did not. A "Cron gefaald" heading over a run that published
 *     forty of forty-three pins teaches people to ignore the channel.
 */
import { NextRequest, NextResponse } from "next/server";
import { publishDuePins } from "@/lib/organic/publish";
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

  // `?org=<uuid>` limits the run to one store, `?dry_run=1` posts nothing.
  // Both exist so this can be exercised against a live account without
  // publishing to a client's Pinterest by accident.
  const orgId = request.nextUrl.searchParams.get("org") ?? undefined;
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  try {
    const report = await publishDuePins({ orgId, dryRun });

    if (report.due === 0) {
      console.log("[organic-post-pins] EINDCONTROLE: niets te doen");
      return NextResponse.json({ ok: true, ...report });
    }

    console.log(
      `[organic-post-pins] EINDCONTROLE: ${report.due} due, ` +
      `${report.published} gepubliceerd, ${report.failed} mislukt, ${report.deferred} uitgesteld` +
      (dryRun ? " (dry run)" : "")
    );

    // A dead token is the one outcome that never resolves on its own.
    if (report.reconnect_required.length > 0) {
      await alertCronFailure({
        cron: "organic-post-pins",
        level: "attention",
        message:
          `${report.reconnect_required.length} organic store(s) kunnen niet publiceren ` +
          `omdat de Pinterest-koppeling opnieuw gelegd moet worden: ` +
          report.reconnect_required.map((r) => `${r.org_name} (${r.reason})`).join(", "),
      });
    } else if (report.failed > 0) {
      await alertCronFailure({
        cron: "organic-post-pins",
        level: "attention",
        message: `${report.failed} organic pin(s) zijn definitief mislukt bij het publiceren.`,
      });
    }

    return NextResponse.json({ ok: true, dry_run: dryRun, ...report });
  } catch (e) {
    console.error("[organic-post-pins] run omgevallen:", e);
    await alertCronFailure({
      cron: "organic-post-pins",
      message: "De organic publicatie-cron is omgevallen — er is deze ronde niets gepubliceerd.",
      error: e,
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
