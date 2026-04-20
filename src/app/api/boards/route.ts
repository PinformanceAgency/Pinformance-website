import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

export async function GET(request: NextRequest) {
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
    .from("boards")
    .select("*")
    .eq("org_id", getOrgIdFromProfile(profile))
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ boards: data });
}

export async function POST(request: NextRequest) {
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
  const { name, description, category, keywords, privacy, create_on_pinterest } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let pinterestBoardId: string | null = null;

  if (create_on_pinterest) {
    const { data: org } = await supabase
      .from("organizations")
      .select("pinterest_access_token_encrypted")
      .eq("id", getOrgIdFromProfile(profile))
      .single();

    if (!org?.pinterest_access_token_encrypted) {
      return NextResponse.json(
        { error: "Pinterest not connected" },
        { status: 400 }
      );
    }

    const token = decrypt(org.pinterest_access_token_encrypted);
    const client = new PinterestClient(token);
    const pinterestBoard = await client.createBoard({
      name,
      description,
      privacy: privacy === "secret" ? "SECRET" : "PUBLIC",
    });
    pinterestBoardId = pinterestBoard.id;
  }

  const { data, error } = await supabase
    .from("boards")
    .insert({
      org_id: getOrgIdFromProfile(profile),
      pinterest_board_id: pinterestBoardId,
      name,
      description: description || null,
      category: category || null,
      keywords: keywords || [],
      privacy: privacy || "public",
      status: pinterestBoardId ? "created" : "draft",
      sort_order: 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ board: data }, { status: 201 });
}
