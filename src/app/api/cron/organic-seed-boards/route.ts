/**
 * P3.3.7 — the board-warming cron.
 *
 * Every hour of the working day, for every store in the organic workflow,
 * save ONE approved seed pin onto the board that needs it most
 * (`seedNextPin()`), up to SEEDS_PER_DAY a day per store. Twelve runs a day
 * against a limit of ten means a store that had a rate limit in the morning
 * still reaches its ten, and nobody's account gets ten saves in one minute.
 *
 * Board warming is the method's (module 2): a new board stays private, gets
 * 10–15 of the client's own pins, and goes public at ten — which this cron
 * does on Pinterest the moment a board gets there. What it saves is decided
 * by a person in P3.3.6; nothing here picks pins.
 *
 * Failures are reported the way the other organic crons do it: a dead token
 * needs a person and is reported apart; a pin Pinterest refused is marked
 * FAILED in the plan and the next one is tried.
 */
import { NextRequest, NextResponse } from "next/server";
import { organicPool } from "@/lib/organic/db";
import { seedNextPin, syncBoardsWithPinterest } from "@/lib/organic/phase3";
import { alertCronFailure } from "@/lib/alerts";
import { PinterestAuthError } from "@/lib/pinterest/for-org";

export const maxDuration = 300;

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
  const onlyOrg = request.nextUrl.searchParams.get("org") ?? undefined;

  try {
    // Only stores with approved pins waiting on a board that exists — the
    // rest have nothing to do, and asking Pinterest for them would be noise.
    const orgs = await organicPool().query<{ org_id: string; name: string }>(
      `SELECT DISTINCT sp.org_id::text, o.name
         FROM organic.seed_plan sp
         JOIN organic.client_settings cs ON cs.org_id = sp.org_id
         JOIN public.organizations o ON o.id = sp.org_id
         JOIN organic.boards b ON b.id = sp.board_id
        WHERE sp.status = 'APPROVED' AND b.pinterest_board_id IS NOT NULL
          AND ($1::uuid IS NULL OR sp.org_id = $1::uuid)
        ORDER BY o.name`,
      [onlyOrg ?? null]
    );

    let saved = 0, wentPublic = 0;
    const perStore: Array<Record<string, unknown>> = [];
    const noToken: string[] = [];
    const failedPins: string[] = [];
    const notReached: string[] = [];

    for (const o of orgs.rows) {
      if (Date.now() - started > RUN_BUDGET_MS) { notReached.push(o.name); continue; }
      try {
        const r = await seedNextPin(o.org_id);
        saved += r.saved;
        if ("went_public" in r && r.went_public) wentPublic++;
        for (const f of r.failed ?? []) failedPins.push(`${o.name} — ${f}`);
        perStore.push({ store: o.name, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof PinterestAuthError || /Pinterest API error 401/.test(msg)) noToken.push(`${o.name}: ${msg.slice(0, 160)}`);
        else perStore.push({ store: o.name, error: msg.slice(0, 300) });
      }
    }

    // Once a day (the first run, or ?sync=1): reconcile every store that has
    // a hidden board the method built. seedNextPin() only looks at the board
    // it just saved to, and a board somebody warmed by hand with the website
    // widget would otherwise sit at eleven pins, still hidden, for ever.
    const swept: Array<Record<string, unknown>> = [];
    if (new Date().getUTCHours() === 6 || request.nextUrl.searchParams.get("sync") === "1") {
      const hidden = await organicPool().query<{ org_id: string; name: string }>(
        `SELECT DISTINCT b.org_id::text, o.name
           FROM organic.boards b
           JOIN organic.client_settings cs ON cs.org_id = b.org_id
           JOIN public.organizations o ON o.id = b.org_id
          WHERE b.pinterest_board_id IS NOT NULL
            AND b.origin IS DISTINCT FROM 'MIGRATED'::organic.board_origin
            AND b.status IN ('SECRET'::organic.board_status, 'PROTECTED'::organic.board_status)
            AND ($1::uuid IS NULL OR b.org_id = $1::uuid)`,
        [onlyOrg ?? null]
      );
      for (const o of hidden.rows) {
        if (Date.now() - started > RUN_BUDGET_MS) { notReached.push(`${o.name} (sync)`); continue; }
        try {
          const r = await syncBoardsWithPinterest(o.org_id);
          wentPublic += r.flipped;
          if (r.flipped || r.corrected || r.refused.length) swept.push({ store: o.name, ...r });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (e instanceof PinterestAuthError || /Pinterest API error 401/.test(msg)) noToken.push(`${o.name}: ${msg.slice(0, 160)}`);
          else swept.push({ store: o.name, error: msg.slice(0, 300) });
        }
      }
    }

    console.log(
      `[organic-seed-boards] EINDCONTROLE: ${orgs.rowCount} store(s) met werk, ` +
      `${saved} pin(s) opgeslagen, ${wentPublic} board(s) publiek, ${failedPins.length} geweigerd, ` +
      `${noToken.length} zonder token, ${notReached.length} niet bereikt`
    );

    if (noToken.length > 0) {
      await alertCronFailure({
        cron: "organic-seed-boards",
        level: "attention",
        message: `Board warming staat stil voor ${noToken.length} store(s) zonder werkend Pinterest-token: ${noToken.join("; ")}`,
      });
    }

    return NextResponse.json({
      ok: true, stores_with_work: orgs.rowCount, saved, went_public: wentPublic,
      failed_pins: failedPins, no_token: noToken, not_reached: notReached,
      per_store: perStore, swept, ms: Date.now() - started,
    });
  } catch (e) {
    await alertCronFailure({
      cron: "organic-seed-boards",
      message: "De run is omgevallen; er is dit uur niets op de boards gezet.",
      error: e,
    });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
