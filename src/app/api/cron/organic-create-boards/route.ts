/**
 * P3.3.5 — the board-creation cron.
 *
 * Once a day, for every store in the organic workflow, create the boards
 * whose planned creation date has arrived. That is the whole point of the
 * dashboard: the architecture is designed once, the boards appear on the
 * account by themselves, and the waterfall schedules pins onto them. Until
 * 10-09-2026 this only ever ran when somebody pressed "create boards today"
 * on one store — which for fifty stores means fifty clicks a day, every day,
 * for a job the method already has a schedule for.
 *
 * The pace is NOT a property of this cron. `createBoardsToday()` takes at
 * most three per store per run and `check_board_pace()` refuses a fourth in
 * the same day at the database level, because a burst of new boards is one of
 * the things Pinterest flags on a young account (module 4). Running this
 * hourly instead of daily would therefore change nothing — and the schedule
 * itself is what spreads the work.
 *
 * Two failures are reported apart, for the same reason the pin cron does it:
 * a store with no Pinterest token needs a person and will not fix itself,
 * while a board that failed to create is a board. Collapsing them into one
 * "errors" number is how a dead token sits unnoticed for a week.
 */
import { NextRequest, NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { createBoardsToday } from "@/lib/organic/phase3";
import { alertCronFailure } from "@/lib/alerts";

export const maxDuration = 300;

/** Stop starting new stores past this, so a slow account cannot cost the run
 *  its tail. Whatever is left is picked up by tomorrow's run — the schedule
 *  has already spread the work over days. */
const RUN_BUDGET_MS = 240_000;

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
  const started = Date.now();
  // `?org=<uuid>` limits the run to one store; `?dry_run=1` writes locally
  // without touching Pinterest, which is what the UI button offers too.
  const onlyOrg = request.nextUrl.searchParams.get("org") ?? undefined;
  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  try {
    const pool = organicPool();
    // Scoped to organic.client_settings, never to organic.boards: that table
    // holds rows for ~50 orgs whose boards were imported by the main
    // dashboard and that never entered the organic workflow.
    const orgs = await pool.query<{ org_id: string; name: string; due: string }>(
      `SELECT cs.org_id::text, o.name,
              (SELECT COUNT(*) FROM organic.boards b
                WHERE b.org_id = cs.org_id
                  AND b.status = 'PLANNED'::organic.board_status
                  AND b.pinterest_board_id IS NULL
                  AND b.origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin
                  AND b.planned_creation_date <= current_date)::text AS due
         FROM organic.client_settings cs
         JOIN public.organizations o ON o.id = cs.org_id
        WHERE ($1::uuid IS NULL OR cs.org_id = $1::uuid)
        ORDER BY o.name`,
      [onlyOrg ?? null]
    );

    const todo = orgs.rows.filter((o) => Number(o.due) > 0);
    let created = 0, adopted = 0, failed = 0;
    const perStore: Array<Record<string, unknown>> = [];
    const noToken: string[] = [];
    const notReached: string[] = [];

    for (const o of todo) {
      if (Date.now() - started > RUN_BUDGET_MS) { notReached.push(o.name); continue; }
      try {
        // No time is recorded: a cron did the work, and 0 means "not
        // recorded" everywhere in this app since 06-09-2026.
        const r = await createBoardsToday(o.org_id, 0, { dryRun });
        created += r.created;
        adopted += r.adopted;
        failed += r.failed;
        perStore.push({
          store: o.name, due: Number(o.due), created: r.created,
          adopted: r.adopted, failed: r.failed, remaining: r.remaining,
          errors: r.errors.length ? r.errors : undefined,
          unreachable: r.unreachable ?? undefined,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // A missing or dead token is a person's job, not a failed board.
        if (/token/i.test(msg)) noToken.push(`${o.name}: ${msg}`);
        else { failed++; perStore.push({ store: o.name, error: msg }); }
      }
    }

    console.log(
      `[organic-create-boards] EINDCONTROLE: ${todo.length} store(s) met werk, ` +
      `${created} boards aangemaakt, ${adopted} overgenomen, ${failed} mislukt, ` +
      `${noToken.length} zonder token, ${notReached.length} niet bereikt` +
      (dryRun ? " (dry run)" : "")
    );

    if (noToken.length > 0 || failed > 0) {
      await alertCronFailure({
        cron: "organic-create-boards",
        // 'attention', not 'failed': the run finished and most stores were
        // served. A "Cron gefaald" heading over a run that created boards for
        // everyone but one dead token teaches people to ignore the channel.
        level: "attention",
        message:
          `${created} board(s) aangemaakt, maar ${failed} mislukt en ` +
          `${noToken.length} store(s) hebben geen werkend Pinterest-token` +
          (noToken.length ? `: ${noToken.join("; ")}` : ""),
      });
    }

    return NextResponse.json({
      ok: true, dry_run: dryRun,
      stores_with_work: todo.length, created, adopted, failed,
      no_token: noToken, not_reached: notReached,
      per_store: perStore,
      ms: Date.now() - started,
    });
  } catch (e) {
    await alertCronFailure({
      cron: "organic-create-boards",
      message: "De run is omgevallen; er zijn deze dag geen boards aangemaakt.",
      error: e,
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
