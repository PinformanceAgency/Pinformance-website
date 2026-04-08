import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const maxDuration = 60;

/**
 * POST /api/ai/apply-overlay
 * Adds subtle text overlay + brand logo to a static image.
 * Resizes to Pinterest 2:3 (1000x1500).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = await request.json();
  const { image_url, headline, logo_url } = body;

  if (!image_url || !headline) {
    return NextResponse.json({ error: "image_url and headline required" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // Download the original image
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Resize to Pinterest 2:3
    const base = await sharp(imgBuffer)
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Split headline into lines (max ~25 chars per line for readability)
    const words = headline.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    for (const word of words) {
      if ((currentLine + " " + word).trim().length > 25 && currentLine) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = (currentLine + " " + word).trim();
      }
    }
    if (currentLine) lines.push(currentLine.trim());

    // Build text elements for each line
    const textElements = lines.map((line, i) =>
      `<text x="60" y="${100 + i * 65}" font-family="Georgia, Times, serif" font-size="54" font-weight="bold" fill="white" letter-spacing="1">${escapeXml(line)}</text>`
    ).join("\n");

    const gradientHeight = Math.max(300, 100 + lines.length * 65 + 60);

    // Create overlay SVG with gradient + headline text
    const svgOverlay = `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="black" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.45"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="${gradientHeight}" fill="url(#topGrad)"/>
      <rect x="0" y="1300" width="1000" height="200" fill="url(#bottomGrad)"/>
      ${textElements}
    </svg>`;

    const overlayBuffer = Buffer.from(svgOverlay);

    // Build composite layers
    const layers: { input: Buffer; top?: number; left?: number }[] = [
      { input: overlayBuffer },
    ];

    // Download and add logo
    if (logo_url) {
      try {
        const logoRes = await fetch(logo_url);
        if (logoRes.ok) {
          const rawLogo = Buffer.from(await logoRes.arrayBuffer());
          const resizedLogo = await sharp(rawLogo)
            .resize(200, undefined, { fit: "inside" })
            .png()
            .toBuffer();
          layers.push({ input: resizedLogo, top: 1380, left: 40 });
        }
      } catch {
        // Skip logo if download fails
      }
    }

    const final = await sharp(base)
      .composite(layers)
      .jpeg({ quality: 92 })
      .toBuffer();

    // Upload result
    const fileName = `${profile.org_id}/creatives/overlay-${Date.now()}.jpg`;
    const { error: uploadErr } = await admin.storage
      .from("pin-images")
      .upload(fileName, final, { contentType: "image/jpeg", upsert: false });

    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = admin.storage.from("pin-images").getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      overlay_url: urlData.publicUrl,
      original_url: image_url,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Overlay failed",
    }, { status: 500 });
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
