import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";

function verifyCron(request: NextRequest): boolean {
  // Vercel native cron sends Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET || process.env.CRON_SET}`) return true;
  // Custom cron services send x-cron-secret
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret === (process.env.CRON_SECRET || process.env.CRON_SET)) return true;
  return false;
}

// Support both GET (Vercel Cron) and POST (external cron services)
export async function GET(request: NextRequest) { return handlePostPins(request); }
export async function POST(request: NextRequest) { return handlePostPins(request); }

async function handlePostPins(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // Get all orgs with Pinterest connected
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, pinterest_access_token_encrypted, pinterest_token_expires_at, settings")
    .not("pinterest_access_token_encrypted", "is", null);

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: "No orgs to process", posted: 0 });
  }

  let totalPosted = 0;
  const errors: { org_id: string; error: string }[] = [];

  for (const org of orgs) {
    try {
      // Check token expiry
      if (org.pinterest_token_expires_at && new Date(org.pinterest_token_expires_at) < new Date()) {
        errors.push({ org_id: org.id, error: "Token expired" });
        continue;
      }

      // Get approved pins that are due for posting
      const { data: pins } = await admin
        .from("pins")
        .select("*, board:boards(pinterest_board_id)")
        .eq("org_id", org.id)
        .eq("status", "approved")
        .lte("scheduled_at", now)
        .order("scheduled_at", { ascending: true })
        .limit(1);

      if (!pins || pins.length === 0) continue;

      const pin = pins[0];

      if (!pin.image_url) {
        errors.push({ org_id: org.id, error: `Pin ${pin.id} has no image` });
        continue;
      }

      const boardPinterestId = (pin.board as { pinterest_board_id: string | null })?.pinterest_board_id;
      if (!boardPinterestId) {
        errors.push({ org_id: org.id, error: `Pin ${pin.id} board not on Pinterest` });
        continue;
      }

      // Rate limit: check last posted pin timestamp for this org
      const { data: lastPosted } = await admin
        .from("pins")
        .select("posted_at")
        .eq("org_id", org.id)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(1);

      if (lastPosted?.[0]?.posted_at) {
        const lastPostTime = new Date(lastPosted[0].posted_at).getTime();
        // Use org setting or default 180 min (3 hours) per Pinterest strategy doc
        const orgSettings = org.settings as Record<string, unknown> || {};
        const minIntervalMin = (orgSettings.min_post_interval_minutes as number) || 180;
        const minInterval = minIntervalMin * 60_000;
        if (Date.now() - lastPostTime < minInterval) continue;
      }

      // Mark as posting
      await admin
        .from("pins")
        .update({ status: "posting", updated_at: now })
        .eq("id", pin.id);

      const token = decrypt(org.pinterest_access_token_encrypted);
      const client = new PinterestClient(token);

      const pinterestPin = await client.createPin({
        board_id: boardPinterestId,
        board_section_id: pin.board_section_id || undefined,
        title: pin.title,
        description: pin.description || undefined,
        link: pin.link_url || undefined,
        alt_text: pin.alt_text || undefined,
        media_source: {
          source_type: "image_url",
          url: pin.image_url,
        },
      });

      await admin
        .from("pins")
        .update({
          status: "posted",
          pinterest_pin_id: pinterestPin.id,
          posted_at: now,
          updated_at: now,
        })
        .eq("id", pin.id);

      totalPosted++;
    } catch (err) {
      errors.push({
        org_id: org.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    posted: totalPosted,
    errors: errors.length > 0 ? errors : undefined,
  });
}
