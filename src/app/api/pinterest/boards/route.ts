import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

/**
 * POST /api/pinterest/boards
 * Pushes an existing local DRAFT board to Pinterest. The Boards page calls
 * this from the "Create on Pinterest" button with { board_id }. On success it
 * stores the returned pinterest_board_id and flips the board to "created".
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

  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  const body = await request.json();
  const { board_id } = body;
  if (!board_id) {
    return NextResponse.json({ error: "board_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Load the draft board, scoped to the caller's org so a client can't push
  // another org's board.
  const { data: board, error: boardErr } = await admin
    .from("boards")
    .select("id, org_id, name, description, privacy, pinterest_board_id")
    .eq("id", board_id)
    .eq("org_id", orgId)
    .single();
  if (boardErr || !board) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  if (board.pinterest_board_id) {
    return NextResponse.json(
      { error: "Board already exists on Pinterest" },
      { status: 400 }
    );
  }

  const { data: org } = await admin
    .from("organizations")
    .select("pinterest_access_token_encrypted, settings")
    .eq("id", orgId)
    .single();
  if (!org?.pinterest_access_token_encrypted) {
    return NextResponse.json({ error: "Pinterest not connected" }, { status: 400 });
  }

  try {
    const token = decrypt(org.pinterest_access_token_encrypted);
    // Match every other Pinterest route: trial-tier orgs must hit the sandbox API.
    const isTrial =
      ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) === "trial";
    const client = new PinterestClient(token, isTrial);

    const created = await client.createBoard({
      name: board.name,
      description: board.description || undefined,
      privacy: board.privacy === "secret" ? "SECRET" : "PUBLIC",
    });

    const { data: updated, error: updErr } = await admin
      .from("boards")
      .update({
        pinterest_board_id: created.id,
        status: "created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", board.id)
      .select()
      .single();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, board: updated }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create board on Pinterest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
