/**
 * FX Rates — haalt de dagelijkse ECB-referentiekoersen op en zet ze in
 * `fx_rates`. Draait dagelijks 06:30 UTC (zie vercel.json).
 *
 * Waarvoor: de zone-drempels zijn euro's (€20.000 omzet per maand, €7.500
 * spend), maar de cijfers van een store staan in de valuta van het Pinterest
 * ad account en blijven dat ook. Deze koersen rekenen de DREMPEL om naar die
 * valuta. Bedragen worden nooit omgerekend. Zie lib/media-buying/fx.ts.
 *
 * WAAROM 06:30 UTC
 * ----------------
 * De ECB publiceert rond 16:00 CET. Een ochtendrun pakt dus de koers van de
 * vorige werkdag, en dat is precies goed: de zones draaien overdag en gebruiken
 * dan een koers die al vaststond. In het weekend publiceert de ECB niet en
 * levert de feed de laatste werkdag; de upsert maakt daar een no-op van.
 *
 * Faalt de feed, dan is dat geen incident: loadFxRates() pakt gewoon de
 * nieuwste rij die al in de tabel staat. Referentiekoersen bewegen tienden van
 * procenten per dag, dus een paar dagen oud is onschadelijk.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshFxRates } from "@/lib/media-buying/fx";

export const maxDuration = 60;

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
    const supabase = createAdminClient();
    const { date, written } = await refreshFxRates(supabase);
    return NextResponse.json({ ok: true, rate_date: date, currencies: written });
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
