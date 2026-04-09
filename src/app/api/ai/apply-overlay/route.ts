import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const maxDuration = 60;

const TEMPLATE_STYLES = ["lifestyle", "hero", "editorial"] as const;

export async function POST(request: NextRequest) {
  // Auth: user session OR cron secret
  let orgId: string | null = null;

  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;

  if (cronSecret && cronSecret === expectedSecret) {
    const body = await request.clone().json();
    orgId = body.org_id || null;
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
    // Step 1: Get a usable image URL (signed if from Supabase)
    let imgUrl = image_url;
    const storagePath = image_url.split("/object/public/pin-images/")[1];
    if (storagePath) {
      const { data: signedData } = await admin.storage.from("pin-images").createSignedUrl(storagePath, 300);
      if (signedData?.signedUrl) imgUrl = signedData.signedUrl;
    }

    // Step 2: Download the image
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) return NextResponse.json({ error: `Image download failed: ${imgRes.status}`, url: imgUrl.substring(0, 100) }, { status: 500 });
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Resize to Pinterest 2:3
    const base = await sharp(imgBuffer)
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Step 4: Load Inter Bold font for text
    const fontRes = await fetch("https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrib2Bg-4.ttf");
    const fontBuffer = Buffer.from(await fontRes.arrayBuffer());

    // Step 5: Render text overlay using Satori (dynamic import to avoid bundle issues)
    const satori = (await import("satori")).default;

    const headlineText = headline.toUpperCase();
    const template = TEMPLATE_STYLES[Math.floor(Math.random() * TEMPLATE_STYLES.length)];

    // Build overlay element based on template style
    const overlay = buildOverlayElement(headlineText, brandName, template);

    const svg = await satori(overlay as React.ReactNode, {
      width: 1000,
      height: 1500,
      fonts: [{ name: "Inter", data: fontBuffer, weight: 700, style: "normal" as const }],
    });

    const overlayPng = await sharp(Buffer.from(svg)).resize(1000, 1500).png().toBuffer();

    // Step 6: Download logo
    const { data: bp } = await admin.from("brand_profiles").select("raw_data").eq("org_id", orgId).single();
    const logoUrl = (bp?.raw_data as Record<string, unknown>)?.logo_url as string | undefined;
    let logoLayer: sharp.OverlayOptions | null = null;

    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const rawLogo = Buffer.from(await logoRes.arrayBuffer());
          const resizedLogo = await sharp(rawLogo).resize(250, undefined, { fit: "inside" }).png().toBuffer();
          logoLayer = { input: resizedLogo, top: 1350, left: 30 };
        }
      } catch { /* skip */ }
    }

    // Step 7: Composite base + overlay + logo
    const layers: sharp.OverlayOptions[] = [{ input: overlayPng }];
    if (logoLayer) layers.push(logoLayer);

    const final = await sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();

    // Step 8: Upload
    const fileName = `${orgId}/creatives/overlay-${Date.now()}.jpg`;
    const { error: uploadErr } = await admin.storage.from("pin-images").upload(fileName, final, { contentType: "image/jpeg", upsert: false });
    if (uploadErr) return NextResponse.json({ error: `Upload: ${uploadErr.message}` }, { status: 500 });

    const { data: urlData } = admin.storage.from("pin-images").getPublicUrl(fileName);

    return NextResponse.json({ success: true, overlay_url: urlData.publicUrl, template });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Overlay failed",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5) : undefined,
    }, { status: 500 });
  }
}

function textDiv(text: string, style: Record<string, unknown>) {
  return { type: "div" as const, props: { style: { display: "flex" as const, ...style }, children: text } };
}

function emptyDiv(style: Record<string, unknown>) {
  return { type: "div" as const, props: { style: { display: "flex" as const, ...style }, children: "" } };
}

function buildOverlayElement(headline: string, brandName: string, template: string) {
  // All styles: transparent background (overlay only), white text on gradient
  if (template === "hero") {
    return {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, width: 1000, height: 1500, position: "relative" as const },
        children: [
          textDiv(brandName.toUpperCase(), {
            position: "absolute" as const, top: 40, left: 50,
            fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.8)",
            letterSpacing: 3, textTransform: "uppercase" as const,
          }),
          emptyDiv({
            position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 500,
            background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          }),
          textDiv(headline, {
            position: "absolute" as const, bottom: 120, left: 50, right: 50,
            fontSize: 44, fontWeight: 700, color: "white", lineHeight: 1.2, letterSpacing: 1,
          }),
          emptyDiv({
            position: "absolute" as const, bottom: 80, left: 50,
            width: 45, height: 3, backgroundColor: "#D02F2E",
          }),
        ],
      },
    };
  }

  if (template === "editorial") {
    return {
      type: "div" as const,
      props: {
        style: { display: "flex" as const, width: 1000, height: 1500, position: "relative" as const },
        children: [
          emptyDiv({
            position: "absolute" as const, top: 0, left: 0, right: 0, height: 400,
            background: "linear-gradient(rgba(0,0,0,0.6), transparent)",
          }),
          emptyDiv({
            position: "absolute" as const, top: 45, left: 50, width: 45, height: 3, backgroundColor: "#D02F2E",
          }),
          textDiv(headline, {
            position: "absolute" as const, top: 65, left: 50, right: 50,
            fontSize: 42, fontWeight: 700, color: "white", lineHeight: 1.25, letterSpacing: 1,
          }),
          emptyDiv({
            position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 150,
            background: "linear-gradient(transparent, rgba(0,0,0,0.35))",
          }),
        ],
      },
    };
  }

  // lifestyle (default)
  return {
    type: "div" as const,
    props: {
      style: { display: "flex" as const, width: 1000, height: 1500, position: "relative" as const },
      children: [
        emptyDiv({
          position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 450,
          background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
        }),
        textDiv(headline, {
          position: "absolute" as const, bottom: 130, left: 50, right: 50,
          fontSize: 40, fontWeight: 700, color: "white", lineHeight: 1.25, letterSpacing: 1,
        }),
        {
          type: "div" as const,
          props: {
            style: { display: "flex" as const, position: "absolute" as const, bottom: 95, left: 50, alignItems: "center" as const, gap: "10px" },
            children: [
              emptyDiv({ width: 30, height: 3, backgroundColor: "#D02F2E" }),
              textDiv(brandName.toUpperCase(), {
                fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 3,
              }),
            ],
          },
        },
      ],
    },
  };
}
