import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { fetchOrganicConversions, validateSession } from "@/lib/pinterest/graphql";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) {
    const q = request.nextUrl.searchParams.get("secret");
    if (q !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing ?slug" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, slug, name, pinterest_access_token_encrypted, pinterest_user_id, pinterest_session_encrypted, pinterest_session_expires_at")
    .eq("slug", slug)
    .single();

  if (!org) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  const end = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const results: Record<string, unknown> = {
    org: org.name,
    pinterest_user_id: org.pinterest_user_id,
    date_range: { start, end },
    has_session_cookie: !!org.pinterest_session_encrypted,
    session_expires_at: org.pinterest_session_expires_at,
  };

  // Test session cookie and GraphQL
  if (org.pinterest_session_encrypted) {
    try {
      const sessionCookie = decrypt(org.pinterest_session_encrypted);
      results.cookie_length = sessionCookie.length;
      results.cookie_preview = sessionCookie.slice(0, 20) + "...";

      // Test 1: Validate session
      const isValid = await validateSession(sessionCookie);
      results.session_valid = isValid;

      // Test 2: Try GraphQL regardless of validation result
      if (org.pinterest_user_id) {
        const conversionData = await fetchOrganicConversions(
          sessionCookie,
          org.pinterest_user_id,
          start,
          end
        );

        results.organic_conversions = conversionData.totals;
        results.graphql_errors = conversionData.errors.length > 0 ? conversionData.errors : undefined;
        results.graphql_raw = conversionData.raw_responses;
      }

      // Test 3: Raw cookie test — try a simple Pinterest endpoint
      try {
        const testRes = await fetch("https://www.pinterest.com/resource/UserResource/get/?data={}", {
          headers: {
            "Cookie": `_pinterest_sess=${sessionCookie}`,
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "X-Pinterest-Source": "www",
          },
        });
        const testText = await testRes.text();
        results.raw_cookie_test = {
          status: testRes.status,
          content_type: testRes.headers.get("content-type"),
          is_json: testText.trim().startsWith("{"),
          body_preview: testText.slice(0, 300),
        };
      } catch (e) {
        results.raw_cookie_test_error = String(e);
      }
    } catch (e) {
      results.session_error = e instanceof Error ? e.message : String(e);
    }
  } else {
    results.message = "No Pinterest session cookie stored. User needs to add one via Integrations page for organic conversion data.";

    // Fall back to showing what the public API can provide (engagement metrics only)
    if (org.pinterest_access_token_encrypted) {
      try {
        const token = decrypt(org.pinterest_access_token_encrypted);
        const params = new URLSearchParams({
          start_date: start,
          end_date: end,
          metric_types: "OUTBOUND_CLICK,IMPRESSION,SAVE,ENGAGEMENT",
          content_type: "ORGANIC",
        });
        const res = await fetch(`https://api.pinterest.com/v5/user_account/analytics?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = await res.json();
          const daily = body?.all?.daily_metrics || [];
          let totalOutbound = 0;
          for (const d of daily) {
            if (d.data_status === "READY" && d.metrics) {
              totalOutbound += d.metrics.OUTBOUND_CLICK || 0;
            }
          }
          results.public_api_outbound_clicks = {
            total: totalOutbound,
            days: daily.length,
            note: "This is outbound clicks from the public API — NOT the same as Pinterest's organic conversion page visits",
          };
        }
      } catch { /* skip */ }
    }
  }

  return NextResponse.json(results);
}
