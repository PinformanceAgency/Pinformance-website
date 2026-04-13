import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/**
 * Health check cron — runs every hour.
 * Detects problems and auto-fixes them:
 * 1. Overdue pins (scheduled_at in past but still on scheduled status)
 * 2. Stuck pins (posting status for > 10 min)
 * 3. No posts in last 48 hours when there are scheduled pins
 */

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) return true;
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET || process.env.CRON_SET)) return true;
  return false;
}

export async function GET(request: NextRequest) { return handleHealthCheck(request); }
export async function POST(request: NextRequest) { return handleHealthCheck(request); }

async function handleHealthCheck(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const issues: string[] = [];
  const fixes: string[] = [];

  // Get all orgs with Pinterest
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .not("pinterest_access_token_encrypted", "is", null);

  for (const org of orgs || []) {
    // 1. Fix overdue pins — reschedule to NOW
    const { data: overduePins } = await admin
      .from("pins")
      .select("id")
      .eq("org_id", org.id)
      .in("status", ["approved", "scheduled"])
      .lt("scheduled_at", now.toISOString())
      .limit(50);

    if (overduePins && overduePins.length > 0) {
      issues.push(`${org.name}: ${overduePins.length} overdue pins`);

      // Reschedule overdue pins to now so cron picks them up
      for (const pin of overduePins) {
        await admin.from("pins").update({
          scheduled_at: now.toISOString(),
        }).eq("id", pin.id);
      }
      fixes.push(`${org.name}: rescheduled ${overduePins.length} overdue pins to now`);
    }

    // 2. Fix stuck pins (posting for > 10 min)
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const { data: stuckPins } = await admin
      .from("pins")
      .select("id")
      .eq("org_id", org.id)
      .eq("status", "posting")
      .lt("updated_at", tenMinAgo);

    if (stuckPins && stuckPins.length > 0) {
      issues.push(`${org.name}: ${stuckPins.length} stuck pins in 'posting' status`);

      for (const pin of stuckPins) {
        await admin.from("pins").update({
          status: "scheduled",
          scheduled_at: now.toISOString(),
        }).eq("id", pin.id);
      }
      fixes.push(`${org.name}: unstuck ${stuckPins.length} pins, rescheduled to now`);
    }

    // 3. Fix failed pins — move back to scheduled
    const { data: failedPins } = await admin
      .from("pins")
      .select("id")
      .eq("org_id", org.id)
      .eq("status", "failed");

    if (failedPins && failedPins.length > 0) {
      issues.push(`${org.name}: ${failedPins.length} failed pins`);

      for (const pin of failedPins) {
        await admin.from("pins").update({
          status: "scheduled",
          scheduled_at: now.toISOString(),
        }).eq("id", pin.id);
      }
      fixes.push(`${org.name}: rescued ${failedPins.length} failed pins, rescheduled to now`);
    }

    // 4. Check if no posts in 48 hours when there are scheduled pins
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const { data: recentPosts } = await admin
      .from("pins")
      .select("id")
      .eq("org_id", org.id)
      .eq("status", "posted")
      .gte("posted_at", twoDaysAgo)
      .limit(1);

    const { data: pendingPins } = await admin
      .from("pins")
      .select("id")
      .eq("org_id", org.id)
      .in("status", ["scheduled", "approved"])
      .limit(1);

    if ((!recentPosts || recentPosts.length === 0) && pendingPins && pendingPins.length > 0) {
      issues.push(`${org.name}: NO POSTS in 48 hours but ${pendingPins.length}+ pins waiting`);
    }
  }

  return NextResponse.json({
    healthy: issues.length === 0,
    checked_at: now.toISOString(),
    orgs_checked: orgs?.length || 0,
    issues,
    fixes,
  });
}
