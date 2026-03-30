import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { runContentPipeline } from "@/lib/ai/pipelines/content-pipeline";

/**
 * MASTER DAILY CRON - Single endpoint that handles everything.
 *
 * Schedule: Every 15 minutes via EasyCron
 * POST /api/cron/daily
 * Header: x-cron-secret: <CRON_SET>
 *
 * What it does each run:
 * 1. Posts any approved pins whose scheduled_at has passed
 * 2. Auto-generates new content when queue is running low (< 7 pins)
 * 3. Logs everything to cron_logs table for monitoring
 * 4. Handles errors gracefully — never crashes, always continues
 */

export const maxDuration = 300; // 5 min max for Vercel

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) return true;
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET || process.env.CRON_SET)) return true;
  return false;
}

export async function GET(request: NextRequest) { return handleDaily(request); }
export async function POST(request: NextRequest) { return handleDaily(request); }

interface CronLog {
  org_id: string;
  org_name: string;
  action: string;
  status: "success" | "error" | "skipped";
  details: string;
  timestamp: string;
}

async function handleDaily(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const logs: CronLog[] = [];

  function log(org_id: string, org_name: string, action: string, status: CronLog["status"], details: string) {
    logs.push({ org_id, org_name, action, status, details, timestamp: new Date().toISOString() });
  }

  // ─── Get all orgs with Pinterest connected ───
  const { data: orgs, error: orgsError } = await admin
    .from("organizations")
    .select("id, name, slug, pinterest_access_token_encrypted, pinterest_token_expires_at, settings, anthropic_api_key_encrypted, krea_api_key_encrypted")
    .not("pinterest_access_token_encrypted", "is", null);

  if (orgsError || !orgs || orgs.length === 0) {
    return NextResponse.json({
      status: "no_orgs",
      message: orgsError?.message || "No orgs with Pinterest connected",
      logs,
    });
  }

  let totalPosted = 0;
  let totalGenerated = 0;

  for (const org of orgs) {
    const orgName = org.name || org.slug || org.id;
    const settings = (org.settings as Record<string, unknown>) || {};

    // ─── 1. CHECK TOKEN VALIDITY ───
    if (org.pinterest_token_expires_at && new Date(org.pinterest_token_expires_at) < now) {
      log(org.id, orgName, "token_check", "error", `Token expired at ${org.pinterest_token_expires_at}`);
      continue;
    }

    // ─── 2. POST APPROVED PINS ───
    try {
      const posted = await postApprovedPins(admin, org, settings, now);
      if (posted > 0) {
        totalPosted += posted;
        log(org.id, orgName, "post_pins", "success", `Posted ${posted} pin(s)`);
      } else {
        log(org.id, orgName, "post_pins", "skipped", "No pins due for posting");
      }
    } catch (err) {
      log(org.id, orgName, "post_pins", "error", err instanceof Error ? err.message : "Unknown error");
    }

    // ─── 3. AUTO-GENERATE CONTENT IF QUEUE IS LOW ───
    try {
      const queueSize = await checkQueueSize(admin, org.id);
      if (queueSize < 7) {
        // Only generate once per day (check last generation)
        const { data: lastGen } = await admin
          .from("ai_tasks")
          .select("created_at")
          .eq("org_id", org.id)
          .eq("task_type", "content_generation")
          .order("created_at", { ascending: false })
          .limit(1);

        const lastGenTime = lastGen?.[0]?.created_at ? new Date(lastGen[0].created_at) : null;
        const hoursSinceLastGen = lastGenTime ? (now.getTime() - lastGenTime.getTime()) / 3600000 : 999;

        if (hoursSinceLastGen >= 20) { // At least 20 hours since last generation
          // Check if org has Anthropic key
          const anthropicKey = org.anthropic_api_key_encrypted
            ? decrypt(org.anthropic_api_key_encrypted)
            : process.env.ANTHROPIC_API_KEY;

          if (anthropicKey) {
            const result = await runContentPipeline(org.id, {
              mode: "daily",
              days: 7,
              anthropicApiKey: anthropicKey,
            });
            totalGenerated += result.pinsCreated || 0;
            log(org.id, orgName, "generate_content", "success",
              `Generated ${result.pinsCreated} pins for next 7 days (queue was ${queueSize})`);
          } else {
            log(org.id, orgName, "generate_content", "skipped", "No Anthropic API key available");
          }
        } else {
          log(org.id, orgName, "generate_content", "skipped",
            `Queue has ${queueSize} pins, last generated ${Math.round(hoursSinceLastGen)}h ago`);
        }
      } else {
        log(org.id, orgName, "queue_check", "skipped", `Queue healthy: ${queueSize} pins ready`);
      }
    } catch (err) {
      log(org.id, orgName, "generate_content", "error", err instanceof Error ? err.message : "Unknown error");
    }
  }

  // ─── 4. SAVE CRON LOG TO DB ───
  try {
    await admin.from("cron_logs").insert({
      run_at: now.toISOString(),
      total_posted: totalPosted,
      total_generated: totalGenerated,
      orgs_processed: orgs.length,
      logs: JSON.stringify(logs),
      status: logs.some(l => l.status === "error") ? "partial_error" : "success",
    });
  } catch {
    // cron_logs table might not exist yet — that's fine
  }

  return NextResponse.json({
    status: "ok",
    timestamp: now.toISOString(),
    summary: {
      orgs_processed: orgs.length,
      pins_posted: totalPosted,
      pins_generated: totalGenerated,
    },
    logs,
  });
}

// ─── POST APPROVED PINS ───
async function postApprovedPins(
  admin: ReturnType<typeof createAdminClient>,
  org: Record<string, unknown>,
  settings: Record<string, unknown>,
  now: Date
): Promise<number> {
  // Rate limit check
  const { data: lastPosted } = await admin
    .from("pins")
    .select("posted_at")
    .eq("org_id", org.id as string)
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(1);

  if (lastPosted?.[0]?.posted_at) {
    const minInterval = ((settings.min_post_interval_minutes as number) || 180) * 60_000;
    if (now.getTime() - new Date(lastPosted[0].posted_at).getTime() < minInterval) {
      return 0; // Too soon
    }
  }

  // Check posting hours (in org timezone)
  const postingHours = (settings.posting_hours as number[]) || [18, 19, 20, 21];
  const tz = (settings.timezone as string) || "Europe/Amsterdam";
  const localHour = parseInt(now.toLocaleString("en-US", { timeZone: tz, hour: "numeric", hour12: false }));
  if (!postingHours.includes(localHour)) {
    return 0; // Not in posting window
  }

  // Max pins per day check
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const { count: postedToday } = await admin
    .from("pins")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org.id as string)
    .eq("status", "posted")
    .gte("posted_at", todayStart.toISOString());

  const maxPerDay = (settings.max_pins_per_day as number) || 5;
  if ((postedToday || 0) >= maxPerDay) {
    return 0; // Daily limit reached
  }

  // Get pins due for posting
  const { data: pins } = await admin
    .from("pins")
    .select("*, board:boards(pinterest_board_id, name)")
    .eq("org_id", org.id as string)
    .in("status", ["approved", "scheduled"])
    .lte("scheduled_at", now.toISOString())
    .not("image_url", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(1);

  if (!pins || pins.length === 0) return 0;

  const pin = pins[0];
  const boardPinterestId = (pin.board as { pinterest_board_id: string | null })?.pinterest_board_id;

  if (!boardPinterestId) return 0;

  // Mark as posting
  await admin.from("pins").update({ status: "posting", updated_at: now.toISOString() }).eq("id", pin.id);

  try {
    const token = decrypt(org.pinterest_access_token_encrypted as string);
    const isTrial = (settings.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    // Ensure valid link URL
    let linkUrl = pin.link_url || undefined;
    if (linkUrl && !linkUrl.startsWith("http")) {
      const { data: bp } = await admin
        .from("brand_profiles")
        .select("raw_data")
        .eq("org_id", org.id as string)
        .single();
      linkUrl = bp?.raw_data?.website || bp?.raw_data?.landing_page || undefined;
    }

    const pinterestPin = await client.createPin({
      board_id: boardPinterestId,
      board_section_id: pin.board_section_id || undefined,
      title: pin.title,
      description: pin.description || undefined,
      link: linkUrl,
      alt_text: pin.alt_text || undefined,
      media_source: {
        source_type: "image_url",
        url: pin.image_url,
      },
    });

    await admin.from("pins").update({
      status: "posted",
      pinterest_pin_id: pinterestPin.id,
      posted_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", pin.id);

    return 1;
  } catch (err) {
    // Revert to approved so it can be retried next run
    await admin.from("pins").update({
      status: "approved",
      updated_at: now.toISOString(),
    }).eq("id", pin.id);
    throw err;
  }
}

// ─── CHECK QUEUE SIZE ───
async function checkQueueSize(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<number> {
  const { count } = await admin
    .from("pins")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["generated", "approved", "scheduled"])
    .not("image_url", "is", null);

  return count || 0;
}
