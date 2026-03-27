import { NextRequest, NextResponse } from "next/server";

/**
 * Health check endpoint for cron monitoring.
 * Returns the status of all cron jobs and their last run times.
 *
 * CRON SCHEDULE (configure in EasyCron or similar):
 *
 * 1. POST /api/cron/post-pins
 *    - Schedule: Every 15 minutes
 *    - Posts approved pins to Pinterest on their scheduled times
 *    - Header: x-cron-secret: <CRON_SET value from Vercel env>
 *
 * 2. POST /api/cron/pull-analytics
 *    - Schedule: Every 6 hours
 *    - Pulls analytics for posted pins from last 7 days
 *    - Header: x-cron-secret: <CRON_SET value from Vercel env>
 *
 * 3. POST /api/cron/optimize-prompts
 *    - Schedule: Weekly on Monday at 3 AM (0 3 * * 1)
 *    - Analyzes pin performance and optimizes prompts/keywords
 *    - Header: x-cron-secret: <CRON_SET value from Vercel env>
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "healthy",
    cron_jobs: [
      {
        name: "post-pins",
        endpoint: "/api/cron/post-pins",
        schedule: "*/15 * * * *",
        description: "Post approved pins to Pinterest",
      },
      {
        name: "pull-analytics",
        endpoint: "/api/cron/pull-analytics",
        schedule: "0 */6 * * *",
        description: "Pull Pinterest analytics for posted pins",
      },
      {
        name: "optimize-prompts",
        endpoint: "/api/cron/optimize-prompts",
        schedule: "0 3 * * 1",
        description: "Weekly prompt optimization based on analytics",
      },
    ],
    environment: {
      cron_secret_set: !!(process.env.CRON_SECRET || process.env.CRON_SET),
      anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
      krea_key_set: !!process.env.KREA_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
