import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPinCreative, suggestTemplate, type PinTemplate } from "@/lib/image/pin-templates";
import { KreaClient } from "@/lib/krea/client";
import { decrypt } from "@/lib/encryption";
import sharp from "sharp";

export const maxDuration = 120;

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

  // Load brand settings
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("raw_data")
    .eq("org_id", pin.org_id)
    .single();

  const rawData = (brandProfile?.raw_data || {}) as Record<string, unknown>;
  const cleanProducts = (rawData.clean_products || []) as string[];
  const customScreenshots = (rawData.custom_screenshots || []) as string[];
  const referenceImages = (rawData.reference_images || []) as {
    product_id: string;
    image_urls: string[];
  }[];

  // Pick the clean product image (bg removed) for compositing
  let cleanProductUrl: string | null = null;
  if (cleanProducts.length > 0) {
    cleanProductUrl = cleanProducts[Math.floor(Math.random() * cleanProducts.length)];
  }

  // Fallback reference for non-composite flow
  const productImages = (pin.products?.images || []) as { url: string }[];
  let fallbackImageUrl = customScreenshots[0] || productImages[0]?.url || pin.image_url;

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

  let finalImageUrl = fallbackImageUrl;

  // TWO-STEP PROCESS:
  // 1. Generate AI scene (flat lay table with watercolor cards, NO product)
  // 2. Composite the clean product on top of the AI scene
  if (kreaKey && cleanProductUrl && !skip_krea) {
    try {
      const krea = new KreaClient(kreaKey);
      const productTitle = pin.products?.title || "watercolor kit";

      // Step 1: Generate the background scene WITHOUT the product
      const scenePrompt = buildScenePrompt(productTitle);
      console.log(`[CreatePinImage] Step 1: Generating scene for pin ${pin_id}`);

      const job = await krea.generateImage({
        prompt: scenePrompt,
        width: 1000,
        height: 1500,
      });

      // Poll for completion
      let result = await krea.getTaskStatus(job.id);
      let attempts = 0;
      while (result.status !== "completed" && result.status !== "failed" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 3000));
        result = await krea.getTaskStatus(job.id);
        attempts++;
      }

      if (result.status === "completed" && result.result?.url) {
        const sceneUrl = result.result.url;
        console.log(`[CreatePinImage] Step 1 done: ${sceneUrl}`);

        // Step 2: Download scene + clean product, composite them
        console.log(`[CreatePinImage] Step 2: Compositing product onto scene`);
        const composited = await compositeProductOnScene(sceneUrl, cleanProductUrl);

        // Upload composited image
        const compFileName = `${pin.org_id}/pins/${pin.id}-composited.jpg`;
        const { error: compUploadErr } = await supabase.storage
          .from("pin-images")
          .upload(compFileName, composited, { contentType: "image/jpeg", upsert: true });

        if (!compUploadErr) {
          const { data: compUrlData } = supabase.storage
            .from("pin-images")
            .getPublicUrl(compFileName);
          finalImageUrl = compUrlData.publicUrl;
          console.log(`[CreatePinImage] Step 2 done: ${finalImageUrl}`);
        }
      } else {
        console.warn(`[CreatePinImage] Krea failed, using fallback`);
      }
    } catch (err) {
      console.error(`[CreatePinImage] Error:`, err instanceof Error ? err.message : err);
    }
  }

  try {
    // Step 3: Apply text overlay template on the composited image
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

    const fileName = `${pin.org_id}/pins/${pin.id}-creative.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("pin-images")
      .upload(fileName, result.buffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("pin-images").getPublicUrl(fileName);

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
      krea_used: !!(kreaKey && cleanProductUrl && !skip_krea),
      clean_product: cleanProductUrl,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Creative generation failed",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined,
    }, { status: 500 });
  }
}

/**
 * Download two images and composite the product on top of the scene.
 * Product is placed center-bottom of the scene, scaled to ~40% width.
 */
async function compositeProductOnScene(sceneUrl: string, productUrl: string): Promise<Buffer> {
  // Download both images
  const [sceneRes, productRes] = await Promise.all([
    fetch(sceneUrl),
    fetch(productUrl),
  ]);

  const sceneBuffer = Buffer.from(await sceneRes.arrayBuffer());
  const productBuffer = Buffer.from(await productRes.arrayBuffer());

  // Get scene dimensions
  const sceneMeta = await sharp(sceneBuffer).metadata();
  const sceneW = sceneMeta.width || 1000;
  const sceneH = sceneMeta.height || 1500;

  // Resize product to ~35% of scene width, maintain aspect ratio
  const targetProductW = Math.round(sceneW * 0.35);
  const resizedProduct = await sharp(productBuffer)
    .resize(targetProductW, undefined, { fit: "inside" })
    .png()
    .toBuffer();

  const productMeta = await sharp(resizedProduct).metadata();
  const prodW = productMeta.width || targetProductW;
  const prodH = productMeta.height || targetProductW;

  // Position: center horizontally, place in lower-center area of the scene
  const left = Math.round((sceneW - prodW) / 2);
  const top = Math.round(sceneH * 0.35 - prodH / 2); // Upper-center area

  // Composite
  const composited = await sharp(sceneBuffer)
    .composite([{
      input: resizedProduct,
      left,
      top,
      blend: "over",
    }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return composited;
}

/**
 * Build a scene prompt for Krea text-to-image.
 * This generates the BACKGROUND SCENE ONLY — no product in it.
 * The product will be composited on top afterwards.
 */
function buildScenePrompt(productTitle: string): string {
  const scenes = [
    `Professional overhead flat lay photograph on a warm oak wooden table. 15-20 small hand-painted watercolor cards are scattered across the table showing: pink flowers, a yellow banana, a bee, a cactus, a seashell, a palm tree beach scene, a blue bird, cherry blossoms, a sunset landscape. Two glass jars of dirty paint water, dried flowers, and a few loose brushes as props. An empty clear space in the upper-center of the frame for a product to be placed. Soft warm natural window light. Professional DSLR product photography. No text, no logos. 2:3 vertical.`,

    `Bird's eye view photograph on a round white marble table. 12-18 small watercolor paintings scattered on white cards: a brown bear, a colorful apple, a blue bird, mushrooms, a beach, autumn leaves, a ballerina, bamboo, an American flag. A ceramic coffee cup, eucalyptus sprigs nearby. An open space in the upper-center area of the composition. Bright diffused morning light. Professional photograph. No text. No products in the image. 2:3 vertical.`,

    `Overhead photograph on a light wooden desk. 15+ small hand-painted watercolor artworks scattered on paper cards: sunflowers, a fox, ocean waves, roses, a hummingbird, a mountain landscape, a feather, strawberries. A water brush pen, a glass of water, and scattered pink flower petals. An empty area in the upper-center for product placement. Golden hour sunlight. Professional product photography. No text in the image. 2:3 vertical.`,

    `Top-down flat lay on natural linen cloth draped over a wooden surface. Dozens of small watercolor paintings scattered: a sunflower, a cute cat, cherry blossoms, strawberries, autumn trees, a butterfly, a beach sunset, a rainbow. A cup of coffee and dried lavender nearby. Clear open space in the upper-center of the frame. Soft natural daylight. Professional photography. No text. 2:3 vertical.`,

    `Overhead lifestyle photograph on a rustic wooden table. 10-15 small watercolor paintings on cards scattered loosely: roses, a palm tree, shells, mountains, a cloud, a banana, a bee, a feather, a batman silhouette, a cottage. Glass jars of paint water and cherry blossom petals as props. Open area in the upper-center for a product. Warm afternoon light. Professional photography. No text or overlays. 2:3 vertical.`,
  ];

  return scenes[Math.floor(Math.random() * scenes.length)];
}
