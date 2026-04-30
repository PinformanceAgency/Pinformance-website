"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/hooks/use-org";
import {
  ExternalLink,
  Plus,
  Trash2,
  Pencil,
  X,
  Search,
  FolderOpen,
  Image as ImageIcon,
  Sparkles,
  HardDrive,
  Boxes,
  Layers,
  Instagram,
  Music2,
  FileBox,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ContentSource = {
  id: string;
  name: string;
  url: string;
  source_type: string;
  description: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

const SOURCE_TYPES: { value: string; label: string; icon: typeof FolderOpen; badge: string; tile: string }[] = [
  { value: "tagbox", label: "Tagbox", icon: Boxes, badge: "bg-purple-100 text-purple-700 border-purple-200", tile: "bg-purple-50 text-purple-400" },
  { value: "canva", label: "Canva", icon: Sparkles, badge: "bg-cyan-100 text-cyan-700 border-cyan-200", tile: "bg-cyan-50 text-cyan-400" },
  { value: "google_drive", label: "Google Drive", icon: HardDrive, badge: "bg-yellow-100 text-yellow-700 border-yellow-200", tile: "bg-yellow-50 text-yellow-500" },
  { value: "dropbox", label: "Dropbox", icon: FileBox, badge: "bg-blue-100 text-blue-700 border-blue-200", tile: "bg-blue-50 text-blue-400" },
  { value: "instagram", label: "Instagram", icon: Instagram, badge: "bg-pink-100 text-pink-700 border-pink-200", tile: "bg-pink-50 text-pink-400" },
  { value: "tiktok", label: "TikTok", icon: Music2, badge: "bg-rose-100 text-rose-700 border-rose-200", tile: "bg-rose-50 text-rose-400" },
  { value: "notion", label: "Notion", icon: Layers, badge: "bg-stone-100 text-stone-700 border-stone-200", tile: "bg-stone-50 text-stone-400" },
  { value: "frame_io", label: "Frame.io", icon: Film, badge: "bg-emerald-100 text-emerald-700 border-emerald-200", tile: "bg-emerald-50 text-emerald-400" },
  { value: "other", label: "Other", icon: FolderOpen, badge: "bg-gray-100 text-gray-700 border-gray-200", tile: "bg-gray-50 text-gray-400" },
];

function getTypeMeta(t: string) {
  return SOURCE_TYPES.find((s) => s.value === t) || SOURCE_TYPES[SOURCE_TYPES.length - 1];
}

export default function RawContentPage() {
  const { org, loading: orgLoading } = useOrg();
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContentSource | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/content-sources");
      const data = await res.json();
      setSources(data.sources || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (org) load();
  }, [org?.id]);

  async function remove(id: string) {
    if (!confirm("Delete this content source?")) return;
    const res = await fetch(`/api/content-sources?id=${id}`, { method: "DELETE" });
    if (res.ok) setSources((s) => s.filter((x) => x.id !== id));
  }

  const filtered = sources.filter((s) => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.description || "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || s.source_type === filterType;
    return matchSearch && matchType;
  });

  if (orgLoading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Raw Content</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            External content sources for {org?.name || "this brand"} — Tagbox, Canva, Google Drive, Dropbox, etc.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add source
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() => setFilterType("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            filterType === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          )}
        >
          All ({sources.length})
        </button>
        {SOURCE_TYPES.map((t) => {
          const count = sources.filter((s) => s.source_type === t.value).length;
          if (count === 0) return null;
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                filterType === t.value
                  ? t.badge
                  : "bg-card text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Icon className="w-3 h-3" />
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-12 text-center bg-card">
          <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-foreground font-medium">No content sources yet</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Add the first link (Tagbox, Canva, Google Drive, etc.)
          </p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Add source
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const meta = getTypeMeta(s.source_type);
            const Icon = meta.icon;
            return (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-card hover:bg-muted/50 border border-border hover:border-foreground/20 rounded-xl overflow-hidden transition-all block"
              >
                {/* Thumbnail or icon header */}
                {s.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail_url} alt={s.name} className="w-full aspect-[3/2] object-cover" />
                ) : (
                  <div className={cn("w-full aspect-[3/2] flex items-center justify-center", meta.tile)}>
                    <Icon className="w-12 h-12 opacity-50" />
                  </div>
                )}

                {/* Body */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border", meta.badge)}>
                      <Icon className="w-2.5 h-2.5" />
                      {meta.label}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(s); setShowForm(true); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(s.id); }}
                        className="p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-medium text-foreground text-sm leading-tight">{s.name}</h3>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                  )}
                  <span className="mt-3 inline-flex items-center gap-1.5 text-xs text-foreground/70 group-hover:text-foreground font-medium">
                    Open <ExternalLink className="w-3 h-3" />
                  </span>
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <SourceForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function SourceForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: ContentSource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [sourceType, setSourceType] = useState(initial?.source_type || "tagbox");
  const [description, setDescription] = useState(initial?.description || "");
  const [thumbnailUrl, setThumbnailUrl] = useState(initial?.thumbnail_url || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { name, url, source_type: sourceType, description, thumbnail_url: thumbnailUrl };
      const res = initial
        ? await fetch(`/api/content-sources?id=${initial.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/content-sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e?.error || "Failed to save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">
            {initial ? "Edit source" : "Add content source"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring 2026 Photoshoot"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's in here? Who has access? Etc."
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Thumbnail URL (optional)</label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://... (preview image)"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Optional: direct link to a preview image (jpg/png). Otherwise the type icon is shown.
            </p>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name || !url || saving}
            className="px-4 py-2 bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium rounded-lg hover:bg-primary/90"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add source"}
          </button>
        </div>
      </div>
    </div>
  );
}
