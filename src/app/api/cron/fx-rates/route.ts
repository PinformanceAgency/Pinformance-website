/**
 * FX Rates — pulls the daily ECB reference rates and writes them into
 * `fx_rates`. Runs daily at 06:30 UTC (see vercel.json).
 *
 * What for: the zone thresholds are in euros (EUR 20,000 revenue a month,
 * EUR 7,500 spend), but a store's figures are in the currency of its Pinterest
 * ad account and stay that way. These rates convert the THRESHOLD into that
 * currency. Amounts are never converted. See lib/media-buying/fx.ts.
 *
 * WHY 06:30 UTC
 * -------------
 * The ECB publishes around 16:00 CET. A morning run therefore picks up the
 * previous working day's rate, which is exactly right: the zones run during the
 * day and then use a rate that was already fixed. At the weekend the ECB does
 * not publish and the feed returns the last working day; the upsert makes that
 * a no-op.
 *
 * If the feed fails that is not an incident: loadFxRates() simply takes the
 * newest row already in the table. Reference rates move tenths of a percent a
 * day, so a few days old is harmless.
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
