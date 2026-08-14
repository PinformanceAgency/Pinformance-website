/**
 * Weekly Update Sync — schrijft de weekcijfers per store naar de subitems van
 * het Monday-bord "Weekly Updates". Draait maandag 14:00 UTC (zie vercel.json).
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

// De run duurde lokaal ~2 minuten over 47 stores (1 Pinterest-call + 1 Monday
// query per store). Zelfde plafond als snapshot-metrics.
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
    await runWeeklySync();
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
