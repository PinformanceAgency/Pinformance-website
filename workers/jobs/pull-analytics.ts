import type { Job } from "bullmq";
import { createAdminClient } from "../../src/lib/supabase/admin";
import { decrypt } from "../../src/lib/encryption";
import { PinterestClient } from "../../src/lib/pinterest/client";
import { subDays, format } from "date-fns";

interface PullAnalyticsData {
  orgId: string;
  days?: number;
}

export async function processPullAnalytics(job: Job<PullAnalyticsData>) {
  const { orgId, days = 30 } = job.data;
  const supabase = createAdminClient();

  // Load org token
  const { data: org } = await supabase
    .from("organizations")
    .select("id, pinterest_token_encrypted")
    .eq("id", orgId)
    .single();

  if (!org?.pinterest_token_encrypted) {
    throw new Error(`No Pinterest token for org ${orgId}`);
  }

  const accessToken = decrypt(org.pinterest_token_encrypted);
  const client = new PinterestClient(accessToken);

  // Get all posted pins from last N days
  const cutoff = format(subDays(new Date(), days), "yyyy-MM-dd");
  const { data: pins } = await supabase
    .from("pins")
    .select("id, pinterest_pin_id")
    .eq("org_id", orgId)
    .eq("status", "posted")
    .not("pinterest_pin_id", "is", null)
    .gte("posted_at", cutoff);

  if (!pins?.length) {
    console.log(`No posted pins for org ${orgId} in last ${days} days`);
    return { analyzed: 0 };
  }

  const startDate = cutoff;
  const endDate = format(new Date(), "yyyy-MM-dd");
  let upserted = 0;

  // Process pins in batches to respect rate limits
  for (const pin of pins) {
    try {
      const analytics = await client.getPinAnalytics(
        pin.pinterest_pin_id!,
        startDate,
        endDate
      );

      // Pinterest returns daily breakdown — upsert each day
      if (analytics && typeof analytics === "object") {
        const dailyData = Array.isArray(analytics) ? analytics : [analytics];

        for (const day of dailyData) {
          const metrics = day.metrics || day;
          await supabase.from("pin_analytics").upsert(
            {
              pin_id: pin.id,
              org_id: orgId,
              date: day.date || endDate,
              impressions: metrics.IMPRESSION || 0,
              saves: metrics.SAVE || 0,
              pin_clicks: metrics.PIN_CLICK || 0,
              outbound_clicks: metrics.OUTBOUND_CLICK || 0,
              video_views: metrics.VIDEO_V50_WATCH_TIME || 0,
            },
            { onConflict: "pin_id,date" }
          );
          upserted++;
        }
      }

      // Small delay between API calls
      await new Promise((r) => setTimeout(r, 200));
    } catch (error) {
      console.error(`Failed to pull analytics for pin ${pin.pinterest_pin_id}:`, error);
    }
  }

  return { pinsAnalyzed: pins.length, rowsUpserted: upserted };
}
