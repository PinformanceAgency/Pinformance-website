"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  Upload,
  Check,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Send,
  X,
  Video,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadedCreative {
  image_url: string;
  overlay_url?: string; // After overlay is applied (statics only)
  media_type: "image" | "video";
  analysis: {
    title: string;
    description: string;
    alt_text: string;
    keywords: string[];
    board_id: string | null;
    board_name: string;
    boards: { id: string; name: string }[];
    text_overlay: string;
  } | null;
  status: "uploading" | "analyzing" | "applying_overlay" | "ready" | "queued" | "error";
  error?: string;
}

export default function CreativesPage() {
  const { org, loading } = useOrg();
  const [creatives, setCreatives] = useState<UploadedCreative[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [defaultLinkUrl, setDefaultLinkUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"video" | "static">("video");
  const [logoUrl, setLogoUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!org) return;
    fetch("/api/brand-settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.default_link_url) setDefaultLinkUrl(d.default_link_url);
      if (d?.logo_url) setLogoUrl(d.logo_url);
    });
  }, [org]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !org) return;

    const isVideoTab = activeTab === "video";

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const isVideo = file.type.startsWith("video/") || ["mov", "mp4", "avi", "webm", "mkv"].includes(ext);
      const mediaType: "image" | "video" = isVideo ? "video" : "image";

      const fileName = `${org.id}/creatives/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const tempUrl = URL.createObjectURL(file);
      setCreatives((prev) => [...prev, { image_url: tempUrl, media_type: mediaType, analysis: null, status: "uploading" }]);

      const supabase = createClient();
      const { error } = await supabase.storage
        .from("pin-images")
        .upload(fileName, file, { contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"), upsert: false });

      if (error) {
        setCreatives((prev) =>
          prev.map((c) => (c.image_url === tempUrl ? { ...c, status: "error" as const, error: error.message } : c))
        );
        continue;
      }

      const { data: urlData } = supabase.storage.from("pin-images").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      setCreatives((prev) =>
        prev.map((c) => (c.image_url === tempUrl ? { ...c, image_url: publicUrl, status: "analyzing" as const, media_type: mediaType } : c))
      );

      // Analyze the creative (SEO generation)
      try {
        const res = await fetch("/api/ai/analyze-creative", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: publicUrl, media_type: mediaType, file_name: file.name }),
        });

        if (res.ok) {
          const data = await res.json();
          const analysis = data.analysis;

          // For statics: apply text overlay + logo
          if (!isVideo && mediaType === "image" && analysis) {
            setCreatives((prev) =>
              prev.map((c) =>
                c.image_url === publicUrl ? { ...c, analysis, status: "applying_overlay" as const } : c
              )
            );

            try {
              const overlayRes = await fetch("/api/ai/apply-overlay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  image_url: publicUrl,
                  headline: analysis.text_overlay || analysis.title.substring(0, 50),
                  logo_url: logoUrl || null,
                }),
              });

              if (overlayRes.ok) {
                const overlayData = await overlayRes.json();
                if (overlayData.overlay_url) {
                  setCreatives((prev) =>
                    prev.map((c) =>
                      c.image_url === publicUrl
                        ? { ...c, overlay_url: overlayData.overlay_url, status: "ready" as const }
                        : c
                    )
                  );
                } else {
                  console.error("Overlay response missing overlay_url:", overlayData);
                  setCreatives((prev) =>
                    prev.map((c) =>
                      c.image_url === publicUrl ? { ...c, analysis, status: "ready" as const } : c
                    )
                  );
                }
              } else {
                const errText = await overlayRes.text();
                console.error("Overlay failed:", overlayRes.status, errText);
                setCreatives((prev) =>
                  prev.map((c) =>
                    c.image_url === publicUrl ? { ...c, analysis, status: "ready" as const, error: `Overlay: ${overlayRes.status}` } : c
                  )
                );
              }
            } catch {
              setCreatives((prev) =>
                prev.map((c) =>
                  c.image_url === publicUrl ? { ...c, analysis, status: "ready" as const } : c
                )
              );
            }
          } else {
            // Videos: just SEO, no overlay
            setCreatives((prev) =>
              prev.map((c) =>
                c.image_url === publicUrl ? { ...c, analysis, status: "ready" as const } : c
              )
            );
          }
        } else {
          const err = await res.json();
          setCreatives((prev) =>
            prev.map((c) =>
              c.image_url === publicUrl ? { ...c, status: "error" as const, error: err.error || "Analysis failed" } : c
            )
          );
        }
      } catch {
        setCreatives((prev) =>
          prev.map((c) =>
            c.image_url === publicUrl ? { ...c, status: "error" as const, error: "Network error" } : c
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
      const isVideo = creative.media_type === "video";
      const finalImageUrl = creative.overlay_url || creative.image_url;

      // Create a pin for EACH matching board
      const targetBoards = a.boards?.length > 0 ? a.boards : [{ id: a.board_id!, name: a.board_name }];
      let anySuccess = false;

      for (const board of targetBoards) {
        const { error } = await supabase.from("pins").insert({
          org_id: org.id,
          board_id: board.id,
          title: a.title,
          description: a.description,
          alt_text: a.alt_text,
          link_url: defaultLinkUrl,
          keywords: a.keywords,
          pin_type: isVideo ? "video" : "static",
          image_url: isVideo ? null : finalImageUrl,
          video_url: isVideo ? creative.image_url : null,
          status: "generated",
          scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        if (!error) anySuccess = true;
      }

      if (anySuccess) {
        setCreatives((prev) =>
          prev.map((c) => (c.image_url === creative.image_url ? { ...c, status: "queued" as const } : c))
        );
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const tabCreatives = creatives.filter((c) =>
    activeTab === "video" ? c.media_type === "video" : c.media_type === "image"
  );
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
          Upload your own brand content. Videos get SEO only. Statics get SEO + text overlay + logo.
        </p>
      </div>

      {/* Video / Static tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("video")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "video"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Video className="w-4 h-4" /> Videos
        </button>
        <button
          onClick={() => setActiveTab("static")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "static"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Camera className="w-4 h-4" /> Statics
        </button>
      </div>

      {/* Info card */}
      <div className="bg-card border border-border rounded-xl p-5">
        {activeTab === "video" ? (
          <div className="space-y-1">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Video className="w-4 h-4" /> Video Uploads</h3>
            <p className="text-sm text-muted-foreground">
              Upload video content. AI transcribes the audio and generates SEO-optimized titles, descriptions, and keywords.
              No changes are made to the video itself.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> Static Uploads</h3>
            <p className="text-sm text-muted-foreground">
              Upload photos from your shoots. AI generates SEO content and applies a subtle text overlay + brand logo
              following Pinterest&apos;s creative guidelines. Images are resized to 2:3 vertical format.
            </p>
          </div>
        )}
      </div>

      {/* Upload area */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept={activeTab === "video" ? "video/*,.mov,.mp4,.avi,.webm,.mkv,.MOV,.MP4" : "image/*"}
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
            <p className="text-sm font-medium">
              Upload {activeTab === "video" ? "Videos" : "Photos"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTab === "video"
                ? "AI transcribes audio and generates Pinterest SEO. No edits to the video."
                : "AI adds subtle text overlay + logo and generates Pinterest SEO."}
            </p>
          </div>
        </button>
      </div>

      {/* Creative cards */}
      {tabCreatives.length > 0 && (
        <div className="space-y-4">
          {tabCreatives.map((creative, i) => (
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
                      muted loop playsInline autoPlay
                    />
                  ) : (
                    <img
                      src={creative.overlay_url || creative.image_url}
                      alt="Creative"
                      className="w-full h-full object-cover"
                    />
                  )}
                  {(creative.status === "analyzing" || creative.status === "applying_overlay") && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  {creative.status === "queued" && (
                    <div className="absolute inset-0 bg-green-600/50 flex items-center justify-center">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                  )}
                  {creative.overlay_url && (
                    <div className="absolute top-1 left-1 bg-green-600/80 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                      OVERLAY
                    </div>
                  )}
                  {creative.media_type === "video" && (
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                      VIDEO
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
                      {creative.media_type === "video" ? "Transcribing audio & generating SEO..." : "Analyzing image & generating SEO..."}
                    </div>
                  )}

                  {creative.status === "applying_overlay" && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying text overlay + logo...
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
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-medium text-muted-foreground">Keywords</label>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {creative.analysis.keywords.join(", ")}
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <label className="text-xs font-medium text-muted-foreground">
                            Boards ({creative.analysis.boards?.length || 1})
                          </label>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {(creative.analysis.boards?.length ? creative.analysis.boards : [{ id: creative.analysis.board_id, name: creative.analysis.board_name }]).map((b, i) => (
                              <span key={i} className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                                {b.name.substring(0, 25)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

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
      {tabCreatives.length === 0 && (
        <div className="bg-muted/30 border border-dashed border-border rounded-xl p-12 text-center">
          {activeTab === "video" ? (
            <Video className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          ) : (
            <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          )}
          <p className="text-sm text-muted-foreground">
            No {activeTab === "video" ? "videos" : "photos"} uploaded yet.
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
            {creatives.filter((c) => c.status === "analyzing" || c.status === "applying_overlay").length} processing
          </span>
        </div>
      )}
    </div>
  );
}
