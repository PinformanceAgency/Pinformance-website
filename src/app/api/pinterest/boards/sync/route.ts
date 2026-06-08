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

  const { data: linkedBoards } = await admin
    .from("boards")
    .select("id, pinterest_board_id")
    .eq("org_id", orgId)
    .not("pinterest_board_id", "is", null);

  // 1) Most-recent pin date per board (cheap: newest page, created_at only).
  const lastPinByBoard = new Map<string, string>();
  for (const b of linkedBoards || []) {
    try {
      const page = await client.getBoardPins(b.pinterest_board_id as string, 25);
      let latest: string | null = null;
      for (const item of page.items || []) {
        if (item.created_at && (!latest || item.created_at > latest)) {
          latest = item.created_at;
        }
      }
      if (latest) lastPinByBoard.set(b.id, latest);
    } catch {
      // Board empty or call failed — leave the date as-is.
    }
  }

  // 2) ORGANIC metrics per board. Pinterest exposes organic metrics via the
  // top-pins endpoint (content_type=ORGANIC) — this keeps the board-health
  // numbers consistent with the organic Overview (the inline board pin_metrics
  // include paid/ads impressions, which we deliberately exclude here). We union
  // the top pins across IMPRESSION/SAVE/PIN_CLICK/OUTBOUND_CLICK sorts for
  // broader coverage, then attribute each to its board via getPin's board_id.
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const pbToLocal = new Map(
    (linkedBoards || [])
      .filter((b) => b.pinterest_board_id)
      .map((b) => [b.pinterest_board_id as string, b.id])
  );
  const byBoard = new Map<
    string,
    { impr: number; saves: number; pinClicks: number; outClicks: number }
  >();
  const seen = new Set<string>();

  for (const sortBy of ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"]) {
    let top: { pins?: Array<{ pin_id: string; metrics: Record<string, number> }> };
    try {
      top = await client.getTopPins(
        startDate,
        endDate,
        sortBy,
        ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"],
        "ORGANIC"
      );
    } catch {
      continue;
    }
    const fresh = (top.pins || []).filter((p) => !seen.has(p.pin_id));
    for (let i = 0; i < fresh.length; i += 10) {
      const batch = fresh.slice(i, i + 10);
      const resolved = await Promise.all(
        batch.map((p) =>
          client
            .getPin(p.pin_id)
            .then((d) => ({ metrics: p.metrics, boardId: d.board_id }))
            .catch(() => null)
        )
      );
      for (let j = 0; j < batch.length; j++) {
        seen.add(batch[j].pin_id);
        const r = resolved[j];
        if (!r?.boardId) continue;
        const localId = pbToLocal.get(r.boardId);
        if (!localId) continue;
        const m = r.metrics || {};
        const cur =
          byBoard.get(localId) || { impr: 0, saves: 0, pinClicks: 0, outClicks: 0 };
        cur.impr += m.IMPRESSION || 0;
        cur.saves += m.SAVE || 0;
        cur.pinClicks += m.PIN_CLICK || 0;
        cur.outClicks += m.OUTBOUND_CLICK || 0;
        byBoard.set(localId, cur);
      }
    }
  }

  // 3) Write metrics + last-pin per board (0 metrics when no organic top pins).
  const syncedAt = new Date().toISOString();
  for (const b of linkedBoards || []) {
    const m = byBoard.get(b.id) || { impr: 0, saves: 0, pinClicks: 0, outClicks: 0 };
    const upd: Record<string, unknown> = {
      metrics_impressions: m.impr,
      metrics_saves: m.saves,
      metrics_pin_clicks: m.pinClicks,
      metrics_outbound_clicks: m.outClicks,
      metrics_synced_at: syncedAt,
    };
    const lp = lastPinByBoard.get(b.id);
    if (lp) upd.last_pin_added_at = lp;
    await admin.from("boards").update(upd).eq("id", b.id);
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
