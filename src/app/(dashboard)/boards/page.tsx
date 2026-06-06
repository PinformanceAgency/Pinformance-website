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
  Table2,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Board, BoardHealthRow, BoardHealthLabel } from "@/lib/types";
import { BOARD_CATEGORIES, boardCategoryLabel } from "@/lib/constants";

interface SyncSummary {
  added: number;
  updated: number;
  linked: number;
  deleted: number;
  pinterest_count: number;
  local_count_before: number;
}

const LABEL_META: Record<BoardHealthLabel, { label: string; className: string }> = {
  top_performing: { label: "Top performing", className: "bg-green-100 text-green-700" },
  content_refresh: { label: "Content refresh nodig", className: "bg-yellow-100 text-yellow-700" },
  underperforming: { label: "Underperforming", className: "bg-red-100 text-red-700" },
};

type SortKey =
  | "name"
  | "category"
  | "pin_count"
  | "days_since_last_pin"
  | "impressions"
  | "saves"
  | "clicks"
  | "engagement_rate"
  | "label";

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

export default function BoardsPage() {
  const { org, loading } = useOrg();
  const [boards, setBoards] = useState<Board[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDescription, setNewBoardDescription] = useState("");
  const [newBoardCategory, setNewBoardCategory] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // ── Health view (Task 1 + Task 2) ──
  const [view, setView] = useState<"cards" | "health">("cards");
  const [health, setHealth] = useState<BoardHealthRow[] | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(14);
  const [labelFilter, setLabelFilter] = useState<"all" | BoardHealthLabel>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!org) return;
    loadBoards();
    loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function loadHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/boards/health");
      const json = (await res.json().catch(() => ({}))) as {
        boards?: BoardHealthRow[];
        thresholds?: { inactive_days?: number };
      };
      if (res.ok && json.boards) {
        setHealth(json.boards);
        if (json.thresholds?.inactive_days) setInactiveDays(json.thresholds.inactive_days);
      }
    } catch {
      // Keep whatever we had — the table just won't refresh.
    } finally {
      setHealthLoading(false);
    }
  }

  async function updateBoardCategory(boardId: string, category: string) {
    const supabase = createClient();
    await supabase
      .from("boards")
      .update({ category: category || null })
      .eq("id", boardId);
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, category: category || null } : b))
    );
    setHealth((prev) =>
      prev
        ? prev.map((h) => (h.id === boardId ? { ...h, category: category || null } : h))
        : prev
    );
  }

  async function handleCreate() {
    if (!org || !newBoardName.trim()) return;
    setCreating(true);
    setPublishError(null);

    const supabase = createClient();
    // 1) Save the board locally as a draft (with optional description + category).
    const { data: draft, error: insertErr } = await supabase
      .from("boards")
      .insert({
        org_id: org.id,
        name: newBoardName.trim(),
        description: newBoardDescription.trim() || null,
        category: newBoardCategory || null,
        status: "draft",
        privacy: "public",
        sort_order: boards.length,
      })
      .select("id")
      .single();

    // Close the modal regardless — the board now exists. If the Pinterest
    // push fails, it stays as a draft with a "Create on Pinterest" button.
    setNewBoardName("");
    setNewBoardDescription("");
    setNewBoardCategory("");
    setShowCreate(false);
    setCreating(false);

    if (insertErr || !draft) {
      setPublishError(insertErr?.message || "Could not save board");
      await loadBoards();
      return;
    }

    // Show the draft card immediately (with its "Creating…" spinner), then
    // push to Pinterest so creation is one step for every connected brand.
    // Failures are surfaced but never lose the draft.
    await loadBoards();
    await handleCreateOnPinterest(draft.id);
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
      await loadHealth();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "category" ? "asc" : "desc");
    }
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const healthById = new Map((health || []).map((h) => [h.id, h]));
  const inactiveBoards = (health || []).filter((h) => h.is_inactive);

  // Filter + sort the health rows for the table.
  const filteredHealth = (health || [])
    .filter((h) => labelFilter === "all" || h.label === labelFilter)
    .filter((h) => {
      if (categoryFilter === "all") return true;
      if (categoryFilter === "uncategorized") return !h.category;
      return h.category === categoryFilter;
    });
  const sortedHealth = [...filteredHealth].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortKey === "name") {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    } else if (sortKey === "category") {
      av = (a.category || "~").toLowerCase();
      bv = (b.category || "~").toLowerCase();
    } else if (sortKey === "label") {
      const order: Record<BoardHealthLabel, number> = {
        underperforming: 0,
        content_refresh: 1,
        top_performing: 2,
      };
      av = order[a.label];
      bv = order[b.label];
    } else if (sortKey === "days_since_last_pin") {
      // Treat "never" as the most stale (largest).
      av = a.days_since_last_pin ?? Number.MAX_SAFE_INTEGER;
      bv = b.days_since_last_pin ?? Number.MAX_SAFE_INTEGER;
    } else {
      av = a[sortKey] as number;
      bv = b[sortKey] as number;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const SortHeader = ({ label, k, align = "left" }: { label: string; k: SortKey; align?: "left" | "right" }) => (
    <th
      className={cn("p-3 font-medium cursor-pointer select-none hover:text-foreground", align === "right" ? "text-right" : "text-left")}
      onClick={() => toggleSort(k)}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        {label}
        <ArrowUpDown className={cn("w-3 h-3", sortKey === k ? "text-foreground" : "text-muted-foreground/40")} />
      </span>
    </th>
  );

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
          {/* Cards ↔ Health toggle */}
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            <button
              onClick={() => setView("cards")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-4 h-4" /> Cards
            </button>
            <button
              onClick={() => setView("health")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors",
                view === "health" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Table2 className="w-4 h-4" /> Health
              {inactiveBoards.length > 0 && (
                <span className="ml-0.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                  {inactiveBoards.length}
                </span>
              )}
            </button>
          </div>
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

      {/* Inactive-board alert (Task 2) — visible in both views. */}
      {inactiveBoards.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4" />
            {inactiveBoards.length} board{inactiveBoards.length !== 1 ? "s" : ""} hebben de afgelopen {inactiveDays} dagen geen pins gehad
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {inactiveBoards.map((h) => (
              <span key={h.id} className="bg-white/70 border border-amber-200 rounded-full px-2.5 py-1 text-xs">
                {h.name}
                <span className="text-amber-700/70">
                  {" · "}
                  {h.days_since_last_pin === null
                    ? "nog geen pins toegevoegd"
                    : `${h.days_since_last_pin} dagen geleden`}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── HEALTH TABLE VIEW (Task 1) ── */}
      {view === "health" ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Health</span>
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value as "all" | BoardHealthLabel)}
                className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="all">All labels</option>
                <option value="top_performing">Top performing</option>
                <option value="content_refresh">Content refresh nodig</option>
                <option value="underperforming">Underperforming</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="all">All categories</option>
                {BOARD_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
                <option value="uncategorized">Uncategorized</option>
              </select>
            </div>
            {healthLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <span className="text-xs text-muted-foreground ml-auto">
              Metrics over the configured window · thresholds in Settings
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                  <SortHeader label="Board" k="name" />
                  <SortHeader label="Category" k="category" />
                  <SortHeader label="Pins" k="pin_count" align="right" />
                  <SortHeader label="Last pin" k="days_since_last_pin" align="right" />
                  <SortHeader label="Impressions" k="impressions" align="right" />
                  <SortHeader label="Saves" k="saves" align="right" />
                  <SortHeader label="Clicks" k="clicks" align="right" />
                  <SortHeader label="Engagement" k="engagement_rate" align="right" />
                  <SortHeader label="Health" k="label" />
                </tr>
              </thead>
              <tbody>
                {sortedHealth.map((h) => (
                  <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-medium flex items-center gap-1.5">
                        {h.is_inactive && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                        {h.name}
                      </div>
                    </td>
                    <td className="p-3">
                      <select
                        value={h.category || ""}
                        onChange={(e) => updateBoardCategory(h.id, e.target.value)}
                        className="px-2 py-1 bg-background border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                      >
                        <option value="">—</option>
                        {BOARD_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-right tabular-nums">{h.pin_count}</td>
                    <td className="p-3 text-right tabular-nums">
                      {h.last_pin_at === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={cn(h.is_inactive && "text-amber-600 font-medium")} title={new Date(h.last_pin_at).toLocaleDateString()}>
                          {h.days_since_last_pin}d ago
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatNumber(h.impressions)}</td>
                    <td className="p-3 text-right tabular-nums">{formatNumber(h.saves)}</td>
                    <td className="p-3 text-right tabular-nums">{formatNumber(h.clicks)}</td>
                    <td className="p-3 text-right tabular-nums">{h.engagement_rate.toFixed(2)}%</td>
                    <td className="p-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", LABEL_META[h.label].className)}>
                        {LABEL_META[h.label].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedHealth.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {health === null
                  ? "Loading board health…"
                  : (health.length === 0
                    ? "No boards yet. Create your first board to get started."
                    : "No boards match the current filters.")}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── CARDS VIEW ── */
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map((board) => {
              const h = healthById.get(board.id);
              return (
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

                  {/* Health + inactive badges */}
                  {h && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", LABEL_META[h.label].className)}>
                        {LABEL_META[h.label].label}
                      </span>
                      {h.is_inactive && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {h.days_since_last_pin}d no pins
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Image className="w-3 h-3" />
                      {board.pin_count ?? 0} pins
                    </span>
                    {boardCategoryLabel(board.category) && (
                      <span className="capitalize">{boardCategoryLabel(board.category)}</span>
                    )}
                  </div>

                  {/* Category selector (Task 3 — categories on boards) */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">Category</label>
                    <select
                      value={board.category || ""}
                      onChange={(e) => updateBoardCategory(board.id, e.target.value)}
                      className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      <option value="">— No category —</option>
                      {BOARD_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
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
              );
            })}
          </div>

          {boards.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No boards yet. Create your first board to get started.
            </div>
          )}
        </>
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

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Description <span className="font-normal">(optional)</span>
                </label>
                <textarea
                  value={newBoardDescription}
                  onChange={(e) => setNewBoardDescription(e.target.value)}
                  placeholder="What is this board about? Shown on Pinterest and helps SEO."
                  rows={3}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Category <span className="font-normal">(optional)</span>
                </label>
                <select
                  value={newBoardCategory}
                  onChange={(e) => setNewBoardCategory(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">— No category —</option>
                  {BOARD_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Created directly on your connected Pinterest account.
              </p>

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
