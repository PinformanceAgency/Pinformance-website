import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/switch-org
 * Body: { org_id: string }
 *
 * SECURITY CONTRACT — DO NOT WEAKEN:
 * 1. Must be authenticated.
 * 2. Must have role === "agency_admin". If not, returns 403 and does NOT update anything.
 * 3. Target org_id must exist.
 * 4. Non-agency_admin users can never set or change active_org_id — this endpoint is the
 *    ONLY place active_org_id is written, and it is gated by the role check below.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  // HARD GATE: only agency_admin may switch orgs
  if (!profile || profile.role !== "agency_admin") {
    return NextResponse.json(
      { error: "Forbidden: only agency admins can switch organisations" },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const orgId = body?.org_id as string | undefined;
  if (!orgId || typeof orgId !== "string") {
    return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  }

  // Verify target org exists (through RLS — agency_admin can read all orgs)
  const { data: targetOrg, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", orgId)
    .single();

  if (orgErr || !targetOrg) {
    return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ active_org_id: targetOrg.id, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, active_org: targetOrg });
}
