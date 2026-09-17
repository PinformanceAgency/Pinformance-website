/**
 * GET /api/agent/zones — the colour, and the numbers it was decided on.
 *
 * Served by `computeStoreZones()`, the same function the Zones page and the
 * Media Buying Hub render from. That is the entire point of proxying this
 * rather than handing an agent SQL access: the zone is not in the database.
 * It is the product of the invoice ROAS, the break-even ROAS, the invoicing
 * model, the euro thresholds converted at the day's ECB rate, and — for a
 * month bucket — the pro-rata share of the month we have data for. An agent
 * re-deriving that from `pinterest_metrics_snapshots` would quote numbers
 * that disagree with the screen the media buyers are looking at, which is
 * worse than having no numbers.
 *
 * Unconfigured stores (no department, no break-even ROAS) are excluded
 * unless asked for: they have no zone, and listing them alongside stores
 * that do reads as a book full of stores with no colour.
 */
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAgentKey, agentJson, agentError } from "@/lib/agent/auth";
import {
  computeStoreZones,
  tallyZones,
  zoneWindow,
  monthBucketKeys,
} from "@/lib/media-buying/zones";
import { ZONE_ROAS_WINDOW_DAYS } from "@/lib/media-buying/config";

export const runtime = "nodejs";
export const maxDuration = 120;

const VALID_WINDOWS = new Set([7, 14, 30]);

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const asked = Number(params.get("window") ?? ZONE_ROAS_WINDOW_DAYS);
  const windowDays = VALID_WINDOWS.has(asked) ? asked : ZONE_ROAS_WINDOW_DAYS;
  const zoneFilter = params.get("zone");
  const buyerFilter = params.get("buyer")?.trim().toLowerCase() || null;
  const includeUnconfigured = params.get("include_unconfigured") === "1";

  try {
    // Service role: this endpoint has its own key and is not a user session,
    // so there is no RLS identity to inherit. The routes here are GET-only,
    // which is what keeps that safe.
    const supabase = createAdminClient();
    const all = await computeStoreZones(supabase, windowDays);

    const stores = all
      .filter((s) => includeUnconfigured || (s.configured && s.is_active))
      .filter((s) => !zoneFilter || s.zone === zoneFilter)
      .filter((s) => !buyerFilter || s.media_buyer === buyerFilter);

    const { start, end } = zoneWindow(windowDays);

    return agentJson({
      window: { days: windowDays, start, end },
      month_buckets: monthBucketKeys(end),
      count: stores.length,
      tally: tallyZones(stores),
      stores,
      note:
        "`spend` and `revenue` are in each store's own `currency` and are never converted. " +
        "`weekly_zones` are oldest-first over the last 4 rolling weeks; `monthly_zones` are the three calendar months in `month_buckets`, oldest first. " +
        "The window ends yesterday, so `mtd` is the month in progress with its floor pro-rated, and `last_month` is the finished month the agency invoices on.",
    });
  } catch (err) {
    console.error("[agent/zones]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not compute zones",
      500
    );
  }
}
