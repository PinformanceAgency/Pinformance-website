import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KreaClient } from "@/lib/krea/client";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  const isAuthed = cronSecret === process.env.CRON_SECRET;

  // Also allow authenticated users to trigger
  if (!isAuthed) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const orgId = body.org_id;

  const admin = createAdminClient();
  const globalKreaApiKey = process.env.KREA_API_KEY;

  // Find pins that have generation_prompt but no image yet
  const query = admin
    .from("pins")
    .select("id, org_id, generation_prompt")
    .is("image_url", null)
    .not("generation_prompt", "is", null)
    .in("status", ["generated", "generating"])
    .order("created_at", { ascending: true })
    .limit(10);

  if (orgId) {
    query.eq("org_id", orgId);
  }

  const { data: pins, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pins || pins.length === 0) {
    return NextResponse.json({ message: "No pins need image generation", generated: 0 });
  }

  // Group pins by org_id
  const pinsByOrg = new Map<string, typeof pins>();
  for (const pin of pins) {
    const existing = pinsByOrg.get(pin.org_id) || [];
    existing.push(pin);
    pinsByOrg.set(pin.org_id, existing);
  }

  // Build a KreaClient per org (use per-org key if available, else global)
  const kreaClients = new Map<string, KreaClient>();
  for (const orgKey of pinsByOrg.keys()) {
    const { data: orgData } = await admin
      .from("organizations")
      .select("krea_api_key_encrypted")
      .eq("id", orgKey)
      .single();

    let kreaKey = globalKreaApiKey;
    if (orgData?.krea_api_key_encrypted) {
      try {
        kreaKey = decrypt(orgData.krea_api_key_encrypted);
      } catch {
        // Fall back to global key if decryption fails
      }
    }

    if (!kreaKey) {
      // No key available for this org at all — skip
      continue;
    }

    kreaClients.set(orgKey, new KreaClient(kreaKey));
  }

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/krea`
    : undefined;

  let generated = 0;
  const errors: { pin_id: string; error: string }[] = [];

  for (const pin of pins) {
    const krea = kreaClients.get(pin.org_id);
    if (!krea) {
      errors.push({
        pin_id: pin.id,
        error: "No KREA_API_KEY configured for this organization",
      });
      continue;
    }

    try {
      // Mark as generating
      await admin
        .from("pins")
        .update({ status: "generating", updated_at: new Date().toISOString() })
        .eq("id", pin.id);

      const result = await krea.generateImage({
        prompt: pin.generation_prompt!,
        aspect_ratio: "2:3",
        width: 1000,
        height: 1500,
        webhook_url: webhookUrl,
      });

      // Store the Krea task/job ID
      await admin
        .from("pins")
        .update({
          krea_job_id: result.id || result.task_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pin.id);

      generated++;

      // Small delay between API calls to be respectful
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      errors.push({
        pin_id: pin.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });

      await admin
        .from("pins")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", pin.id);
    }
  }

  return NextResponse.json({
    generated,
    total: pins.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
