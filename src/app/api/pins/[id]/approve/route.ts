import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Only agency_admin or client_admin can approve
  if (profile.role === "client_viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("pins")
    .update({
      status: "approved",
      rejected_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", getOrgIdFromProfile(profile))
    .in("status", ["generated", "rejected"])
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Pin not found or not in approvable state" },
      { status: 404 }
    );
  }

  return NextResponse.json({ pin: data });
}
