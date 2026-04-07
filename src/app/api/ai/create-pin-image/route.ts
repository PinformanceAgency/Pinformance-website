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

      // Use text-to-image (not image-to-image) for full creative control over composition
      const job = await krea.generateImage({
        prompt: scenePrompt,
        width: 1000,
        height: 1500,
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
  // The Tobio's Watercolor Kit is a very specific product:
  // - Tiny pocket-sized mini watercolor travel set
  // - Dark wooden/bamboo frame with a copper binder clip on top
  // - 8-10 small square watercolor paint pans in bright colors embedded in the wood
  // - Small white mixing area/mirror next to the paint pans
  // - Folds open to reveal a small cream-colored sketchbook underneath
  // - The whole thing fits in one hand — palm-sized
  // - The copper binder clip holds the sketchbook and palette together
  const productDesc = `a tiny pocket-sized wooden watercolor travel palette with a copper binder clip on top, 8 small square paint pans in bright colors (red, blue, yellow, green, orange, purple) embedded in a dark walnut wood frame, a small white mixing area next to the paints, and a mini cream sketchbook that folds open underneath it. The entire kit fits in one hand.`;

  const scenes = [
    `Professional overhead flat lay photograph on a warm oak wooden table. In the center is ${productDesc}. Scattered all around it are 15-20 small hand-painted watercolor cards showing: pink flowers, a yellow banana, a bee, a cactus, a seashell, a palm tree beach scene, a blue bird, a feather, cherry blossoms, a sunset landscape. Two glass jars of dirty paint water, dried flowers, and small brushes as props. Soft warm natural window light from the left. Shot on Canon EOS R5, 35mm lens, f/4. Pinterest-style aspirational product photography. No text, no logos, no words on the image. 2:3 vertical format.`,

    `Bird's eye view product photograph on a round white marble table. Slightly off-center is ${productDesc}. Surrounding it are 12-18 small watercolor paintings on white cards: a brown bear, a colorful apple, a blue bird, mushrooms with a cottage, a beach landscape, batman, autumn leaves, a ballerina, an American flag, bamboo. A ceramic coffee cup, eucalyptus sprigs, and a small saucer nearby. Bright diffused morning light. Professional DSLR photograph, sharp focus. No text overlays, no words anywhere. 2:3 vertical.`,

    `Overhead photograph on a light wooden desk. In the center is ${productDesc} with the sketchbook folded open showing a watercolor painting in progress. Around it are spread 15+ small hand-painted watercolor artworks on paper cards: sunflowers, a fox, ocean waves, tropical fish, roses, a hummingbird, a mountain landscape. A water brush pen, a glass of water, and scattered flower petals as decoration. Golden hour sunlight streaming in. Warm, cozy creative workspace. Professional product photography. Absolutely no text or typography in the image. 2:3 vertical aspect ratio.`,

    `Top-down flat lay on a natural linen cloth over a wooden surface. The hero product is ${productDesc}. Dozens of small watercolor paintings are scattered around it: a sunflower, a cute cat, cherry blossoms, strawberries, a cottage in the woods, autumn trees, a butterfly, a beach sunset. A cup of coffee with latte art and some dried lavender nearby. Soft natural daylight, no harsh shadows. Pinterest-optimized product photo. No text anywhere in the image. 2:3 vertical.`,

    `Lifestyle photograph on a rustic wooden table. ${productDesc} sits open in the center. A woman's hand holds a water brush, painting a small flower on the mini sketchbook. Around the workspace are 10-15 finished small watercolor paintings on cards: roses, a palm tree, shells, clouds, mountains, a rainbow, a banana, a bee. Glass jars of paint water and scattered cherry blossom petals. Warm afternoon light. Cozy creative atmosphere. Professional photography. No text, labels, or overlays in the image. 2:3 vertical format.`,
  ];

  return scenes[Math.floor(Math.random() * scenes.length)];
}
