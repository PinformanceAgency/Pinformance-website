import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

const ALLOWED_TYPES = [
  "tagbox",
  "canva",
  "google_drive",
  "dropbox",
  "instagram",
  "tiktok",
  "notion",
  "frame_io",
  "other",
];

async function getProfileAndOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("id, org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return null;
  return { user, profile, orgId };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const ctx = await getProfileAndOrgId(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("type");

  let query = supabase
    .from("content_sources")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (sourceType) query = query.eq("source_type", sourceType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const ctx = await getProfileAndOrgId(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, url, source_type, description, thumbnail_url } = body;
  if (!name || !url) return NextResponse.json({ error: "name and url required" }, { status: 400 });

  const type = ALLOWED_TYPES.includes(source_type) ? source_type : "other";

  const { data, error } = await supabase
    .from("content_sources")
    .insert({
      org_id: ctx.orgId,
      name,
      url,
      source_type: type,
      description: description || null,
      thumbnail_url: thumbnail_url || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const ctx = await getProfileAndOrgId(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.url !== undefined) updates.url = body.url;
  if (body.description !== undefined) updates.description = body.description;
  if (body.thumbnail_url !== undefined) updates.thumbnail_url = body.thumbnail_url;
  if (body.source_type !== undefined) {
    updates.source_type = ALLOWED_TYPES.includes(body.source_type) ? body.source_type : "other";
  }

  const { data, error } = await supabase
    .from("content_sources")
    .update(updates)
    .eq("id", id)
    .eq("org_id", ctx.orgId) // defence in depth (RLS already enforces this)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const ctx = await getProfileAndOrgId(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("content_sources")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
