/**
 * Reconcile the local `boards` table with the org's actual Pinterest
 * boards. Adds missing, archives/deletes removed, and links by name when
 * a local board exists without a pinterest_board_id.
 *
 * Authenticated: any user in the org can trigger.
 * Also callable internally (daily cron) by passing an orgId server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";
import { PinterestClient } from "@/lib/pinterest/client";
import { getOrgIdFromProfile } from "@/lib/auth/effective-org";

// The per-board organic analytics pass makes many Pinterest calls; give the
// function room (Vercel honours this up to the plan's max).
export const maxDuration = 300;

export interface SyncSummary {
  added: number;
  updated: number;
  linked: number;
  deleted: number;
  pinterest_count: number;
  local_count_before: number;
}

export async function syncBoardsForOrg(orgId: string): Promise<SyncSummary> {
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("pinterest_access_token_encrypted, settings")
    .eq("id", orgId)
    .single();
  if (!org?.pinterest_access_token_encrypted) {
    throw new Error("Pinterest not connected for this org");
  }

  const token = decrypt(org.pinterest_access_token_encrypted);
  const isTrial =
    ((org.settings as Record<string, unknown>)?.pinterest_access_tier as string) ===
    "trial";
  const client = new PinterestClient(token, isTrial);

  // Fetch ALL Pinterest boards (paginate). Include pin_count so the UI
  // can show accurate counts from Pinterest without needing local pin records.
  const pinterestBoards: Array<{
    id: string;
    name: string;
    description?: string;
    privacy?: string;
    pin_count?: number;
  }> = [];
  let bookmark: string | undefined;
  do {
    const url = bookmark
      ? `/boards?page_size=100&bookmark=${encodeURIComponent(bookmark)}`
      : `/boards?page_size=100`;
    const page = await (client as unknown as {
      request: (p: string) => Promise<{
        items?: Array<{
          id: string;
          name: string;
          description?: string;
          privacy?: string;
          pin_count?: number;
        }>;
        bookmark?: string;
      }>;
    }).request(url);
    pinterestBoards.push(...(page.items || []));
    bookmark = page.bookmark;
  } while (bookmark);

  const { data: localBoards } = await admin
    .from("boards")
    .select("id, name, pinterest_board_id, status, pin_count")
    .eq("org_id", orgId);

  const local = (localBoards || []) as Array<{
    id: string;
    name: string;
    pinterest_board_id: string | null;
    status: string;
    pin_count: number | null;
  }>;
  const summary: SyncSummary = {
    added: 0,
    updated: 0,
    linked: 0,
    deleted: 0,
    pinterest_count: pinterestBoards.length,
    local_count_before: local.length,
  };

  const localById = new Map(
    local.filter((b) => b.pinterest_board_id).map((b) => [b.pinterest_board_id!, b])
  );
  const localByNameUnlinked = new Map(
    local
      .filter((b) => !b.pinterest_board_id)
      .map((b) => [b.name.trim().toLowerCase(), b])
  );

  const matchedLocalIds = new Set<string>();

  for (const pb of pinterestBoards) {
    const existing = localById.get(pb.id);
    if (existing) {
      // Already linked — update name + ensure active.
      matchedLocalIds.add(existing.id);
      const needsUpdate =
        existing.name !== pb.name ||
        existing.status !== "active" ||
        existing.pin_count !== (pb.pin_count ?? 0);
      if (needsUpdate) {
        await admin
          .from("boards")
          .update({
            name: pb.name,
            status: "active",
            pin_count: pb.pin_count ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        summary.updated++;
      }
      continue;
    }
    // Try to link by name (case-insensitive) to an unlinked draft.
    const namedMatch = localByNameUnlinked.get(pb.name.trim().toLowerCase());
    if (namedMatch) {
      matchedLocalIds.add(namedMatch.id);
      await admin
        .from("boards")
        .update({
          pinterest_board_id: pb.id,
          status: "active",
          pin_count: pb.pin_count ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", namedMatch.id);
      summary.linked++;
      continue;
    }
    // New board on Pinterest that we don't know about → insert.
    await admin.from("boards").insert({
      org_id: orgId,
      pinterest_board_id: pb.id,
      name: pb.name,
      description: pb.description || null,
      privacy: pb.privacy === "SECRET" ? "secret" : "public",
      status: "active",
      pin_count: pb.pin_count ?? 0,
    });
    summary.added++;
  }

  // Delete local boards that were previously linked to Pinterest but are no
  // longer there. (Pins.board_id has ON DELETE SET NULL — safe to delete.)
  // Boards without pinterest_board_id are user-created drafts; leave alone.
  const orphans = local.filter(
    (b) => b.pinterest_board_id && !matchedLocalIds.has(b.id)
  );
  for (const o of orphans) {
    const { error } = await admin.from("boards").delete().eq("id", o.id);
    if (!error) summary.deleted++;
  }

  // Refresh the most-recent pin date per board (cheap: newest page, NOT the
  // rate-limited analytics endpoint). Per-board ORGANIC metrics
  // (impressions/saves/clicks) are computed separately by the paced
  // /api/cron/board-metrics job, because Pinterest's per-pin analytics endpoint
  // is hard-limited to 60 calls/minute — far too slow to do inline here.
  const { data: linkedBoards } = await admin
    .from("boards")
    .select("id, pinterest_board_id")
    .eq("org_id", orgId)
    .not("pinterest_board_id", "is", null);

  for (const b of linkedBoards || []) {
    try {
      const page = await client.getBoardPins(b.pinterest_board_id as string, 25);
      let latest: string | null = null;
      for (const it of page.items || []) {
        if (it.created_at && (!latest || it.created_at > latest)) latest = it.created_at;
      }
      if (latest) {
        await admin
          .from("boards")
          .update({ last_pin_added_at: latest })
          .eq("id", b.id);
      }
    } catch {
      // Board empty or call failed — leave the date as-is.
    }
  }

  // Record the sync timestamp on the org settings so the UI can show it.
  const settings = (org.settings as Record<string, unknown>) || {};
  settings.boards_last_synced_at = new Date().toISOString();
  await admin.from("organizations").update({ settings }).eq("id", orgId);

  return summary;
}

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role, active_org_id")
    .eq("id", user.id)
    .single();
  const orgId = getOrgIdFromProfile(profile);
  if (!orgId) return NextResponse.json({ error: "No org" }, { status: 400 });

  try {
    const summary = await syncBoardsForOrg(orgId);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 }
    );
  }
}
