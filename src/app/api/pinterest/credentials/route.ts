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

    const { app_id, app_secret } = await request.json();
    if (!app_id || !app_secret) {
      return NextResponse.json(
        { error: "Both app_id and app_secret are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("organizations")
      .update({
        pinterest_app_id: app_id,
        pinterest_app_secret_encrypted: encrypt(app_secret),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.org_id);

    if (updateError) {
      throw new Error(`Failed to save credentials: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save Pinterest credentials error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
