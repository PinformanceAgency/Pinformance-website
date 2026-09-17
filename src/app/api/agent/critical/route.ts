/**
 * GET /api/agent/critical — what needs a person today.
 *
 * The same two computations Critical Attention renders:
 *
 *   exceptions — auto-flag rules over the snapshot history (red streak,
 *                spend drop 7d vs prior 7d, ROAS crash 3d vs prior 7d,
 *                stale account)
 *   movers     — stores whose zone flipped against the previous window,
 *                split into alarms (worse) and recovery (better)
 *
 * Both are computed from the configured, active stores only — an
 * unconfigured store has no zone to streak or flip.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAgentKey, agentJson, agentError } from "@/lib/agent/auth";
import { computeStoreZones } from "@/lib/media-buying/zones";
import { computeExceptions } from "@/lib/media-buying/exceptions";
import { computeMovers } from "@/lib/media-buying/history";
import { ZONE_ROAS_WINDOW_DAYS } from "@/lib/media-buying/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_WINDOWS = new Set([7, 14, 30]);

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const asked = Number(
    new URL(request.url).searchParams.get("window") ?? ZONE_ROAS_WINDOW_DAYS
  );
  const windowDays = VALID_WINDOWS.has(asked) ? asked : ZONE_ROAS_WINDOW_DAYS;

  try {
    const supabase = createAdminClient();
    const stores = await computeStoreZones(supabase, windowDays);
    const live = stores.filter((s) => s.configured && s.is_active);

    const [exceptions, movers] = await Promise.all([
      computeExceptions(supabase, live),
      computeMovers(supabase, live),
    ]);

    return agentJson({
      window_days: windowDays,
      exceptions,
      movers,
      currently_red: live
        .filter((s) => s.zone === "red")
        .map((s) => ({
          org_id: s.org_id,
          store: s.store_name,
          media_buyer: s.media_buyer,
          currency: s.currency,
          spend: s.spend,
          revenue: s.revenue,
          roas: s.roas,
          breakeven_roas: s.breakeven_roas,
          invoice_roas: s.invoice_roas,
        })),
      note:
        "`spend_context` on an exception, and every amount under `currently_red`, is in that store's own currency.",
    });
  } catch (err) {
    console.error("[agent/critical]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not compute critical attention",
      500
    );
  }
}
