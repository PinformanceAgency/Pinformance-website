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

const SOURCE_TYPES: { value: string; label: string; icon: typeof FolderOpen; color: string }[] = [
  { value: "tagbox", label: "Tagbox", icon: Boxes, color: "bg-purple-500/10 text-purple-300 border-purple-500/30" },
  { value: "canva", label: "Canva", icon: Sparkles, color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30" },
  { value: "google_drive", label: "Google Drive", icon: HardDrive, color: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30" },
  { value: "dropbox", label: "Dropbox", icon: FileBox, color: "bg-blue-500/10 text-blue-300 border-blue-500/30" },
  { value: "instagram", label: "Instagram", icon: Instagram, color: "bg-pink-500/10 text-pink-300 border-pink-500/30" },
  { value: "tiktok", label: "TikTok", icon: Music2, color: "bg-rose-500/10 text-rose-300 border-rose-500/30" },
  { value: "notion", label: "Notion", icon: Layers, color: "bg-stone-500/10 text-stone-300 border-stone-500/30" },
  { value: "frame_io", label: "Frame.io", icon: Film, color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  { value: "other", label: "Other", icon: FolderOpen, color: "bg-gray-500/10 text-gray-300 border-gray-500/30" },
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
    if (!confirm("Verwijder deze content source?")) return;
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

  if (orgLoading) return <div className="text-white/40">Loading…</div>;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Raw Content</h1>
          <p className="text-sm text-white/50 mt-1">
            Externe content-bronnen voor {org?.name || "this brand"} — Tagbox, Canva, Google Drive, etc.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#E30613] hover:bg-[#c50511] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add source
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
          <input
            type="text"
            placeholder="Zoeken..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
          />
        </div>
        <button
          onClick={() => setFilterType("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
            filterType === "all"
              ? "bg-white/10 text-white border-white/20"
              : "bg-white/[0.02] text-white/50 border-white/[0.06] hover:text-white/80"
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
                  ? t.color
                  : "bg-white/[0.02] text-white/50 border-white/[0.06] hover:text-white/80"
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
        <div className="text-white/40 text-sm">Loading sources…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-xl p-12 text-center">
          <ImageIcon className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <h3 className="text-white/70 font-medium">Nog geen content-bronnen</h3>
          <p className="text-white/40 text-sm mt-1">
            Voeg de eerste link toe (Tagbox, Canva, Google Drive, etc.)
          </p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white text-sm rounded-lg transition-colors"
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
              <div
                key={s.id}
                className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/10 rounded-xl overflow-hidden transition-all"
              >
                {/* Thumbnail or icon header */}
                {s.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail_url} alt={s.name} className="w-full aspect-[3/2] object-cover" />
                ) : (
                  <div className={cn("w-full aspect-[3/2] flex items-center justify-center", meta.color.split(" ").slice(0, 2).join(" "))}>
                    <Icon className="w-12 h-12 opacity-40" />
                  </div>
                )}

                {/* Body */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border", meta.color)}>
                      <Icon className="w-2.5 h-2.5" />
                      {meta.label}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditing(s); setShowForm(true); }}
                        className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(s.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-white/50 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-medium text-white text-sm leading-tight">{s.name}</h3>
                  {s.description && (
                    <p className="text-xs text-white/50 mt-1 line-clamp-2">{s.description}</p>
                  )}
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white font-medium"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <h2 className="font-semibold text-white">
            {initial ? "Edit source" : "Add content source"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-white/50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-white/60 mb-1">Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/20"
            >
              {SOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="bv. Spring 2026 Photoshoot"
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">URL *</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Wat zit hier in? Wie heeft toegang? Etc."
              rows={3}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">Thumbnail URL (optional)</label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              placeholder="https://... (preview image)"
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/20"
            />
            <p className="text-[10px] text-white/30 mt-1">
              Optioneel: directe link naar een preview-image (jpg/png). Anders wordt het type-icoon getoond.
            </p>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/[0.06]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name || !url || saving}
            className="px-3.5 py-2 bg-[#E30613] hover:bg-[#c50511] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add source"}
          </button>
        </div>
      </div>
    </div>
  );
}
