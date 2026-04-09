import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const maxDuration = 60;

type Style = "hero-bottom" | "editorial-top" | "minimal-bottom" | "accent-center" | "split-top" | "bold-bottom" | "elegant-top" | "dark-bar";

const ALL_STYLES: Style[] = ["hero-bottom", "editorial-top", "minimal-bottom", "accent-center", "split-top", "bold-bottom", "elegant-top", "dark-bar"];

function pickStyle(): Style {
  return ALL_STYLES[Math.floor(Math.random() * ALL_STYLES.length)];
}

function textDiv(text: string, style: Record<string, unknown>) {
  return { type: "div" as const, props: { style: { display: "flex" as const, ...style }, children: text } };
}

function emptyDiv(style: Record<string, unknown>) {
  return { type: "div" as const, props: { style: { display: "flex" as const, ...style }, children: "" } };
}

function buildOverlay(headline: string, brandName: string, style: Style) {
  const upper = headline.toUpperCase();
  const brand = brandName.toUpperCase();
  const W = 1000;
  const H = 1500;

  // Logo always at bottom-left: top=1350, left=30
  // Text and accent never overlap with logo zone (below y=1330)

  const base = { display: "flex" as const, width: W, height: H, position: "relative" as const, fontFamily: "Inter" };

  switch (style) {
    // 1: White headline bottom with gradient, red accent line above text
    case "hero-bottom":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 550, background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }),
        emptyDiv({ position: "absolute" as const, bottom: 230, left: 50, width: 45, height: 3, backgroundColor: "#D02F2E" }),
        textDiv(upper, { position: "absolute" as const, bottom: 140, left: 50, right: 50, fontSize: 42, fontWeight: 700, color: "white", lineHeight: 1.25, letterSpacing: 1 }),
        textDiv(brand, { position: "absolute" as const, bottom: 250, left: 50, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 4 }),
      ]}};

    // 2: Top text with dark gradient, accent line below headline
    case "editorial-top":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, top: 0, left: 0, right: 0, height: 450, background: "linear-gradient(rgba(0,0,0,0.65), transparent)" }),
        textDiv(brand, { position: "absolute" as const, top: 40, left: 50, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 4 }),
        textDiv(upper, { position: "absolute" as const, top: 70, left: 50, right: 50, fontSize: 44, fontWeight: 700, color: "white", lineHeight: 1.2, letterSpacing: 1 }),
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.3))" }),
      ]}};

    // 3: Minimal — small text bottom-left, thin red line
    case "minimal-bottom":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 400, background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }),
        emptyDiv({ position: "absolute" as const, bottom: 200, left: 50, width: 35, height: 2, backgroundColor: "#D02F2E" }),
        textDiv(headline, { position: "absolute" as const, bottom: 140, left: 50, right: 100, fontSize: 34, fontWeight: 700, color: "white", lineHeight: 1.3 }),
      ]}};

    // 4: Centered dark semi-transparent bar with white uppercase text
    case "accent-center":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, top: 580, left: 0, right: 0, height: 140, backgroundColor: "rgba(17,17,17,0.8)" }),
        textDiv(upper, { position: "absolute" as const, top: 610, left: 60, right: 60, fontSize: 36, fontWeight: 700, color: "white", lineHeight: 1.3, letterSpacing: 2, textAlign: "center" as const, justifyContent: "center" as const }),
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.35))" }),
      ]}};

    // 5: Split — brand top-left, headline top with cream/warm tint
    case "split-top":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, top: 0, left: 0, right: 0, height: 380, background: "linear-gradient(rgba(30,20,15,0.7), transparent)" }),
        textDiv(brand, { position: "absolute" as const, top: 35, left: 50, fontSize: 12, fontWeight: 700, color: "#D02F2E", letterSpacing: 5 }),
        textDiv(upper, { position: "absolute" as const, top: 60, left: 50, right: 50, fontSize: 40, fontWeight: 700, color: "#FFEFEF", lineHeight: 1.25, letterSpacing: 1 }),
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.3))" }),
      ]}};

    // 6: Bold bottom — large text, strong gradient, red brand name
    case "bold-bottom":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 600, background: "linear-gradient(transparent, rgba(0,0,0,0.75))" }),
        textDiv(upper, { position: "absolute" as const, bottom: 160, left: 50, right: 50, fontSize: 48, fontWeight: 700, color: "white", lineHeight: 1.15, letterSpacing: 0.5 }),
        textDiv(brand, { position: "absolute" as const, bottom: 130, left: 50, fontSize: 14, fontWeight: 700, color: "#D02F2E", letterSpacing: 4 }),
      ]}};

    // 7: Elegant top — softer gradient, mixed case, subtle
    case "elegant-top":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, top: 0, left: 0, right: 0, height: 400, background: "linear-gradient(rgba(0,0,0,0.55), transparent)" }),
        emptyDiv({ position: "absolute" as const, top: 40, left: 50, width: 30, height: 2, backgroundColor: "rgba(255,255,255,0.4)" }),
        textDiv(headline, { position: "absolute" as const, top: 55, left: 50, right: 60, fontSize: 38, fontWeight: 700, color: "white", lineHeight: 1.3 }),
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.35))" }),
      ]}};

    // 8: Dark bar bottom — solid dark strip with text
    case "dark-bar":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, bottom: 100, left: 0, right: 0, height: 120, backgroundColor: "rgba(17,17,17,0.85)" }),
        textDiv(upper, { position: "absolute" as const, bottom: 140, left: 50, right: 50, fontSize: 34, fontWeight: 700, color: "white", lineHeight: 1.3, letterSpacing: 2 }),
        emptyDiv({ position: "absolute" as const, bottom: 115, left: 50, width: 40, height: 2, backgroundColor: "#D02F2E" }),
      ]}};
  }
}

export async function POST(request: NextRequest) {
  let orgId: string | null = null;

  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;

  if (cronSecret && cronSecret === expectedSecret) {
    const cloned = await request.clone().json();
    orgId = cloned.org_id || null;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await supabase.from("users").select("org_id").eq("id", user.id).single();
    orgId = profile?.org_id || null;
  }

  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = await request.json();
  const { image_url, headline } = body;
  if (!image_url || !headline) return NextResponse.json({ error: "image_url and headline required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).single();
  const brandName = org?.name || "CHERRIES";

  try {
    // Get accessible image URL
    let imgUrl = image_url;
    const storagePath = image_url.split("/object/public/pin-images/")[1];
    if (storagePath) {
      const { data: signedData } = await admin.storage.from("pin-images").createSignedUrl(storagePath, 300);
      if (signedData?.signedUrl) imgUrl = signedData.signedUrl;
    }

    // Download and resize
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return NextResponse.json({ error: `Image download: ${imgRes.status}` }, { status: 500 });
    const base = await sharp(Buffer.from(await imgRes.arrayBuffer()))
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Load font
    const fontRes = await fetch("https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf");
    const fontBuffer = Buffer.from(await fontRes.arrayBuffer());

    // Render overlay
    const style = pickStyle();
    const overlay = buildOverlay(headline, brandName, style);
    const satori = (await import("satori")).default;
    const svg = await satori(overlay as React.ReactNode, {
      width: 1000, height: 1500,
      fonts: [{ name: "Inter", data: fontBuffer, weight: 700, style: "normal" as const }],
    });
    const overlayPng = await sharp(Buffer.from(svg)).resize(1000, 1500).png().toBuffer();

    // Logo — always bottom-left at (30, 1350)
    const { data: bp } = await admin.from("brand_profiles").select("raw_data").eq("org_id", orgId).single();
    const logoUrl = (bp?.raw_data as Record<string, unknown>)?.logo_url as string | undefined;
    const layers: sharp.OverlayOptions[] = [{ input: overlayPng }];

    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const resizedLogo = await sharp(Buffer.from(await logoRes.arrayBuffer())).resize(250, undefined, { fit: "inside" }).png().toBuffer();
          layers.push({ input: resizedLogo, top: 1350, left: 30 });
        }
      } catch { /* skip */ }
    }

    const final = await sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();

    const fileName = `${orgId}/creatives/overlay-${Date.now()}.jpg`;
    const { error: uploadErr } = await admin.storage.from("pin-images").upload(fileName, final, { contentType: "image/jpeg", upsert: false });
    if (uploadErr) return NextResponse.json({ error: `Upload: ${uploadErr.message}` }, { status: 500 });

    const { data: urlData } = admin.storage.from("pin-images").getPublicUrl(fileName);
    return NextResponse.json({ success: true, overlay_url: urlData.publicUrl, style });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed", stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined }, { status: 500 });
  }
}
