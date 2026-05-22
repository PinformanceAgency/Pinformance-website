/**
 * GET /api/help-center/history — return the last N help_requests for
 * the caller's active org. Used by the Help Center UI to seed the chat
 * with previous interactions.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role, org_id, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.role !== "agency_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("help_requests")
    .select("id, prompt, response, type, capability, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
