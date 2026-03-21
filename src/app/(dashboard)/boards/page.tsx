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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Board } from "@/lib/types";

export default function BoardsPage() {
  const { org, loading } = useOrg();
  const [boards, setBoards] = useState<Board[]>([]);
  const [pinCounts, setPinCounts] = useState<Record<string, number>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

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

    if (boardList.length > 0) {
      const { data: pins } = await supabase
        .from("pins")
        .select("board_id")
        .eq("org_id", org!.id)
        .in(
          "board_id",
          boardList.map((b) => b.id)
        );

      const counts: Record<string, number> = {};
      (pins || []).forEach((p: { board_id: string }) => {
        counts[p.board_id] = (counts[p.board_id] || 0) + 1;
      });
      setPinCounts(counts);
    }
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
    await fetch("/api/pinterest/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board_id: boardId }),
    });
    loadBoards();
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Boards</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Pinterest boards
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Create Board
        </button>
      </div>

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
                {pinCounts[board.id] || 0} pins
              </span>
            </div>

            {board.status === "draft" && (
              <button
                onClick={() => handleCreateOnPinterest(board.id)}
                className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90"
              >
                <Upload className="w-3 h-3" /> Create on Pinterest
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
