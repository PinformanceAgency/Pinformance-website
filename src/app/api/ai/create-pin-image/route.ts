import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPinOverlay } from "@/lib/image/overlay";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth via cron secret
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET || process.env.CRON_SET;
  if (!cronSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pin_id, text_lines, style, position } = body;

  if (!pin_id) {
    return NextResponse.json({ error: "pin_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get pin with product and org data
  const { data: pin } = await supabase
    .from("pins")
    .select("*, products(*), boards(*)")
    .eq("id", pin_id)
    .single();

  if (!pin) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  // Get org for brand name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", pin.org_id)
    .single();

  // Get product image URL
  const productImages = (pin.products?.images || []) as { url: string }[];
  const sourceImageUrl = pin.image_url || productImages[0]?.url;

  if (!sourceImageUrl) {
    return NextResponse.json({ error: "No source image available for this pin" }, { status: 400 });
  }

  // Use provided text lines or generate from pin content
  const overlayText = text_lines || [
    pin.products?.title || pin.title,
  ];

  try {
    const result = await createPinOverlay({
      imageUrl: sourceImageUrl,
      textLines: overlayText,
      brandName: org?.name,
      style: style || "bullets",
      position: position || "top",
    });

    // Upload to Supabase storage
    const fileName = `${pin.org_id}/pins/${pin.id}-overlay.jpg`;
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

    // Update pin with new overlay image
    await supabase.from("pins").update({
      image_url: urlData.publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", pin.id);

    return NextResponse.json({
      success: true,
      pin_id: pin.id,
      image_url: urlData.publicUrl,
      text_lines: overlayText,
      style,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Overlay creation failed",
    }, { status: 500 });
  }
}
