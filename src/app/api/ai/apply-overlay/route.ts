import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import satori from "satori";

export const maxDuration = 60;

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
    // Download original image
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Resize to Pinterest 2:3
    const base = await sharp(imgBuffer)
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Load Inter font for text rendering via Satori
    const fontRes = await fetch(
      "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf"
    );
    const fontData = await fontRes.arrayBuffer();

    // Render text overlay using Satori (handles fonts properly)
    const overlayElement = {
      type: "div" as const,
      props: {
        style: {
          display: "flex" as const,
          flexDirection: "column" as const,
          width: 1000,
          height: 1500,
          position: "relative" as const,
        },
        children: [
          // Top gradient
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex" as const,
                position: "absolute" as const,
                top: 0,
                left: 0,
                right: 0,
                height: 350,
                background: "linear-gradient(rgba(0,0,0,0.55), transparent)",
              },
              children: "",
            },
          },
          // Headline text
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex" as const,
                position: "absolute" as const,
                top: 50,
                left: 50,
                right: 50,
                fontSize: 52,
                fontWeight: 700,
                fontFamily: "Inter",
                color: "white",
                lineHeight: 1.25,
              },
              children: headline,
            },
          },
          // Bottom gradient
          {
            type: "div" as const,
            props: {
              style: {
                display: "flex" as const,
                position: "absolute" as const,
                bottom: 0,
                left: 0,
                right: 0,
                height: 200,
                background: "linear-gradient(transparent, rgba(0,0,0,0.45))",
              },
              children: "",
            },
          },
        ],
      },
    };

    const svg = await satori(overlayElement as React.ReactNode, {
      width: 1000,
      height: 1500,
      fonts: [
        { name: "Inter", data: fontData, weight: 700, style: "normal" as const },
      ],
    });

    const overlayPng = await sharp(Buffer.from(svg))
      .resize(1000, 1500)
      .png()
      .toBuffer();

    // Build composite layers
    const layers: sharp.OverlayOptions[] = [
      { input: overlayPng },
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
        // Skip logo
      }
    }

    const final = await sharp(base)
      .composite(layers)
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
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Overlay failed",
    }, { status: 500 });
  }
}
