import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/brand-settings — Load brand profile settings
 * POST /api/brand-settings — Save brand profile settings
 * Uses admin client for brand_profiles (structured_data column has RLS issues)
 * but still verifies user auth via server client.
 */

async function getUserOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  return profile?.org_id || null;
}

export async function GET() {
  const orgId = await getUserOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: brand, error } = await admin
    .from("brand_profiles")
    .select("brand_voice, structured_data")
    .eq("org_id", orgId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  const sd = (brand?.structured_data || {}) as Record<string, unknown>;

  return NextResponse.json({
    brand_voice: brand?.brand_voice || "",
    custom_prompts: sd.custom_prompts || {},
    reference_images: sd.reference_images || [],
  });
}

export async function POST(request: NextRequest) {
  const orgId = await getUserOrgId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { brand_voice, custom_prompts, reference_images } = body;

  const admin = createAdminClient();

  // Get current structured_data to merge
  const { data: current } = await admin
    .from("brand_profiles")
    .select("structured_data")
    .eq("org_id", orgId)
    .single();

  const currentData = ((current?.structured_data || {}) as Record<string, unknown>);
  const newData = { ...currentData };

  if (custom_prompts !== undefined) newData.custom_prompts = custom_prompts;
  if (reference_images !== undefined) newData.reference_images = reference_images;

  const updatePayload: Record<string, unknown> = {
    structured_data: newData,
    updated_at: new Date().toISOString(),
  };
  if (brand_voice !== undefined) updatePayload.brand_voice = brand_voice;

  const { error } = await admin
    .from("brand_profiles")
    .update(updatePayload)
    .eq("org_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
