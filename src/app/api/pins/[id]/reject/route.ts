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

  if (profile.role === "client_viewer") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { reason } = body;

  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pins")
    .update({
      status: "rejected",
      rejected_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", getOrgIdFromProfile(profile))
    .in("status", ["generated", "approved"])
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Pin not found or not in rejectable state" },
      { status: 404 }
    );
  }

  return NextResponse.json({ pin: data });
}
