import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPinCreative, suggestTemplate, type PinTemplate } from "@/lib/image/pin-templates";
import { KreaClient } from "@/lib/krea/client";
import { decrypt } from "@/lib/encryption";

export const maxDuration = 120; // Krea generation can take up to 60s

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;
  if (!cronSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pin_id, text_lines, template, review_author, review_title, accent_color, stat_number, skip_krea } = body;

  if (!pin_id) {
    return NextResponse.json({ error: "pin_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: pin } = await supabase
    .from("pins")
    .select("*, products(*)")
    .eq("id", pin_id)
    .single();

  if (!pin) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name, krea_api_key_encrypted")
    .eq("id", pin.org_id)
    .single();

  // Load reference images from brand profile
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("raw_data")
    .eq("org_id", pin.org_id)
    .single();

  const rawData = (brandProfile?.raw_data || {}) as Record<string, unknown>;
  const referenceImages = (rawData.reference_images || []) as {
    product_id: string;
    image_urls: string[];
  }[];

  // Pick a reference image for this product
  const productImages = (pin.products?.images || []) as { url: string }[];
  let referenceImageUrl: string | null = null;

  const productRef = referenceImages.find((ri) => ri.product_id === pin.product_id);
  if (productRef && productRef.image_urls.length > 0) {
    const idx = Math.floor(Math.random() * productRef.image_urls.length);
    referenceImageUrl = productRef.image_urls[idx];
  }
  if (!referenceImageUrl) {
    const allRefUrls = referenceImages.flatMap((ri) => ri.image_urls);
    if (allRefUrls.length > 0) {
      referenceImageUrl = allRefUrls[Math.floor(Math.random() * allRefUrls.length)];
    }
  }
  if (!referenceImageUrl) {
    referenceImageUrl = productImages[0]?.url || pin.image_url;
  }

  if (!referenceImageUrl) {
    return NextResponse.json({ error: "No product image found" }, { status: 400 });
  }

  const overlayText = text_lines || [pin.title];
  const resolvedTemplate: PinTemplate = template || suggestTemplate(
    "lifestyle",
    (pin.title || "").substring(0, 50),
    overlayText
  );

  // Get Krea API key
  let kreaKey: string | null = null;
  if (org?.krea_api_key_encrypted) {
    try { kreaKey = decrypt(org.krea_api_key_encrypted); } catch { /* fallback */ }
  }
  if (!kreaKey && process.env.KREA_API_KEY) {
    kreaKey = process.env.KREA_API_KEY;
  }

  let finalImageUrl = referenceImageUrl;

  // Use Krea Kontext to generate a new lifestyle image if key available and not skipped
  if (kreaKey && !skip_krea) {
    try {
      const krea = new KreaClient(kreaKey);
      const productTitle = pin.products?.title || "watercolor kit";

      // Build a lifestyle scene prompt based on the product
      const scenePrompt = buildLifestylePrompt(productTitle, overlayText[0] || "");

      console.log(`[CreatePinImage] Generating Krea Kontext image for pin ${pin_id}`);
      console.log(`[CreatePinImage] Reference image: ${referenceImageUrl}`);
      console.log(`[CreatePinImage] Prompt: ${scenePrompt.substring(0, 200)}...`);

      const job = await krea.generateKontext({
        prompt: scenePrompt,
        imageUrl: referenceImageUrl,
        width: 1000,
        height: 1500,
        strength: 0.55, // Keep product recognizable but restyle the scene
        steps: 28,
      });

      // Poll for completion (max 90 seconds)
      let result = await krea.getTaskStatus(job.id);
      let attempts = 0;
      while (result.status !== "completed" && result.status !== "failed" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 3000));
        result = await krea.getTaskStatus(job.id);
        attempts++;
      }

      if (result.status === "completed" && result.result?.url) {
        finalImageUrl = result.result.url;
        console.log(`[CreatePinImage] Krea generated: ${finalImageUrl}`);
      } else {
        console.warn(`[CreatePinImage] Krea failed after ${attempts} attempts, using reference image`);
      }
    } catch (err) {
      console.error(`[CreatePinImage] Krea error:`, err instanceof Error ? err.message : err);
      // Fall back to reference image with overlay
    }
  }

  try {
    const result = await renderPinCreative({
      template: resolvedTemplate,
      productImageUrl: finalImageUrl,
      brandName: org?.name || "TobiosKits",
      textLines: overlayText,
      reviewAuthor: review_author,
      reviewTitle: review_title,
      accentColor: accent_color,
      statNumber: stat_number,
    });

    // Upload to Supabase storage
    const fileName = `${pin.org_id}/pins/${pin.id}-creative.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("pin-images")
      .upload(fileName, result.buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("pin-images")
      .getPublicUrl(fileName);

    await supabase.from("pins").update({
      image_url: urlData.publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", pin.id);

    return NextResponse.json({
      success: true,
      pin_id: pin.id,
      image_url: urlData.publicUrl,
      template: resolvedTemplate,
      text_lines: overlayText,
      krea_used: kreaKey && !skip_krea ? true : false,
      reference_image: referenceImageUrl,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Creative generation failed",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined,
    }, { status: 500 });
  }
}

/**
 * Build a lifestyle scene prompt for Krea Kontext.
 * The product in the reference image is preserved (Kontext keeps it),
 * but the scene/environment is restyled.
 */
function buildLifestylePrompt(productTitle: string, pinTopic: string): string {
  // Variety of lifestyle scenes that work well for watercolor/art products on Pinterest
  const scenes = [
    `Professional product photography of a ${productTitle} arranged on a warm wooden table with soft natural window light. Cozy lifestyle setting with scattered watercolor paintings, a cup of coffee, dried flowers, and art supplies. Overhead flat lay composition. Clean, bright, Pinterest-style aspirational photo. 2:3 vertical format.`,
    `Beautiful lifestyle flat lay of a ${productTitle} on a marble surface surrounded by finished watercolor paintings, brushes, and a glass of water. Soft morning light from the side. Warm, inviting creative workspace. High-end product photography for Pinterest. 2:3 vertical.`,
    `Cozy creative workspace with ${productTitle} as the hero product. Wooden desk, watercolor paintings spread out, paint palette with mixed colors, water brush in hand. Natural daylight, warm tones. Aspirational lifestyle photography. Pinterest-optimized vertical composition.`,
    `Artistic overhead shot of ${productTitle} on a linen cloth with watercolor art cards spread around it. Eucalyptus sprigs, coffee cup, and art supplies as props. Soft diffused lighting. Clean, modern, Pinterest aesthetic. Professional product photography.`,
    `Lifestyle product photo of ${productTitle} in a real creative setting. Person painting with the kit at a sunlit desk. Watercolor paintings visible, art supplies arranged naturally. Warm, encouraging atmosphere. High quality DSLR photography style.`,
  ];

  return scenes[Math.floor(Math.random() * scenes.length)];
}
