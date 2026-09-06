/**
 * P1.2.13 — what Pinterest can tell us about the baseline itself.
 *
 * The task asks for thirteen KPIs over three months and used to hand over
 * thirteen empty boxes, with the store's own Pinterest account connected two
 * screens away. Reported on the Valerie Mason flow test (06-09-2026): "is
 * P1.2.13 something that should be filled in automatically? nothing is
 * loading here."
 *
 * Five of the thirteen come straight from the API. The rest do not exist on
 * any endpoint we can reach — monthly views and profile visits are profile
 * figures in the Pinterest UI, and the audience split lives in Audience
 * Insights — so they stay manual and the form says which is which. A
 * half-filled form that is honest about the half beats a full one that
 * invents the rest.
 *
 * Two caveats that are stated on screen rather than buried here:
 *  - The API applies the ORGANIC content filter but has no equivalent of the
 *    UI's "claimed domain" filter, so figures can sit slightly above what the
 *    task's own filter instructions produce.
 *  - Follower count is today's. Pinterest exposes no history for it, so
 *    followers_start stays empty rather than being guessed backwards.
 */
import { pinterestClientForOrg } from "@/lib/pinterest/for-org";

/** Metrics every business account answers for. Deliberately the same list
 *  analytics-pull.ts uses: one unavailable name 400s the whole request. */
const ACCOUNT_METRICS = [
  "IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK",
  "ENGAGEMENT", "ENGAGEMENT_RATE",
];

export interface BaselineSuggestion {
  measured_from: string;
  measured_to: string;
  /** Keyed by the form's field names, so the UI needs no mapping table. */
  values: Record<string, number>;
  /** Which fields the API cannot answer, and why — rendered as-is. */
  manual: Array<{ key: string; reason: string }>;
  days_counted: number;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pinterest answers `400 code 1 "You can only get data from the last 90
 *  days"` for anything older, so the task's three months is the one thing
 *  this endpoint cannot give. 89 days back from yesterday is the most it
 *  will serve; the form says so rather than quietly reporting a shorter
 *  period as if it were the asked-for one. */
const MAX_WINDOW_DAYS = 89;

export async function pullBaselineSuggestion(
  orgId: string
): Promise<BaselineSuggestion> {
  const to = new Date();
  // Yesterday: realtime numbers move for about a day, and the task itself
  // says to untick realtime.
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - MAX_WINDOW_DAYS);

  const { client } = await pinterestClientForOrg(orgId);
  const res = await client.getUserAccountAnalytics(iso(from), iso(to), ACCOUNT_METRICS);
  const days = res?.all?.daily_metrics ?? [];

  let impressions = 0, saves = 0, outbound = 0, engagements = 0, counted = 0;
  for (const d of days) {
    // Pinterest returns a row per day including days it has no data for.
    const m = d.metrics ?? {};
    if (Object.keys(m).length === 0) continue;
    counted++;
    impressions += Number(m.IMPRESSION ?? 0);
    saves       += Number(m.SAVE ?? 0);
    outbound    += Number(m.OUTBOUND_CLICK ?? 0);
    engagements += Number(m.ENGAGEMENT ?? 0);
  }

  const values: Record<string, number> = {
    impressions, pin_saves: saves, outbound_clicks: outbound, engagements,
  };
  // Derived, not summed: an average of daily rates weights a quiet day the
  // same as a busy one.
  if (impressions > 0) {
    values.engagement_rate = Math.round((engagements / impressions) * 10000) / 100;
  }

  try {
    const user = await client.getUser() as { follower_count?: number };
    if (typeof user.follower_count === "number") values.followers_end = user.follower_count;
  } catch {
    // A missing follower count is not a reason to lose the five figures above.
  }

  return {
    measured_from: iso(from),
    measured_to: iso(to),
    values,
    days_counted: counted,
    manual: [
      { key: "profile_visits", reason: "not on any endpoint — read it from Analytics → Overview" },
      { key: "monthly_views", reason: "profile figure, visible on the profile page only" },
      { key: "followers_start", reason: "Pinterest keeps no follower history" },
      { key: "top_click_pin_clicks", reason: "top-pin figures come from Analytics → Top pins" },
      { key: "top_save_pin_saves", reason: "top-pin figures come from Analytics → Top pins" },
      { key: "audience_top_country_pct", reason: "Audience Insights, not the analytics API" },
      { key: "audience_top_age_bracket", reason: "Audience Insights, not the analytics API" },
    ],
  };
}
