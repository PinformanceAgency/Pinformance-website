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
        strength: 0.85, // High strength: extract product, generate new lifestyle scene
        steps: 30,
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
  // Prompts that tell Krea to extract the product and place it in a new lifestyle scene.
  // Inspired by high-performing Pinterest watercolor/art pins: overhead flat lays with
  // the product surrounded by finished paintings, art supplies, and cozy props.
  const scenes = [
    `Extract the watercolor painting kit from this image and place it in a completely new scene. Overhead flat lay on a warm wooden table. The kit is surrounded by small finished watercolor paintings of flowers, animals, and landscapes spread around it. A cup of coffee, dried flowers, and a water brush as props. Soft natural window light. Professional Pinterest product photography. No text overlays. 2:3 vertical.`,

    `Take the product from this image and photograph it in a new lifestyle setting. Top-down view on a white marble round table. The watercolor kit is open with small painted watercolor cards scattered around showing colorful illustrations. A coffee mug, eucalyptus sprigs, and art supplies nearby. Bright, airy, natural morning light. Pinterest aesthetic. No text. 2:3 vertical.`,

    `Remove the background and place this product in a cozy creative workspace. Bird's eye view of a wooden desk with the watercolor kit as the centerpiece. Small watercolor paintings of nature scenes, fruits, and animals are spread out around it. Paint palette with mixed colors, water glass, and brushes visible. Warm golden hour lighting. High-end product photography. No text overlays. 2:3 vertical.`,

    `Extract the product and create a new aspirational flat lay scene. The watercolor kit sits on a linen tablecloth, surrounded by dozens of small hand-painted watercolor cards showing botanical illustrations, cute animals, sunsets, and abstract designs. A ceramic cup of tea and some dried lavender sprigs as accents. Soft diffused daylight from above. Clean, modern, Pinterest-style. No text. 2:3 vertical.`,

    `Place this watercolor kit product in a beautiful new overhead shot. Warm wooden surface. The kit is opened and surrounded by scattered small watercolor paintings — flowers, birds, beach scenes, mushrooms. A hand holding a water brush, painting in progress. Natural sunlight, cozy atmosphere. Professional product photography for Pinterest. No text or logos. 2:3 vertical.`,
  ];

  return scenes[Math.floor(Math.random() * scenes.length)];
}
