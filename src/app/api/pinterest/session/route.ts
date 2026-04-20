import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { validateSession } from "@/lib/pinterest/graphql";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

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
      .select("org_id, role, active_org_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.role !== "agency_admin" && profile.role !== "client_admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const { session_cookie } = await request.json();
    if (!session_cookie || typeof session_cookie !== "string" || session_cookie.trim().length < 10) {
      return NextResponse.json(
        { error: "A valid Pinterest session cookie is required" },
        { status: 400 }
      );
    }

    // Validate the session cookie works
    const isValid = await validateSession(session_cookie.trim());
    if (!isValid) {
      return NextResponse.json(
        { error: "Session cookie is invalid or expired. Please copy a fresh cookie from your browser." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    // Session cookies typically last 30-90 days; set a conservative expiry
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await admin
      .from("organizations")
      .update({
        pinterest_session_encrypted: encrypt(session_cookie.trim()),
        pinterest_session_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", getOrgIdFromProfile(profile));

    if (updateError) {
      throw new Error(`Failed to save session: ${updateError.message}`);
    }

    return NextResponse.json({ success: true, expires_at: expiresAt });
  } catch (err) {
    console.error("Save Pinterest session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
