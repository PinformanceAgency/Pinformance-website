import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderPinCreative, suggestTemplate, type PinTemplate } from "@/lib/image/pin-templates";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;
  if (!cronSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pin_id, text_lines, template, review_author, review_title, accent_color, stat_number } = body;

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
    .select("name")
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

  // Pick image: prefer reference images for this product, then any reference image, then product default
  const productImages = (pin.products?.images || []) as { url: string }[];
  let sourceImageUrl: string | null = null;

  // 1. Check reference images for this specific product
  const productRef = referenceImages.find((ri) => ri.product_id === pin.product_id);
  if (productRef && productRef.image_urls.length > 0) {
    // Rotate through selected reference images
    const idx = Math.floor(Math.random() * productRef.image_urls.length);
    sourceImageUrl = productRef.image_urls[idx];
  }

  // 2. Fall back to any reference image from any product
  if (!sourceImageUrl) {
    const allRefUrls = referenceImages.flatMap((ri) => ri.image_urls);
    if (allRefUrls.length > 0) {
      const idx = Math.floor(Math.random() * allRefUrls.length);
      sourceImageUrl = allRefUrls[idx];
    }
  }

  // 3. Fall back to product's first image
  if (!sourceImageUrl) {
    sourceImageUrl = productImages[0]?.url || pin.image_url;
  }

  if (!sourceImageUrl) {
    return NextResponse.json({ error: "No product image found" }, { status: 400 });
  }

  const overlayText = text_lines || [pin.title];

  // Auto-suggest template if none provided, using pin metadata
  const visualStyle = pin.generation_prompt ? "lifestyle" : "hero";
  const resolvedTemplate: PinTemplate = template || suggestTemplate(
    visualStyle,
    (pin.title || "").substring(0, 50),
    overlayText
  );

  try {
    const result = await renderPinCreative({
      template: resolvedTemplate,
      productImageUrl: sourceImageUrl,
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
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Creative generation failed",
      stack: err instanceof Error ? err.stack?.split("\n").slice(0, 3) : undefined,
    }, { status: 500 });
  }
}
