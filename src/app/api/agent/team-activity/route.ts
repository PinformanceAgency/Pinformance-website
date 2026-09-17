/**
 * GET /api/agent/team-activity — what the buyers actually did, per week.
 *
 * Read from `team_activity_cache`, which `/api/cron/refresh-team-activity`
 * rewrites every 6 hours. Deliberately the cache and not a fresh
 * computation: the underlying RPCs sweep LAG() over ~140k campaign snapshots
 * and take long enough that they have their own 120s statement timeout. An
 * agent asking a question in Slack should not be able to start that sweep,
 * and `refreshed_at` tells it exactly how old the answer is.
 *
 * A cold cache computes once inline — that is `readCachedTeamActivity()`'s
 * own behaviour and it writes the result back, so it happens at most once.
 */
import { NextRequest } from "next/server";
import { requireAgentKey, agentJson, agentError } from "@/lib/agent/auth";
import { readCachedTeamActivity } from "@/lib/media-buying/team-activity";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = requireAgentKey(request);
  if (!auth.ok) return auth.response;

  try {
    const { data, refreshed_at } = await readCachedTeamActivity();
    return agentJson({
      refreshed_at,
      ...data,
      note:
        "Windows are rolling 7-day periods ending today, oldest first. " +
        "`boards_created` excludes boards imported from Pinterest during onboarding.",
    });
  } catch (err) {
    console.error("[agent/team-activity]", err);
    return agentError(
      err instanceof Error ? err.message : "Could not read team activity",
      500
    );
  }
}
