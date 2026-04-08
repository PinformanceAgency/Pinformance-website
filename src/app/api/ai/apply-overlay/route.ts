import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import satori from "satori";

export const maxDuration = 60;

/**
 * POST /api/ai/apply-overlay
 * Takes a static image, adds a subtle text overlay + brand logo.
 * Following Pinterest's creative guidelines:
 * - Headline: 5-8 words, legible on mobile
 * - Logo: subtle, bottom corner
 * - 2:3 vertical format (1000x1500)
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

    // Resize to Pinterest 2:3 format
    const resized = await sharp(imgBuffer)
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Load font for text overlay
    const fontRes = await fetch(
      "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vXDXbtM.ttf"
    );
    const fontData = await fontRes.arrayBuffer();

    const fontBoldRes = await fetch(
      "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFu3DXbtM.ttf"
    );
    const fontBoldData = await fontBoldRes.arrayBuffer();

    // Create subtle text overlay with Satori
    const overlayElement = {
      type: "div" as const,
      props: {
        style: {
          display: "flex",
          flexDirection: "column" as const,
          width: 1000,
          height: 1500,
          position: "relative" as const,
        },
        children: [
          // Top gradient for text readability
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex",
                position: "absolute" as const,
                top: 0,
                left: 0,
                right: 0,
                height: 250,
                background: "linear-gradient(rgba(0,0,0,0.45) 0%, transparent 100%)",
              },
              children: "",
            },
          },
          // Headline text - top area
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex",
                position: "absolute" as const,
                top: 50,
                left: 50,
                right: 50,
                fontSize: 48,
                fontWeight: 700,
                fontFamily: "Playfair Display",
                color: "white",
                lineHeight: 1.2,
                textShadow: "0 2px 8px rgba(0,0,0,0.3)",
              },
              children: headline,
            },
          },
          // Bottom subtle gradient for logo
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex",
                position: "absolute" as const,
                bottom: 0,
                left: 0,
                right: 0,
                height: 120,
                background: "linear-gradient(transparent, rgba(0,0,0,0.35))",
              },
              children: "",
            },
          },
        ],
      },
    };

    // Render overlay to SVG then PNG
    const overlaySvg = await satori(overlayElement as React.ReactNode, {
      width: 1000,
      height: 1500,
      fonts: [
        { name: "Playfair Display", data: fontData, weight: 400, style: "normal" as const },
        { name: "Playfair Display", data: fontBoldData, weight: 700, style: "normal" as const },
      ],
    });

    const overlayPng = await sharp(Buffer.from(overlaySvg))
      .resize(1000, 1500)
      .png()
      .toBuffer();

    // Download logo if provided
    let logoBuffer: Buffer | null = null;
    if (logo_url) {
      const logoRes = await fetch(logo_url);
      if (logoRes.ok) {
        const rawLogo = Buffer.from(await logoRes.arrayBuffer());
        logoBuffer = await sharp(rawLogo)
          .resize(120, undefined, { fit: "inside" })
          .png()
          .toBuffer();
      }
    }

    // Composite: base image + text overlay + logo
    const composites: sharp.OverlayOptions[] = [
      { input: overlayPng, blend: "over" as const },
    ];

    if (logoBuffer) {
      composites.push({
        input: logoBuffer,
        gravity: "southwest" as const,
        left: 40,
        top: 1500 - 70,
        blend: "over" as const,
      } as sharp.OverlayOptions);
    }

    const final = await sharp(resized)
      .composite(composites)
      .jpeg({ quality: 92 })
      .toBuffer();

    // Upload
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
