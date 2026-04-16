import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { fetchOrganicConversions } from "@/lib/pinterest/graphql";

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
    .select("id, pinterest_user_id, pinterest_access_token_encrypted, pinterest_token_expires_at, pinterest_session_encrypted, pinterest_session_expires_at")
    .not("pinterest_access_token_encrypted", "is", null);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: "No orgs to process", updated: 0 });
  }

  const endDate = new Date().toISOString().split("T")[0];
  // 89 days — Pinterest API max is 90 days, keep 1-day buffer
  const startDate = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
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

      // Fetch user account info (follower_count, monthly_views)
      try {
        const userAccount = await client.getUser();
        if (userAccount.follower_count !== undefined || userAccount.monthly_views !== undefined) {
          await admin.from("organizations").update({
            pinterest_follower_count: userAccount.follower_count ?? 0,
            pinterest_monthly_views: userAccount.monthly_views ?? 0,
          }).eq("id", org.id);
        }
      } catch (userErr) {
        errors.push({
          org_id: org.id,
          error: `User account fetch failed: ${userErr instanceof Error ? userErr.message : String(userErr)}`,
        });
      }

      // Pull account-level analytics (impressions, saves, clicks, engagement)
      try {
        const accountData = await client.getUserAccountAnalytics(startDate, endDate);
        const dailyMetrics = accountData?.all?.daily_metrics;
        if (dailyMetrics && Array.isArray(dailyMetrics)) {
          for (const day of dailyMetrics) {
            if (!day.date || !day.metrics) continue;
            // Skip dates still being processed (values are 0)
            if (day.data_status === "PROCESSING") continue;

            const impressions = day.metrics.IMPRESSION || 0;
            const saves = day.metrics.SAVE || 0;
            const pinClicks = day.metrics.PIN_CLICK || 0;
            const outboundClicks = day.metrics.OUTBOUND_CLICK || 0;
            const engagement = day.metrics.ENGAGEMENT || 0;
            const engagementRate = day.metrics.ENGAGEMENT_RATE || 0;
            const saveRate = day.metrics.SAVE_RATE || 0;

            if (impressions > 0 || outboundClicks > 0 || saves > 0) {
              // Store in account_analytics table (account-level engagement data)
              await admin.from("account_analytics").upsert(
                {
                  org_id: org.id,
                  date: day.date,
                  impressions,
                  saves,
                  pin_clicks: pinClicks,
                  outbound_clicks: outboundClicks,
                  engagement,
                  engagement_rate: engagementRate,
                  save_rate: saveRate,
                },
                { onConflict: "org_id,date" }
              );
            }

            totalUpdated++;
          }
        }
      } catch (analyticsErr) {
        errors.push({
          org_id: org.id,
          error: `Account analytics failed: ${analyticsErr instanceof Error ? analyticsErr.message : String(analyticsErr)}`,
        });
      }

      // Pull ORGANIC conversion data via Pinterest's internal GraphQL API
      // The public API (v5) does not expose organic conversion metrics.
      // This requires a stored Pinterest session cookie.
      if (org.pinterest_session_encrypted && org.pinterest_user_id) {
        const sessionExpired = org.pinterest_session_expires_at &&
          new Date(org.pinterest_session_expires_at) < new Date();

        if (sessionExpired) {
          errors.push({ org_id: org.id, error: "Pinterest session cookie expired — user needs to refresh it" });
        } else {
          try {
            const sessionCookie = decrypt(org.pinterest_session_encrypted);
            const conversionData = await fetchOrganicConversions(
              sessionCookie,
              org.pinterest_user_id,
              startDate,
              endDate
            );

            if (conversionData.errors.length > 0) {
              errors.push({
                org_id: org.id,
                error: `GraphQL conversion errors: ${conversionData.errors.join("; ")}`,
              });
            }

            // Note: sales_data is now sourced via weekly CSV upload from Pinterest Conversion Insights.
            // We no longer write GraphQL aggregates here (they overwrote per-day CSV rows).
            void conversionData;
          } catch (gqlErr) {
            errors.push({
              org_id: org.id,
              error: `GraphQL conversion fetch failed: ${gqlErr instanceof Error ? gqlErr.message : String(gqlErr)}`,
            });
          }
        }
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

          // Pinterest returns daily_metrics as an array of {date, data_status, metrics}
          const rawDailyMetrics = (analytics as Record<string, Record<string, unknown>>)?.all?.daily_metrics;
          if (!rawDailyMetrics) continue;

          const dailyEntries: { date: string; data_status?: string; metrics: Record<string, number> }[] = [];
          if (Array.isArray(rawDailyMetrics)) {
            for (const item of rawDailyMetrics) {
              if (item.date && item.metrics) dailyEntries.push(item);
            }
          } else {
            for (const [date, metrics] of Object.entries(rawDailyMetrics)) {
              dailyEntries.push({ date, metrics: metrics as Record<string, number> });
            }
          }

          for (const entry of dailyEntries) {
            // Skip dates before pin was created or still processing
            if (entry.data_status === "BEFORE_PIN_CREATED" || entry.data_status === "PROCESSING") continue;

            const m = entry.metrics;
            const date = entry.date;
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
        } catch (pinErr) {
          // If Pinterest returns 404, pin was deleted — reschedule for reposting
          const errMsg = pinErr instanceof Error ? pinErr.message : "";
          if (errMsg.includes("404") || errMsg.includes("Not Found")) {
            await admin.from("pins").update({
              status: "scheduled",
              pinterest_pin_id: null,
              scheduled_at: new Date().toISOString(),
            }).eq("id", pin.id);
          }
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
