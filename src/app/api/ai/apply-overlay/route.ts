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

    // 4: Soft center gradient with centered text
    case "accent-center":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, top: 530, left: 0, right: 0, height: 240, background: "linear-gradient(transparent, rgba(0,0,0,0.5), transparent)" }),
        textDiv(upper, { position: "absolute" as const, top: 600, left: 60, right: 60, fontSize: 36, fontWeight: 700, color: "white", lineHeight: 1.3, letterSpacing: 2, textAlign: "center" as const, justifyContent: "center" as const }),
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150, background: "linear-gradient(transparent, rgba(0,0,0,0.3))" }),
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

    // 8: Soft bottom — wide soft gradient with mixed-case headline + subtle brand
    case "dark-bar":
      return { type: "div" as const, props: { style: base, children: [
        emptyDiv({ position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 500, background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }),
        textDiv(headline, { position: "absolute" as const, bottom: 150, left: 50, right: 50, fontSize: 38, fontWeight: 700, color: "white", lineHeight: 1.3 }),
        {
          type: "div" as const,
          props: {
            style: { display: "flex" as const, position: "absolute" as const, bottom: 115, left: 50, alignItems: "center" as const, gap: "10px" },
            children: [
              emptyDiv({ width: 25, height: 2, backgroundColor: "#D02F2E" }),
              textDiv(brand, { fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: 3 }),
            ],
          },
        },
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
  const { image_url, headline, variant } = body;
  // variant: "full" (text+logo), "logo-only" (just logo), "clean" (nothing)
  if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });

  const admin = createAdminClient();

  // Clean variant: just resize to 2:3, no overlay, no logo
  if (variant === "clean") {
    try {
      let imgUrl = image_url;
      const sp = image_url.split("/object/public/pin-images/")[1];
      if (sp) {
        const { data: sd } = await admin.storage.from("pin-images").createSignedUrl(sp, 300);
        if (sd?.signedUrl) imgUrl = sd.signedUrl;
      }
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) return NextResponse.json({ error: `Download: ${imgRes.status}` }, { status: 500 });
      const resized = await sharp(Buffer.from(await imgRes.arrayBuffer()))
        .resize(1000, 1500, { fit: "cover", position: "centre" })
        .jpeg({ quality: 92 })
        .toBuffer();

      const fileName = `${orgId}/creatives/clean-${Date.now()}.jpg`;
      const { error: ue } = await admin.storage.from("pin-images").upload(fileName, resized, { contentType: "image/jpeg", upsert: false });
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
      const { data: ud } = admin.storage.from("pin-images").getPublicUrl(fileName);
      return NextResponse.json({ success: true, overlay_url: ud.publicUrl, variant: "clean" });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
    }
  }

  if (!headline && variant !== "logo-only") return NextResponse.json({ error: "headline required for full variant" }, { status: 400 });

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

    // Logo-only variant: just resize + add logo, no text overlay
    if (variant === "logo-only") {
      const { data: bp2 } = await admin.from("brand_profiles").select("raw_data").eq("org_id", orgId).single();
      const logoUrl2 = (bp2?.raw_data as Record<string, unknown>)?.logo_url as string | undefined;
      const layers2: sharp.OverlayOptions[] = [];

      if (logoUrl2) {
        const logoRes2 = await fetch(logoUrl2);
        if (logoRes2.ok) {
          const resizedLogo2 = await sharp(Buffer.from(await logoRes2.arrayBuffer())).resize(200, undefined, { fit: "inside" }).png().toBuffer();
          // Check brightness of top-left for logo placement
          const tlStats = await sharp(base).extract({ left: 20, top: 20, width: 200, height: 100 }).stats();
          const tlBrightness = tlStats.channels.reduce((s, c) => s + c.mean, 0) / tlStats.channels.length;
          layers2.push({ input: resizedLogo2, top: tlBrightness > 120 ? 30 : 1370, left: 30 });
        }
      }

      const final2 = layers2.length > 0
        ? await sharp(base).composite(layers2).jpeg({ quality: 92 }).toBuffer()
        : base;

      const fn2 = `${orgId}/creatives/logo-${Date.now()}.jpg`;
      const { error: ue2 } = await admin.storage.from("pin-images").upload(fn2, final2, { contentType: "image/jpeg", upsert: false });
      if (ue2) return NextResponse.json({ error: ue2.message }, { status: 500 });
      const { data: ud2 } = admin.storage.from("pin-images").getPublicUrl(fn2);
      return NextResponse.json({ success: true, overlay_url: ud2.publicUrl, variant: "logo-only" });
    }

    // Load font for full overlay
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

    // Logo placement: prefer top-left, fall back to bottom-left if contrast is bad
    const { data: bp } = await admin.from("brand_profiles").select("raw_data").eq("org_id", orgId).single();
    const logoUrl = (bp?.raw_data as Record<string, unknown>)?.logo_url as string | undefined;
    const layers: sharp.OverlayOptions[] = [{ input: overlayPng }];

    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const resizedLogo = await sharp(Buffer.from(await logoRes.arrayBuffer())).resize(200, undefined, { fit: "inside" }).png().toBuffer();

          // Measure brightness of top-left corner (100x100 area) of the base image
          const topLeftRegion = await sharp(base)
            .extract({ left: 20, top: 20, width: 200, height: 100 })
            .stats();
          const avgBrightness = topLeftRegion.channels.reduce((sum, ch) => sum + ch.mean, 0) / topLeftRegion.channels.length;

          // Logo is dark/black text — needs light background (brightness > 120)
          // If top-left is too dark, place logo bottom-left instead
          const logoIsTopLeft = avgBrightness > 120;

          // Check if the overlay text is in the same zone as the logo
          // Text-top styles: editorial-top, split-top, accent-top, elegant-top → logo goes bottom
          const textIsTop = ["editorial-top", "split-top", "accent-top", "elegant-top"].includes(style);
          // Text-bottom styles: hero-bottom, bold-bottom, minimal-bottom, accent-bottom, dark-bar → logo goes top
          const textIsBottom = ["hero-bottom", "bold-bottom", "minimal-bottom", "accent-bottom", "dark-bar"].includes(style);

          let logoTop: number;
          if (textIsTop) {
            // Text is at top → logo must go bottom-left
            logoTop = 1370;
          } else if (textIsBottom && logoIsTopLeft) {
            // Text is at bottom + top-left is bright enough → logo top-left
            logoTop = 30;
          } else if (textIsBottom) {
            // Text is at bottom but top-left too dark → logo still bottom but offset above text
            logoTop = 1100;
          } else {
            // Center text → place logo top-left if bright, otherwise bottom
            logoTop = logoIsTopLeft ? 30 : 1370;
          }

          layers.push({ input: resizedLogo, top: logoTop, left: 30 });
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
