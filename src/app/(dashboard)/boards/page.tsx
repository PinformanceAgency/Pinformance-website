"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  LayoutGrid,
  Plus,
  X,
  Upload,
  Image,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Board } from "@/lib/types";

interface SyncSummary {
  added: number;
  updated: number;
  linked: number;
  deleted: number;
  pinterest_count: number;
  local_count_before: number;
}

export default function BoardsPage() {
  const { org, loading } = useOrg();
  const [boards, setBoards] = useState<Board[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    loadBoards();
  }, [org]);

  async function loadBoards() {
    const supabase = createClient();
    const { data } = await supabase
      .from("boards")
      .select("*")
      .eq("org_id", org!.id)
      .order("sort_order");

    const boardList = (data as Board[]) || [];
    setBoards(boardList);

    // Read last sync timestamp from org settings.
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", org!.id)
      .single();
    const settings = (orgRow?.settings as Record<string, unknown>) || {};
    setLastSyncedAt((settings.boards_last_synced_at as string) || null);
  }

  async function handleCreate() {
    if (!org || !newBoardName.trim()) return;
    setCreating(true);

    const supabase = createClient();
    await supabase.from("boards").insert({
      org_id: org.id,
      name: newBoardName.trim(),
      status: "draft",
      privacy: "public",
      sort_order: boards.length,
    });

    setNewBoardName("");
    setShowCreate(false);
    setCreating(false);
    loadBoards();
  }

  async function handleCreateOnPinterest(boardId: string) {
    setPublishingId(boardId);
    setPublishError(null);
    try {
      const res = await fetch("/api/pinterest/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ board_id: boardId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await loadBoards();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Failed to create on Pinterest");
    } finally {
      setPublishingId(null);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setLastSyncSummary(null);
    try {
      const res = await fetch("/api/pinterest/boards/sync", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; summary?: SyncSummary; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      if (json.summary) setLastSyncSummary(json.summary);
      await loadBoards();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Boards</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Pinterest boards
          </p>
          <div className="text-[11px] text-muted-foreground mt-1">
            {lastSyncedAt ? (
              <>Last synced from Pinterest: <strong className="text-foreground">{new Date(lastSyncedAt).toLocaleString()}</strong> · auto-syncs daily</>
            ) : (
              <>Never synced from Pinterest — click Sync to import.</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="border border-border bg-card text-foreground px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted disabled:opacity-50"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sync from Pinterest
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Create Board
          </button>
        </div>
      </div>

      {lastSyncSummary && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-xs text-green-700">
          Synced <strong>{lastSyncSummary.pinterest_count}</strong> Pinterest boards.{" "}
          Added <strong>{lastSyncSummary.added}</strong>, linked{" "}
          <strong>{lastSyncSummary.linked}</strong>, updated{" "}
          <strong>{lastSyncSummary.updated}</strong>, removed{" "}
          <strong>{lastSyncSummary.deleted}</strong>.
        </div>
      )}
      {syncError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700">
          Sync failed: {syncError}
        </div>
      )}
      {publishError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-700">
          Could not create board on Pinterest: {publishError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((board) => (
          <div
            key={board.id}
            className="bg-card border border-border rounded-xl p-5 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-primary" />
                <h3 className="font-medium">{board.name}</h3>
              </div>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  board.status === "active" && "bg-green-100 text-green-700",
                  board.status === "created" && "bg-blue-100 text-blue-700",
                  board.status === "draft" && "bg-yellow-100 text-yellow-700",
                  board.status === "archived" && "bg-gray-100 text-gray-700"
                )}
              >
                {board.status}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Image className="w-3 h-3" />
                {board.pin_count ?? 0} pins
              </span>
            </div>

            {board.status === "draft" && (
              <button
                onClick={() => handleCreateOnPinterest(board.id)}
                disabled={publishingId === board.id}
                className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60"
              >
                {publishingId === board.id ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3" /> Create on Pinterest
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {boards.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No boards yet. Create your first board to get started.
        </div>
      )}

      {/* Create Board Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Create Board</h3>
                <button
                  onClick={() => setShowCreate(false)}
                  className="p-1 hover:bg-muted rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="e.g. Summer Collection Ideas"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newBoardName.trim()}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Board"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
