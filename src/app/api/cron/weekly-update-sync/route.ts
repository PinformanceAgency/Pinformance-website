/**
 * Weekly Update Sync — schrijft de weekcijfers per store naar de subitems van
 * het Monday-bord "Weekly Updates". Draait maandag 12:00 UTC (zie vercel.json).
 *
 * De logica zelf staat in scripts/weekly-update-sync.ts; die is ook los te
 * draaien met `npx tsx`. Deze route is alleen de cron-ingang eromheen.
 *
 * WAAROM EEN DYNAMISCHE IMPORT
 * ----------------------------
 * Het script gooit op modulenivo een Error als MONDAY_API_TOKEN ontbreekt.
 * Bij een statische import zou dat al tijdens de Next-build afgaan en de
 * deploy laten klappen. Met `await import()` gebeurt dat pas bij een request,
 * zodat een ontbrekende env-var een nette 500 op deze route oplevert in plaats
 * van een gebroken build voor alle vier de domeinen.
 *
 * Benodigde env-vars in Vercel (naast CRON_SECRET):
 *   MONDAY_API_TOKEN, DATABASE_URL, ENCRYPTION_KEY
 */
import { NextRequest, NextResponse } from "next/server";
import { alertCronFailure } from "@/lib/alerts";

// LET OP: deze 300 is niet wat je in de praktijk krijgt. Op 17-08-2026 12:00 UTC
// stopte de run na 13 van de 37 stores -- rond een minuut, net als de seed die
// een week eerder na 18 van de 49 stopte. run() rekent daarom met ~60s: stores
// in batches (SYNC_BATCH), de vaste vragen parallel, en de bevroren stores
// eruit vóór de Pinterest-call. Reken hier niet op meer dan die minuut, en zie
// de tweede cron (weekly-update-sync-retry) voor het vangnet eromheen.
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
    // run() logt per store naar console (zichtbaar in de Vercel-logs) en gooit
    // alleen bij een fatale fout, zoals Monday die de token weigert. Fouten per
    // store worden daarbinnen al opgevangen en aan het eind gerapporteerd.
    const summary = await runWeeklySync();

    // Een mislukte store blokkeert de rest niet, dus deze run eindigt gewoon
    // met ok:true. Zonder deze melding stond alleen in de logs dat er stores
    // zijn overgeslagen -- en daar kijkt op maandagmiddag niemand.
    if (summary.failed.length) {
      await alertCronFailure({
        cron: "weekly-update-sync",
        level: "attention",
        message:
          `${summary.failed.length} van de ${summary.failed.length + summary.ok} stores ` +
          `kregen geen cijfers op het Weekly Updates-bord. Handmatig nalopen: ` +
          summary.failed.join(", "),
      });
    }

    // De eindcontrole leest het bord terug. Wat hier in staat is nét niet
    // hetzelfde als `failed`: die stores gooiden een fout, deze zijn zonder
    // klacht leeg gebleven. Precies het gat waar de run van 17-08-2026 in viel,
    // dus dit is een echte storing en geen 'nalopen'.
    if (summary.missing.length) {
      await alertCronFailure({
        cron: "weekly-update-sync",
        message:
          `Eindcontrole: ${summary.missing.length} stores staan na afloop nog ` +
          `zonder cijfers op het Weekly Updates-bord, zonder dat de run een fout ` +
          `meldde: ${summary.missing.join(", ")}`,
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
        "Spend en revenue zijn niet in de weekregels geschreven. Het Weekly " +
        "Updates-bord staat mogelijk zonder cijfers.",
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
