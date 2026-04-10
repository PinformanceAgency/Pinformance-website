import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) return true;
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET || process.env.CRON_SET)) return true;
  return false;
}

export async function GET(request: NextRequest) { return handlePullAnalytics(request); }
export async function POST(request: NextRequest) { return handlePullAnalytics(request); }

async function handlePullAnalytics(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, pinterest_access_token_encrypted, pinterest_token_expires_at")
    .not("pinterest_access_token_encrypted", "is", null);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: "No orgs to process", updated: 0 });
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  let totalUpdated = 0;
  const errors: { org_id: string; error: string }[] = [];

  for (const org of orgs) {
    try {
      if (org.pinterest_token_expires_at && new Date(org.pinterest_token_expires_at) < new Date()) {
        errors.push({ org_id: org.id, error: "Token expired" });
        continue;
      }

      const token = decrypt(org.pinterest_access_token_encrypted);
      const client = new PinterestClient(token);

      // Pull organic conversion data (ATC, Checkouts, Revenue) from user account analytics
      try {
        const conversionData = await client.getUserAccountAnalytics(startDate, endDate);
        const rawDailyMetrics = conversionData?.all?.daily_metrics;
        if (rawDailyMetrics) {
          // Pinterest API may return daily_metrics as date-keyed object OR array of {date, metrics}
          const entries: { date: string; metrics: Record<string, number> }[] = [];

          if (Array.isArray(rawDailyMetrics)) {
            // Array format: [{ date: "2024-01-01", metrics: { WEB_ADD_TO_CART: 5 } }]
            for (const item of rawDailyMetrics) {
              if (item.date && item.metrics) {
                entries.push({ date: item.date, metrics: item.metrics });
              }
            }
          } else {
            // Object format: { "2024-01-01": { WEB_ADD_TO_CART: 5 } }
            for (const [date, metrics] of Object.entries(rawDailyMetrics)) {
              entries.push({ date, metrics: metrics as unknown as Record<string, number> });
            }
          }

          for (const { date, metrics } of entries) {
            const addToCarts = metrics?.WEB_ADD_TO_CART || 0;
            const checkouts = metrics?.WEB_CHECKOUT || 0;
            const revenue = metrics?.WEB_CHECKOUT_VALUE || 0;

            if (addToCarts > 0 || checkouts > 0) {
              await admin.from("sales_data").upsert(
                {
                  org_id: org.id,
                  date,
                  add_to_cart_count: addToCarts,
                  sales_count: checkouts,
                  sales_revenue: revenue,
                  source: "pinterest",
                },
                { onConflict: "org_id,date,source" }
              );
            }
          }
        }
      } catch {
        // Conversion data is optional - don't fail the whole job
      }

      // Get posted pins from last 7 days
      const { data: pins } = await admin
        .from("pins")
        .select("id, pinterest_pin_id")
        .eq("org_id", org.id)
        .eq("status", "posted")
        .not("pinterest_pin_id", "is", null)
        .gte("posted_at", startDate);

      if (!pins || pins.length === 0) continue;

      for (const pin of pins) {
        try {
          const analytics = await client.getPinAnalytics(
            pin.pinterest_pin_id!,
            startDate,
            endDate
          ) as Record<string, Record<string, { IMPRESSION?: number; SAVE?: number; PIN_CLICK?: number; OUTBOUND_CLICK?: number }>>;

          // Pinterest returns daily metrics keyed by metric type
          // Flatten and upsert per-date rows
          const allDates = analytics.all?.daily_metrics;
          if (!allDates) continue;

          for (const [date, metrics] of Object.entries(allDates)) {
            const m = metrics as unknown as Record<string, number> | undefined;
            const impressions = m?.IMPRESSION || 0;
            const saves = m?.SAVE || 0;
            const pinClicks = m?.PIN_CLICK || 0;
            const outboundClicks = m?.OUTBOUND_CLICK || 0;

            const totalEngagement = impressions > 0
              ? ((saves + pinClicks + outboundClicks) / impressions) * 100
              : 0;
            const saveRate = impressions > 0 ? (saves / impressions) * 100 : 0;

            await admin.from("pin_analytics").upsert(
              {
                pin_id: pin.id,
                org_id: org.id,
                date,
                impressions,
                saves,
                pin_clicks: pinClicks,
                outbound_clicks: outboundClicks,
                video_views: 0,
                save_rate: saveRate,
                engagement_rate: totalEngagement,
              },
              { onConflict: "pin_id,date" }
            );

            totalUpdated++;
          }
        } catch {
          // Skip individual pin errors
        }
      }
    } catch (err) {
      errors.push({
        org_id: org.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    updated: totalUpdated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
