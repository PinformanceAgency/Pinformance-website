import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("org_id, role")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Only admins can set org-level credentials
    if (profile.role !== "agency_admin" && profile.role !== "client_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { anthropic_api_key, krea_api_key } = await request.json();

    if (!anthropic_api_key && !krea_api_key) {
      return NextResponse.json(
        { error: "At least one API key is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const updatePayload: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if (anthropic_api_key) {
      updatePayload.anthropic_api_key_encrypted = encrypt(anthropic_api_key);
    }

    if (krea_api_key) {
      updatePayload.krea_api_key_encrypted = encrypt(krea_api_key);
    }

    const { error: updateError } = await admin
      .from("organizations")
      .update(updatePayload)
      .eq("id", profile.org_id);

    if (updateError) {
      throw new Error(`Failed to save credentials: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save AI credentials error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
