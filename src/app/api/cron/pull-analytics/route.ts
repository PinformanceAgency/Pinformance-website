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

              // Also store outbound_clicks as page_visits in sales_data for dashboard compatibility
              await admin.from("sales_data").upsert(
                {
                  org_id: org.id,
                  date: day.date,
                  page_visits: outboundClicks,
                  add_to_cart_count: 0,
                  sales_count: 0,
                  sales_revenue: 0,
                  source: "pinterest",
                },
                { onConflict: "org_id,date,source" }
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

      // Pull ORGANIC conversion data via ad_accounts (requires ads:read scope)
      // Strategy: account-level = total (organic+paid), campaign-level = paid only
      // Organic = total - paid
      try {
        const adAccountsRes = await fetch(`https://api.pinterest.com/v5/ad_accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (adAccountsRes.ok) {
          const adAccounts = await adAccountsRes.json();
          const items = adAccounts?.items || [];

          const CONV_COLUMNS = "TOTAL_PAGE_VISIT,TOTAL_CLICK_ADD_TO_CART,TOTAL_CLICK_CHECKOUT,TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR,TOTAL_VIEW_ADD_TO_CART,TOTAL_VIEW_CHECKOUT,TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR";

          for (const adAccount of items) {
            const adAccountId = adAccount.id;
            const convWindow = {
              click_window_days: "30",
              view_window_days: "1",
              conversion_report_time: "TIME_OF_CONVERSION",
            };

            // 1) Account-level = TOTAL conversions (organic + paid)
            const totalParams = new URLSearchParams({
              start_date: startDate,
              end_date: endDate,
              granularity: "DAY",
              columns: CONV_COLUMNS,
              ...convWindow,
            });
            const totalRes = await fetch(
              `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/analytics?${totalParams}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!totalRes.ok) continue;
            const totalData: Record<string, number | string>[] = await totalRes.json();
            if (!Array.isArray(totalData) || totalData.length === 0) continue;

            // 2) Campaign-level = PAID only conversions
            const paidParams = new URLSearchParams({
              start_date: startDate,
              end_date: endDate,
              granularity: "DAY",
              columns: CONV_COLUMNS,
              ...convWindow,
            });
            const paidRes = await fetch(
              `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/campaigns/analytics?${paidParams}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            // Build paid-by-date lookup: sum all campaigns per date
            const paidByDate: Record<string, {
              pageVisits: number; clickATC: number; viewATC: number;
              clickCheckout: number; viewCheckout: number;
              clickCheckoutValue: number; viewCheckoutValue: number;
            }> = {};
            if (paidRes.ok) {
              const paidData = await paidRes.json();
              if (Array.isArray(paidData)) {
                for (const row of paidData) {
                  const d = row.DATE as string;
                  if (!d) continue;
                  if (!paidByDate[d]) {
                    paidByDate[d] = { pageVisits: 0, clickATC: 0, viewATC: 0, clickCheckout: 0, viewCheckout: 0, clickCheckoutValue: 0, viewCheckoutValue: 0 };
                  }
                  paidByDate[d].pageVisits += (row.TOTAL_PAGE_VISIT as number) || 0;
                  paidByDate[d].clickATC += (row.TOTAL_CLICK_ADD_TO_CART as number) || 0;
                  paidByDate[d].viewATC += (row.TOTAL_VIEW_ADD_TO_CART as number) || 0;
                  paidByDate[d].clickCheckout += (row.TOTAL_CLICK_CHECKOUT as number) || 0;
                  paidByDate[d].viewCheckout += (row.TOTAL_VIEW_CHECKOUT as number) || 0;
                  paidByDate[d].clickCheckoutValue += (row.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR as number) || 0;
                  paidByDate[d].viewCheckoutValue += (row.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR as number) || 0;
                }
              }
            }

            // 3) Calculate organic = total - paid per day
            for (const day of totalData) {
              const date = day.DATE as string;
              if (!date) continue;

              const paid = paidByDate[date] || { pageVisits: 0, clickATC: 0, viewATC: 0, clickCheckout: 0, viewCheckout: 0, clickCheckoutValue: 0, viewCheckoutValue: 0 };

              const organicPageVisits = Math.max(0, ((day.TOTAL_PAGE_VISIT as number) || 0) - paid.pageVisits);
              const organicATC = Math.max(0, ((day.TOTAL_CLICK_ADD_TO_CART as number) || 0) + ((day.TOTAL_VIEW_ADD_TO_CART as number) || 0) - paid.clickATC - paid.viewATC);
              const organicCheckouts = Math.max(0, ((day.TOTAL_CLICK_CHECKOUT as number) || 0) + ((day.TOTAL_VIEW_CHECKOUT as number) || 0) - paid.clickCheckout - paid.viewCheckout);
              const organicRevenueMicro = Math.max(0,
                ((day.TOTAL_CLICK_CHECKOUT_VALUE_IN_MICRO_DOLLAR as number) || 0) +
                ((day.TOTAL_VIEW_CHECKOUT_VALUE_IN_MICRO_DOLLAR as number) || 0) -
                paid.clickCheckoutValue - paid.viewCheckoutValue
              );
              const organicRevenue = organicRevenueMicro / 1000000;

              if (organicPageVisits > 0 || organicATC > 0 || organicCheckouts > 0) {
                await admin.from("sales_data").upsert(
                  {
                    org_id: org.id,
                    date,
                    page_visits: organicPageVisits,
                    add_to_cart_count: organicATC,
                    sales_count: organicCheckouts,
                    sales_revenue: organicRevenue,
                    source: "pinterest",
                  },
                  { onConflict: "org_id,date,source" }
                );
              }
            }
          }
        }
      } catch {
        // ads:read scope not available yet - conversion data will show once brands re-authenticate
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
