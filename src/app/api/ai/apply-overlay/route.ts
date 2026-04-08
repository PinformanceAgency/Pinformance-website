import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const maxDuration = 60;

// 5 overlay style variants
type OverlayStyle = "top" | "bottom" | "center" | "accent-top" | "accent-bottom";

function pickStyle(): OverlayStyle {
  const styles: OverlayStyle[] = ["top", "bottom", "center", "accent-top", "accent-bottom"];
  return styles[Math.floor(Math.random() * styles.length)];
}

function buildSvgOverlay(headline: string, style: OverlayStyle): string {
  const h = headline.toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Word wrap: split into lines of max ~22 chars
  const words = h.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 22 && cur) { lines.push(cur.trim()); cur = w; }
    else { cur = (cur + " " + w).trim(); }
  }
  if (cur) lines.push(cur.trim());

  const lineH = 60;
  const textBlock = (x: number, startY: number) =>
    lines.map((l, i) => `<text x="${x}" y="${startY + i * lineH}" font-size="48" font-weight="700" fill="white" font-family="Georgia,Times,serif" letter-spacing="3">${l}</text>`).join("");

  const textBlockH = lines.length * lineH;

  switch (style) {
    case "top":
      return `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="1000" height="${textBlockH + 120}" fill="url(#g1)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0.6"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
        ${textBlock(55, 75)}
        <rect x="0" y="1350" width="1000" height="150" fill="url(#g2)"/>
        <defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/></linearGradient></defs>
      </svg>`;

    case "bottom":
      return `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="${1500 - textBlockH - 250}" width="1000" height="${textBlockH + 250}" fill="url(#g1)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.65"/></linearGradient></defs>
        ${textBlock(55, 1500 - textBlockH - 100)}
      </svg>`;

    case "center":
      const cy = 750 - (textBlockH / 2);
      return `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
        <rect x="40" y="${cy - 30}" width="920" height="${textBlockH + 60}" rx="4" fill="rgba(17,17,17,0.75)"/>
        ${textBlock(80, cy + 40)}
        <rect x="0" y="1350" width="1000" height="150" fill="url(#g1)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs>
      </svg>`;

    case "accent-top":
      return `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="1000" height="${textBlockH + 140}" fill="url(#g1)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0.6"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
        <rect x="55" y="45" width="50" height="4" fill="#D02F2E"/>
        ${textBlock(55, 95)}
        <rect x="0" y="1350" width="1000" height="150" fill="url(#g2)"/>
        <defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.4"/></linearGradient></defs>
      </svg>`;

    case "accent-bottom":
      return `<svg width="1000" height="1500" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="${1500 - textBlockH - 280}" width="1000" height="${textBlockH + 280}" fill="url(#g1)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.7"/></linearGradient></defs>
        <rect x="55" y="${1500 - textBlockH - 160}" width="40" height="3" fill="#D02F2E"/>
        ${textBlock(55, 1500 - textBlockH - 110)}
      </svg>`;
  }
}

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

  try {
    const imgRes = await fetch(image_url);
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const base = await sharp(imgBuffer)
      .resize(1000, 1500, { fit: "cover", position: "centre" })
      .jpeg({ quality: 95 })
      .toBuffer();

    const style = pickStyle();
    const svgStr = buildSvgOverlay(headline, style);
    const overlayPng = await sharp(Buffer.from(svgStr)).resize(1000, 1500).png().toBuffer();

    const layers: sharp.OverlayOptions[] = [{ input: overlayPng }];

    if (logo_url) {
      try {
        const logoRes = await fetch(logo_url);
        if (logoRes.ok) {
          const rawLogo = Buffer.from(await logoRes.arrayBuffer());
          const resizedLogo = await sharp(rawLogo).resize(250, undefined, { fit: "inside" }).png().toBuffer();
          layers.push({ input: resizedLogo, top: 1360, left: 30 });
        }
      } catch { /* skip */ }
    }

    const final = await sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();

    const fileName = `${profile.org_id}/creatives/overlay-${Date.now()}.jpg`;
    const { error: uploadErr } = await admin.storage.from("pin-images").upload(fileName, final, { contentType: "image/jpeg", upsert: false });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: urlData } = admin.storage.from("pin-images").getPublicUrl(fileName);

    return NextResponse.json({ success: true, overlay_url: urlData.publicUrl, style });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Overlay failed" }, { status: 500 });
  }
}
