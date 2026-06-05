import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

interface PinterestBoardLite {
  id: string;
  name: string;
  pin_count?: number;
}

/**
 * Find an existing Pinterest board by name (case-insensitive), paginating
 * through all of the account's boards. Used to link instead of duplicate
 * when Pinterest rejects a create for a name that already exists.
 */
async function findPinterestBoardByName(
  client: PinterestClient,
  name: string
): Promise<PinterestBoardLite | null> {
  const target = name.trim().toLowerCase();
  let bookmark: string | undefined;
  do {
    const url = bookmark
      ? `/boards?page_size=100&bookmark=${encodeURIComponent(bookmark)}`
      : `/boards?page_size=100`;
    const page = await (
      client as unknown as {
        request: (p: string) => Promise<{
          items?: PinterestBoardLite[];
          bookmark?: string;
        }>;
      }
    ).request(url);
    const match = (page.items || []).find(
      (b) => b.name.trim().toLowerCase() === target
    );
    if (match) return match;
    bookmark = page.bookmark;
  } while (bookmark);
  return null;
}

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

    let pinterestBoardId: string;
    let pinCount = 0;
    let status: "created" | "active" = "created";

    try {
      const created = await client.createBoard({
        name: board.name,
        description: board.description || undefined,
        privacy: board.privacy === "secret" ? "SECRET" : "PUBLIC",
      });
      pinterestBoardId = created.id;
    } catch (createErr) {
      // Pinterest rejects duplicate board names (error code 58). If a board
      // with this name already exists, link the existing one to this draft
      // instead of failing — same behavior as the boards sync.
      const msg = createErr instanceof Error ? createErr.message : "";
      const isDuplicateName =
        /"code"\s*:\s*58/.test(msg) ||
        /already have a board with this name/i.test(msg);
      if (!isDuplicateName) throw createErr;

      const existing = await findPinterestBoardByName(client, board.name);
      if (!existing) throw createErr;
      pinterestBoardId = existing.id;
      pinCount = existing.pin_count ?? 0;
      status = "active"; // it's a real board already in use
    }

    const { data: updated, error: updErr } = await admin
      .from("boards")
      .update({
        pinterest_board_id: pinterestBoardId,
        status,
        pin_count: pinCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", board.id)
      .select()
      .single();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, board: updated, linked: status === "active" }, { status: 201 });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    let message = raw || "Failed to create board on Pinterest";
    // Translate the most common Pinterest failures into actionable guidance so
    // it works the same way across every connected account.
    if (/error 401|error 403|\bscope\b|not authorized|authoriz/i.test(raw)) {
      message =
        "This Pinterest account is missing board-write permission. Reconnect Pinterest from the Integrations page so the 'boards:write' scope is granted, then try again.";
    } else if (/error 429|rate limit/i.test(raw)) {
      message = "Pinterest is rate-limiting requests. Wait a moment and try again.";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
