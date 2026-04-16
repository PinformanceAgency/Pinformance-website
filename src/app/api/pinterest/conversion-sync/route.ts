import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Receives organic conversion data from the client-side bookmarklet.
 *
 * The bookmarklet runs on pinterest.com (same-origin, so it has full cookie access),
 * calls Pinterest's internal GraphQL API, and POSTs the results here.
 *
 * This bypasses the need for server-side session cookies, which Pinterest blocks.
 */

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  // Allow any pinterest subdomain
  const allowed = /^https:\/\/([a-z]{2}\.)?pinterest\.com$/.test(origin)
    ? origin
    : "https://www.pinterest.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request);
  try {
    const body = await request.json();
    const { secret, org_slug, conversions } = body;

    // Verify with cron secret (the bookmarklet includes it)
    if (secret !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors });
    }

    if (!org_slug || !conversions) {
      return NextResponse.json({ error: "Missing org_slug or conversions" }, { status: 400, headers: cors });
    }

    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", org_slug)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404, headers: cors });
    }

    const {
      page_visits = 0,
      add_to_cart = 0,
      checkouts = 0,
      revenue = 0,
      end_date,
    } = conversions;

    const date = end_date || new Date().toISOString().split("T")[0];

    await admin.from("sales_data").upsert(
      {
        org_id: org.id,
        date,
        page_visits,
        add_to_cart_count: add_to_cart,
        sales_count: checkouts,
        sales_revenue: revenue,
        source: "pinterest",
      },
      { onConflict: "org_id,date,source" }
    );

    return NextResponse.json(
      { success: true, stored: { page_visits, add_to_cart, checkouts, revenue, date } },
      { headers: cors }
    );
  } catch (err) {
    console.error("Conversion sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500, headers: cors }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) });
}
