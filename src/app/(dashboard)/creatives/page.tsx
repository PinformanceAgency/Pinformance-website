"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Upload,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedCreative {
  image_url: string;
  media_type: "image" | "video";
  analysis: {
    title: string;
    description: string;
    alt_text: string;
    keywords: string[];
    board_id: string | null;
    board_name: string;
    text_overlay: string;
  } | null;
  status: "uploading" | "analyzing" | "ready" | "queued" | "error";
  error?: string;
}

export default function CreativesPage() {
  const { org, loading } = useOrg();
  const [creatives, setCreatives] = useState<UploadedCreative[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !org) return;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const isVideo = file.type.startsWith("video/");
      const mediaType: "image" | "video" = isVideo ? "video" : "image";
      const fileName = `${org.id}/creatives/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

      // Add to state as uploading
      const tempUrl = URL.createObjectURL(file);
      setCreatives((prev) => [...prev, { image_url: tempUrl, media_type: mediaType, analysis: null, status: "uploading" }]);

      const supabase = createClient();
      const { error } = await supabase.storage
        .from("pin-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (error) {
        setCreatives((prev) =>
          prev.map((c) => (c.image_url === tempUrl ? { ...c, status: "error" as const, error: error.message } : c))
        );
        continue;
      }

      const { data: urlData } = supabase.storage.from("pin-images").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Update URL and start analysis
      setCreatives((prev) =>
        prev.map((c) => (c.image_url === tempUrl ? { ...c, image_url: publicUrl, status: "analyzing" as const, media_type: mediaType } : c))
      );

      // Analyze the creative
      try {
        const res = await fetch("/api/ai/analyze-creative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: publicUrl }),
        });

        if (res.ok) {
          const data = await res.json();
          setCreatives((prev) =>
            prev.map((c) =>
              c.image_url === publicUrl
                ? { ...c, analysis: data.analysis, status: "ready" as const }
                : c
            )
          );
        } else {
          const err = await res.json();
          setCreatives((prev) =>
            prev.map((c) =>
              c.image_url === publicUrl
                ? { ...c, status: "error" as const, error: err.error || "Analysis failed" }
                : c
            )
          );
        }
      } catch {
        setCreatives((prev) =>
          prev.map((c) =>
            c.image_url === publicUrl
              ? { ...c, status: "error" as const, error: "Network error" }
              : c
          )
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeCreative(url: string) {
    setCreatives(creatives.filter((c) => c.image_url !== url));
  }

  function updateField(url: string, field: string, value: string) {
    setCreatives(
      creatives.map((c) => {
        if (c.image_url !== url || !c.analysis) return c;
        return { ...c, analysis: { ...c.analysis, [field]: value } };
      })
    );
  }

  async function handleQueueAll() {
    if (!org) return;
    setSaving(true);

    const readyCreatives = creatives.filter((c) => c.status === "ready" && c.analysis);
    const supabase = createClient();

    for (const creative of readyCreatives) {
      const a = creative.analysis!;

      // Insert as a pin
      const isVideo = creative.media_type === "video";
      const { error } = await supabase.from("pins").insert({
        org_id: org.id,
        board_id: a.board_id,
        title: a.title,
        description: a.description,
        alt_text: a.alt_text,
        keywords: a.keywords,
        pin_type: isVideo ? "video" : "static",
        image_url: isVideo ? null : creative.image_url,
        video_url: isVideo ? creative.image_url : null,
        status: "generated",
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      if (!error) {
        setCreatives((prev) =>
          prev.map((c) => (c.image_url === creative.image_url ? { ...c, status: "queued" as const } : c))
        );
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const readyCount = creatives.filter((c) => c.status === "ready").length;
  const queuedCount = creatives.filter((c) => c.status === "queued").length;

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Own Creatives</h1>
        <p className="text-muted-foreground mt-1">
          Upload your own brand creatives. AI automatically generates SEO-optimized titles,
          descriptions, keywords, and assigns the best board.
        </p>
      </div>

      {/* Upload area */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-3 px-6 py-10 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors bg-card"
        >
          <Upload className="w-8 h-8" />
          <div className="text-center">
            <p className="text-sm font-medium">Upload Creatives</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload images or videos. AI will analyze each one and generate Pinterest SEO content.
            </p>
          </div>
        </button>
      </div>

      {/* Uploaded creatives list */}
      {creatives.length > 0 && (
        <div className="space-y-4">
          {creatives.map((creative, i) => (
            <div
              key={creative.image_url + i}
              className="bg-card border border-border rounded-xl overflow-hidden"
            >
              <div className="flex gap-4 p-4">
                {/* Media preview */}
                <div className="w-32 h-48 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative">
                  {creative.media_type === "video" ? (
                    <video
                      src={creative.image_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : (
                    <img
                      src={creative.image_url}
                      alt="Creative"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {creative.status === "analyzing" && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  {creative.status === "queued" && (
                    <div className="absolute inset-0 bg-green-600/50 flex items-center justify-center">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-3">
                  {creative.status === "uploading" && (
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  )}

                  {creative.status === "analyzing" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      AI is analyzing your creative and generating SEO content...
                    </div>
                  )}

                  {creative.status === "error" && (
                    <p className="text-sm text-red-500">{creative.error}</p>
                  )}

                  {creative.status === "queued" && (
                    <p className="text-sm text-green-600 font-medium">Added to pin queue</p>
                  )}

                  {(creative.status === "ready" || creative.status === "queued") && creative.analysis && (
                    <>
                      {/* Title */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Title</label>
                        <input
                          type="text"
                          value={creative.analysis.title}
                          onChange={(e) => updateField(creative.image_url, "title", e.target.value)}
                          disabled={creative.status === "queued"}
                          className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                        <textarea
                          value={creative.analysis.description}
                          onChange={(e) => updateField(creative.image_url, "description", e.target.value)}
                          disabled={creative.status === "queued"}
                          rows={2}
                          className="w-full mt-0.5 px-2 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                        />
                      </div>

                      {/* Keywords + Board */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-muted-foreground">Keywords</label>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {creative.analysis.keywords.join(", ")}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <label className="text-xs font-medium text-muted-foreground">Board</label>
                          <p className="text-xs font-medium mt-0.5 bg-primary/10 text-primary px-2 py-0.5 rounded">
                            {creative.analysis.board_name}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Remove button */}
                {creative.status !== "queued" && (
                  <button
                    onClick={() => removeCreative(creative.image_url)}
                    className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors self-start"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {creatives.length === 0 && (
        <div className="bg-muted/30 border border-dashed border-border rounded-xl p-12 text-center">
          <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No creatives uploaded yet. Upload your brand images or videos and AI will handle the SEO.
          </p>
        </div>
      )}

      {/* Queue button */}
      {readyCount > 0 && (
        <button
          onClick={handleQueueAll}
          disabled={saving}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
            saved
              ? "bg-green-600 text-white"
              : "bg-primary text-primary-foreground hover:opacity-90"
          )}
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" /> {queuedCount} pins added to queue
            </>
          ) : saving ? (
            "Adding to queue..."
          ) : (
            <>
              <Send className="w-4 h-4" /> Add {readyCount} creative{readyCount !== 1 ? "s" : ""} to pin queue
            </>
          )}
        </button>
      )}

      {/* Stats */}
      {creatives.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span>
            {readyCount} ready · {queuedCount} queued ·{" "}
            {creatives.filter((c) => c.status === "analyzing").length} analyzing
          </span>
        </div>
      )}
    </div>
  );
}
