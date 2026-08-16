/**
 * Weekly Update Seed — zet maandag 01:00 UTC voor élke actieve store een LEGE
 * weekregel klaar op het Monday-bord "Weekly Updates" (zie vercel.json).
 *
 * De media buyers schrijven daar 's ochtends hun zone en tekstupdate in; om
 * 12:00 UTC vult /api/cron/weekly-update-sync dezelfde regels met spend en
 * revenue. Zonder deze run moest een vroege buyer de regel zelf aanmaken.
 *
 * De logica staat in scripts/weekly-update-sync.ts (sectie 5, runSeed); die is
 * ook los te draaien met `npx tsx scripts/weekly-update-sync.ts seed`. Deze
 * route is alleen de cron-ingang eromheen.
 *
 * WAAROM EEN DYNAMISCHE IMPORT
 * ----------------------------
 * Zelfde reden als bij de sync-route: het script gooit op modulenivo als
 * MONDAY_API_TOKEN ontbreekt. Statisch importeren zou dat tijdens de Next-build
 * laten afgaan en de deploy voor alle vier de domeinen breken.
 *
 * Benodigde env-vars in Vercel (naast CRON_SECRET):
 *   MONDAY_API_TOKEN
 * Bewust géén DATABASE_URL of ENCRYPTION_KEY: deze run doet geen Pinterest-call
 * en geen DB-query, en kan dus niet omvallen op een dood token.
 */
import { NextRequest, NextResponse } from "next/server";

// Lichter dan de sync: 2 Monday-calls per store, geen Pinterest. Ruim genomen
// zodat groei van de storelijst hier niet tegenaan loopt.
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
    const { runSeed } = await import(
      "../../../../../scripts/weekly-update-sync"
    );
    // runSeed() logt per store naar console (zichtbaar in de Vercel-logs) en
    // gooit alleen bij een fatale fout, zoals Monday die de token weigert.
    // Fouten per store worden daarbinnen opgevangen en aan het eind gemeld.
    await runSeed();
    return NextResponse.json({ ok: true, elapsed_ms: Date.now() - started });
  } catch (e) {
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
