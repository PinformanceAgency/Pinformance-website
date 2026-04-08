import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";
import satori from "satori";

export const maxDuration = 60;

// Overlay style variants for brand variety
type OverlayStyle = "top-white" | "bottom-white" | "center-dark" | "top-accent" | "bottom-minimal";

function pickOverlayStyle(): OverlayStyle {
  const styles: OverlayStyle[] = ["top-white", "bottom-white", "center-dark", "top-accent", "bottom-minimal"];
  return styles[Math.floor(Math.random() * styles.length)];
}

function buildOverlay(headline: string, style: OverlayStyle) {
  const headlineUpper = headline.toUpperCase();

  const styles: Record<OverlayStyle, unknown> = {
    // Style 1: White text top with dark gradient
    "top-white": {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, flexDirection: "column" as const, width: 1000, height: 1500 },
        children: [
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: 0, left: 0, right: 0, height: 400, background: "linear-gradient(rgba(0,0,0,0.6), transparent)" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: 55, left: 55, right: 55, fontSize: 46, fontWeight: 700, fontFamily: "Playfair Display", color: "white", lineHeight: 1.3, letterSpacing: 2, textTransform: "uppercase" as const }, children: headlineUpper } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.35))" }, children: "" } },
        ],
      },
    },

    // Style 2: White text bottom with gradient up
    "bottom-white": {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, flexDirection: "column" as const, width: 1000, height: 1500 },
        children: [
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 450, background: "linear-gradient(transparent, rgba(0,0,0,0.65))" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 120, left: 55, right: 55, fontSize: 44, fontWeight: 700, fontFamily: "Playfair Display", color: "white", lineHeight: 1.3, letterSpacing: 2, textTransform: "uppercase" as const }, children: headlineUpper } },
        ],
      },
    },

    // Style 3: Dark semi-transparent bar in center
    "center-dark": {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, flexDirection: "column" as const, width: 1000, height: 1500, justifyContent: "center" as const, alignItems: "center" as const },
        children: [
          { type: "div" as const, props: { style: { display: "flex" as const, backgroundColor: "rgba(17,17,17,0.8)", padding: "35px 50px", maxWidth: 850 }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: "50%", left: 55, right: 55, fontSize: 40, fontWeight: 700, fontFamily: "Playfair Display", color: "white", lineHeight: 1.35, letterSpacing: 3, textTransform: "uppercase" as const, textAlign: "center" as const, justifyContent: "center" as const }, children: headlineUpper } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.3))" }, children: "" } },
        ],
      },
    },

    // Style 4: Red accent line + white text top
    "top-accent": {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, flexDirection: "column" as const, width: 1000, height: 1500 },
        children: [
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: 0, left: 0, right: 0, height: 420, background: "linear-gradient(rgba(0,0,0,0.6), transparent)" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: 45, left: 55, width: 50, height: 4, backgroundColor: "#D02F2E" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, top: 70, left: 55, right: 55, fontSize: 46, fontWeight: 700, fontFamily: "Playfair Display", color: "white", lineHeight: 1.3, letterSpacing: 2, textTransform: "uppercase" as const }, children: headlineUpper } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.35))" }, children: "" } },
        ],
      },
    },

    // Style 5: Minimal bottom with thin line
    "bottom-minimal": {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, flexDirection: "column" as const, width: 1000, height: 1500 },
        children: [
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 400, background: "linear-gradient(transparent, rgba(17,17,17,0.7))" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 155, left: 55, width: 40, height: 3, backgroundColor: "#D02F2E" }, children: "" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 175, left: 55, fontSize: 16, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.7)", letterSpacing: 4, textTransform: "uppercase" as const }, children: "CHERRIES" } },
          { type: "div" as const, props: { style: { display: "flex" as const, position: "absolute" as const, bottom: 210, left: 55, right: 55, fontSize: 42, fontWeight: 700, fontFamily: "Playfair Display", color: "white", lineHeight: 1.3, letterSpacing: 1 }, children: headline } },
        ],
      },
    },
  };

  return styles[style];
}

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

    // Load fonts
    const [playfairRes, interRes] = await Promise.all([
      fetch("https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFu3DXbtM.ttf"),
      fetch("https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf"),
    ]);
    const playfairData = await playfairRes.arrayBuffer();
    const interData = await interRes.arrayBuffer();

    // Pick a random overlay style for variety
    const style = pickOverlayStyle();
    const overlayElement = buildOverlay(headline, style);

    const svg = await satori(overlayElement as React.ReactNode, {
      width: 1000,
      height: 1500,
      fonts: [
        { name: "Playfair Display", data: playfairData, weight: 700, style: "normal" as const },
        { name: "Inter", data: interData, weight: 700, style: "normal" as const },
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

    // Download and add logo (250px, bottom-left)
    if (logo_url) {
      try {
        const logoRes = await fetch(logo_url);
        if (logoRes.ok) {
          const rawLogo = Buffer.from(await logoRes.arrayBuffer());
          const resizedLogo = await sharp(rawLogo)
            .resize(250, undefined, { fit: "inside" })
            .png()
            .toBuffer();
          layers.push({ input: resizedLogo, top: 1370, left: 30 });
        }
      } catch { /* skip */ }
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
      style,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Overlay failed",
    }, { status: 500 });
  }
}
