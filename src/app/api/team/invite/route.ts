import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import type { UserRole } from "@/lib/types";

const ASSIGNABLE: UserRole[] = [
  "agency_admin",
  "client_admin",
  "client_viewer",
  "store_owner",
];

/**
 * POST /api/team/invite  { email, role }
 *
 * Creates (or updates) an org_invite so the invited email is auto-linked to the
 * caller's org with the given role on signup. Used to give a store owner a
 * restricted "store_owner" login. Only agency_admin / client_admin may invite,
 * and only agency_admin may grant agency_admin.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const callerRole = profile.role as UserRole;
  if (callerRole !== "agency_admin" && callerRole !== "client_admin") {
    return NextResponse.json({ error: "Not allowed to invite members" }, { status: 403 });
  }

  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const { email, role } = (await request.json()) as { email?: string; role?: UserRole };
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  const inviteRole: UserRole = ASSIGNABLE.includes(role as UserRole)
    ? (role as UserRole)
    : "client_viewer";
  // Only agency admins may mint other agency admins.
  if (inviteRole === "agency_admin" && callerRole !== "agency_admin") {
    return NextResponse.json({ error: "Only agency admins can grant that role" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("org_invites")
    .upsert(
      { org_id: orgId, email: cleanEmail, role: inviteRole },
      { onConflict: "email" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, email: cleanEmail, role: inviteRole });
}
