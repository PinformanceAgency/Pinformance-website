import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { renderPinCreative } from "@/lib/image/pin-templates";

export const maxDuration = 60;

/**
 * POST /api/ai/apply-overlay
 * Uses the existing pin template system (Satori) to apply branded overlay.
 * Randomly picks a template style for variety.
 */

const TEMPLATE_STYLES = ["lifestyle", "hero", "editorial"] as const;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("users").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = await request.json();
  const { image_url, headline, logo_url } = body;
  if (!image_url || !headline) return NextResponse.json({ error: "image_url and headline required" }, { status: 400 });

  const admin = createAdminClient();

  // Get org name for branding
  const { data: org } = await admin.from("organizations").select("name").eq("id", profile.org_id).single();
  const brandName = org?.name || "CHERRIES";

  try {
    // Pick a random template for variety
    const template = TEMPLATE_STYLES[Math.floor(Math.random() * TEMPLATE_STYLES.length)];

    // Use the existing pin template renderer (Satori-based, already works)
    const result = await renderPinCreative({
      template,
      productImageUrl: image_url,
      brandName,
      textLines: [headline],
      accentColor: "#D02F2E",
    });

    // Upload
    const fileName = `${profile.org_id}/creatives/overlay-${Date.now()}.jpg`;
    const { error: uploadErr } = await admin.storage
      .from("pin-images")
      .upload(fileName, result.buffer, { contentType: "image/jpeg", upsert: false });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = admin.storage.from("pin-images").getPublicUrl(fileName);

    return NextResponse.json({ success: true, overlay_url: urlData.publicUrl, template });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Overlay failed" }, { status: 500 });
  }
}
