import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const webhookSecret = request.headers.get("x-webhook-secret");
  if (process.env.KREA_WEBHOOK_SECRET && webhookSecret !== process.env.KREA_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { task_id, status, result, error: taskError } = body;

  if (!task_id) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find pin by krea_job_id
  const { data: pin, error: findError } = await admin
    .from("pins")
    .select("id, org_id")
    .eq("krea_job_id", task_id)
    .single();

  if (findError || !pin) {
    return NextResponse.json({ error: "Pin not found for task" }, { status: 404 });
  }

  if (status === "failed") {
    await admin
      .from("pins")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pin.id);

    return NextResponse.json({ success: true, status: "failed" });
  }

  if (status === "completed" && result?.url) {
    // Download image from kie.ai
    const imageRes = await fetch(result.url);
    if (!imageRes.ok) {
      await admin
        .from("pins")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pin.id);
      return NextResponse.json({ error: "Failed to download image" }, { status: 500 });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const ext = result.url.includes(".png") ? "png" : "jpg";
    const storagePath = `${pin.org_id}/pins/${pin.id}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("pin-images")
      .upload(storagePath, imageBuffer, {
        contentType: `image/${ext === "png" ? "png" : "jpeg"}`,
        upsert: true,
      });

    if (uploadError) {
      await admin
        .from("pins")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pin.id);
      return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
    }

    const { data: publicUrl } = admin.storage
      .from("pin-images")
      .getPublicUrl(storagePath);

    await admin
      .from("pins")
      .update({
        status: "generated",
        image_url: publicUrl.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pin.id);

    return NextResponse.json({ success: true, status: "generated" });
  }

  return NextResponse.json({ success: true });
}
