import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function GET(
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

  const { data, error } = await supabase
    .from("pins")
    .select("*, board:boards(*), product:products(*)")
    .eq("id", id)
    .eq("org_id", getOrgIdFromProfile(profile))
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  return NextResponse.json({ pin: data });
}

export async function PATCH(
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

  const body = await request.json();
  const allowedFields = [
    "title",
    "description",
    "alt_text",
    "link_url",
    "scheduled_at",
    "keywords",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from("pins")
    .update(updates)
    .eq("id", id)
    .eq("org_id", getOrgIdFromProfile(profile))
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Pin not found" }, { status: 404 });
  }

  return NextResponse.json({ pin: data });
}
