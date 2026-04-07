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
  // Overhead flat lay scenes matching high-performing Pinterest watercolor pins.
  // The product is a small wooden watercolor palette kit with colorful paint tubes.
  // Key visual: dozens of small hand-painted watercolor cards spread around the product.
  const scenes = [
    `Professional overhead flat lay photograph on a warm oak wooden table. A small portable watercolor painting kit with a wooden palette sits in the center. Scattered all around it are 15-20 small hand-painted watercolor cards showing: pink flowers, a yellow banana, a bee, a cactus, a seashell, a palm tree beach scene, a bird, a feather, cherry blossoms, a sunset. Two glass jars of water, a few loose paint brushes, and small dried flowers as props. Soft warm natural window light from the left. Shot on Canon EOS R5, 35mm lens, f/4. Pinterest-style aspirational product photography. No text, no logos, no words on the image. 2:3 vertical format.`,

    `Bird's eye view product photograph on a round white marble table. A compact watercolor art kit with tubes of paint and a wooden palette is placed slightly off-center. Surrounding it are 12-18 small watercolor paintings on cards: a brown bear, a colorful apple, a blue bird, mushrooms, a beach landscape, a pink flamingo, batman, autumn leaves, tropical fish, a ballerina. A ceramic coffee cup, eucalyptus sprigs, and a saucer nearby. Bright diffused morning light. Professional DSLR photograph, sharp focus. No text overlays, no words. 2:3 vertical.`,

    `Overhead photograph on a light wooden desk. A beginner watercolor painting kit is open showing colorful paint tubes arranged in a rainbow. Around it are spread 15+ small hand-painted watercolor artworks on paper cards: flowers, animals, fruits, landscapes, seasonal themes. A water brush pen, a glass of water, and scattered flower petals as decoration. Golden hour sunlight streaming in. Warm, cozy, inviting creative workspace. Professional product photography for social media. Absolutely no text or typography in the image. 2:3 vertical aspect ratio.`,

    `Top-down flat lay on a natural linen cloth draped over a wooden surface. A portable watercolor set with a bamboo palette and 12 colorful paint tubes is the hero product. Dozens of small watercolor paintings are scattered around it: a sunflower, a cute cat, ocean waves, a hummingbird, strawberries, a cottage, autumn trees, a butterfly. A cup of coffee with latte art and some dried lavender nearby. Soft natural daylight, no harsh shadows. Canon 5D Mark IV, 50mm, f/2.8. Pinterest-optimized product photo. No text anywhere in the image. 2:3 vertical.`,

    `Overhead lifestyle photograph on a rustic wooden table. A watercolor painting kit with colorful tubes and brushes sits open. A person's hand holds a water brush, painting a small flower card. Around the workspace are 10-15 finished small watercolor paintings: roses, a palm tree, shells, a fox, clouds, mountains, a rainbow. Paint water jars, a small palette with mixed colors, and scattered cherry blossom petals. Warm afternoon light. Cozy creative atmosphere. Professional photography. No text, labels, or overlays in the image. 2:3 vertical format.`,
  ];

  return scenes[Math.floor(Math.random() * scenes.length)];
}
