import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { RemoveBgClient } from "@/lib/removebg/client";

export const maxDuration = 60;

/**
 * POST /api/ai/remove-background
 * Takes an image URL, removes the background via remove.bg,
 * uploads the clean product image to Supabase storage,
 * and returns the public URL.
 */
export async function POST(request: NextRequest) {
  // Auth: either cron secret or user session
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;
  let orgId: string | null = null;

  if (cronSecret && cronSecret === expectedSecret) {
    const body = await request.clone().json();
    orgId = body.org_id;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase.from("users").select("org_id").eq("id", user.id).single();
    orgId = profile?.org_id || null;
  }

  if (!orgId) return NextResponse.json({ error: "No org found" }, { status: 400 });

  const body = await request.json();
  const { image_url } = body;

  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }

  // Get remove.bg API key from env or org settings
  const removeBgKey = process.env.REMOVEBG_API_KEY || "vaiSGYNEQhpJT1dvPgvYz3jY";
  if (!removeBgKey) {
    return NextResponse.json({ error: "REMOVEBG_API_KEY not configured" }, { status: 500 });
  }

  try {
    const client = new RemoveBgClient(removeBgKey);
    const cleanBuffer = await client.removeBackground(image_url);

    // Upload clean product image to Supabase storage
    const admin = createAdminClient();
    const fileName = `${orgId}/products/clean-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;

    const { error: uploadError } = await admin.storage
      .from("pin-images")
      .upload(fileName, cleanBuffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("pin-images")
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      clean_image_url: urlData.publicUrl,
      original_url: image_url,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Background removal failed",
    }, { status: 500 });
  }
}
