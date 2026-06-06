import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";
import type { UserRole } from "@/lib/types";

/**
 * POST /api/team/remove  { user_id }
 *
 * Removes a member from the caller's org (revokes dashboard access by deleting
 * their profile row, scoped to the org). Only agency_admin / client_admin may
 * remove, and not themselves.
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
    return NextResponse.json({ error: "Not allowed to remove members" }, { status: 403 });
  }

  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const { user_id } = (await request.json()) as { user_id?: string };
  if (!user_id) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  if (user_id === user.id) {
    return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .delete()
    .eq("id", user_id)
    .eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
