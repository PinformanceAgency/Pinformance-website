import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

/**
 * POST /api/pinterest/analytics/sync
 *
 * On-demand, per-org pull of account-level ORGANIC analytics into
 * `account_analytics`. The Overview page calls this on load so organic
 * performance is visible for every connected account WITHOUT waiting for the
 * nightly `pull-analytics` cron (and without silently showing all-zeros when
 * the cron failed for that org).
 *
 * Auth-gated (session, not CRON_SECRET) and scoped to the caller's org.
 * Returns a structured `reason` instead of throwing so the UI can show
 * actionable guidance (reconnect / connect Pinterest) rather than a blank chart.
 */
export async function POST(request: NextRequest) {
  void request;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select(
      "pinterest_access_token_encrypted, pinterest_token_expires_at, pinterest_token_scopes, settings"
    )
    .eq("id", orgId)
    .single();

  // Not connected yet — not an error, just nothing to pull.
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ ok: false, reason: "not_connected" });
  }

  // Token expired — needs a reconnect/refresh.
  if (
    org.pinterest_token_expires_at &&
    new Date(org.pinterest_token_expires_at) < new Date()
  ) {
    return NextResponse.json({ ok: false, reason: "token_expired" });
  }

  // Account analytics requires the `user_accounts:read` scope. Tokens
  // connected before that scope was added to REQUIRED_SCOPES lack it; surface
  // a clear reconnect prompt instead of letting the API call fail silently.
  const scopes = (org.pinterest_token_scopes as string) || "";
  if (scopes && !scopes.includes("user_accounts:read")) {
    return NextResponse.json({
      ok: false,
      reason: "missing_scope",
      missing: ["user_accounts:read"],
    });
  }

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    // Trial-tier orgs must hit the sandbox API — match every other route.
    const isTrial =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) ===
      "trial";
    const client = new PinterestClient(token, isTrial);

    const endDate = new Date().toISOString().split("T")[0];
    // 89 days — Pinterest API max is 90 days, keep a 1-day buffer. Covers the
    // Overview's 7/30/90-day windows in a single pull.
    const startDate = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    // Best-effort: refresh follower / monthly-views counts.
    try {
      const userAccount = await client.getUser();
      if (
        userAccount.follower_count !== undefined ||
        userAccount.monthly_views !== undefined
      ) {
        await admin
          .from("organizations")
          .update({
            pinterest_follower_count: userAccount.follower_count ?? 0,
            pinterest_monthly_views: userAccount.monthly_views ?? 0,
          })
          .eq("id", orgId);
      }
    } catch {
      // Non-fatal — analytics is the important part below.
    }

    const accountData = await client.getUserAccountAnalytics(startDate, endDate);
    const dailyMetrics = accountData?.all?.daily_metrics;

    let daysUpdated = 0;
    if (dailyMetrics && Array.isArray(dailyMetrics)) {
      for (const day of dailyMetrics) {
        if (!day.date || !day.metrics) continue;
        if (day.data_status === "PROCESSING") continue;

        const impressions = day.metrics.IMPRESSION || 0;
        const saves = day.metrics.SAVE || 0;
        const pinClicks = day.metrics.PIN_CLICK || 0;
        const outboundClicks = day.metrics.OUTBOUND_CLICK || 0;
        const engagement = day.metrics.ENGAGEMENT || 0;
        const engagementRate = day.metrics.ENGAGEMENT_RATE || 0;
        const saveRate = day.metrics.SAVE_RATE || 0;

        if (impressions > 0 || outboundClicks > 0 || saves > 0) {
          await admin.from("account_analytics").upsert(
            {
              org_id: orgId,
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
          daysUpdated++;
        }
      }
    }

    // Record when we last refreshed so the UI can show it.
    const settings = (org.settings as Record<string, unknown>) || {};
    await admin
      .from("organizations")
      .update({
        settings: { ...settings, organic_last_synced_at: new Date().toISOString() },
      })
      .eq("id", orgId);

    return NextResponse.json({ ok: true, days_updated: daysUpdated });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    // The connected account is missing board/analytics permission, or the
    // token was revoked — both fixed by reconnecting Pinterest.
    if (/error 401|error 403|\bscope\b|not authorized|authoriz/i.test(raw)) {
      return NextResponse.json({
        ok: false,
        reason: "missing_scope",
        missing: ["user_accounts:read"],
      });
    }
    if (/error 429|rate limit/i.test(raw)) {
      return NextResponse.json({ ok: false, reason: "rate_limited" });
    }
    return NextResponse.json(
      { ok: false, reason: "error", error: raw || "Analytics sync failed" },
      { status: 500 }
    );
  }
}
