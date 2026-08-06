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
  Settings as SettingsIcon,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OverlaySettings } from "@/components/creatives/overlay-settings";
import { BOARD_CATEGORIES, boardCategoryLabel } from "@/lib/constants";

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

interface ActiveBoard {
  id: string;
  name: string;
  pinterest_board_id: string | null;
  category: string | null;
}

export default function CreativesPage() {
  const { org, loading } = useOrg();
  const [creatives, setCreatives] = useState<UploadedCreative[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [defaultLinkUrl, setDefaultLinkUrl] = useState("");
  const [activeTab, setActiveTab] = useState<"video" | "static" | "settings">("video");
  const staticCounterRef = useRef(0);
  const [logoUrl, setLogoUrl] = useState("");
  const [rotation, setRotation] = useState({ full_overlay: 3, logo_only: 1, clean: 1 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeBoards, setActiveBoards] = useState<ActiveBoard[]>([]);
  // Per-creative multi-select: image_url → set of board_ids that will each get
  // one pin when queued. Seeded from the AI's matched boards; user can toggle
  // any active board on/off. An empty array means "pin will not be queued for
  // this creative until the user picks at least one board".
  const [boardSelections, setBoardSelections] = useState<Record<string, string[]>>({});
  // Batch board assignment: pick one board and add it to every currently-
  // uploaded creative's selection (does NOT remove existing AI picks).
  const [batchBoardId, setBatchBoardId] = useState<string>("");
  const [batchCategoryFilter, setBatchCategoryFilter] = useState<string>("all");
  // Per-creative override: image_url → destination link URL.
  const [linkOverrides, setLinkOverrides] = useState<Record<string, string>>({});
  // Products with explicit destination URLs, used for auto-match + quick-pick.
  const [productUrls, setProductUrls] = useState<{ id: string; title: string; product_url: string }[]>([]);

  useEffect(() => {
    if (!org) return;
    fetch("/api/brand-settings").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.default_link_url) setDefaultLinkUrl(d.default_link_url);
      if (d?.logo_url) setLogoUrl(d.logo_url);
      if (d?.overlay_config?.rotation) {
        setRotation({
          full_overlay: d.overlay_config.rotation.full_overlay ?? 3,
          logo_only: d.overlay_config.rotation.logo_only ?? 1,
          clean: d.overlay_config.rotation.clean ?? 1,
        });
      }
    });

    // Load products that have an explicit destination URL, for auto-match
    // and the quick-pick row on each creative card.
    fetch("/api/products?status=active")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.products) {
          setProductUrls(
            (d.products as { id: string; title: string; product_url?: string | null }[])
              .filter(p => p.product_url)
              .map(p => ({ id: p.id, title: p.title, product_url: p.product_url! }))
          );
        }
      });

    // Load active Pinterest-synced boards for the override dropdown.
    loadActiveBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org]);

  /**
   * Find the best-matching product URL from the analyzed title.
   * Picks the product whose title has the most words in common with the
   * creative title (case-insensitive). Returns null when nothing matches.
   */
  function matchProductUrl(analysisTitle: string): string | null {
    if (!productUrls.length) return null;
    const lower = analysisTitle.toLowerCase();
    let best: { url: string; score: number } | null = null;
    for (const p of productUrls) {
      // Score = number of product title words found in the analysis title.
      const words = p.title.toLowerCase().split(/\s+/).filter(Boolean);
      const score = words.filter(w => lower.includes(w)).length;
      if (score > 0 && (!best || score > best.score)) {
        best = { url: p.product_url, score };
      }
    }
    return best?.url ?? null;
  }

  async function loadActiveBoards() {
    if (!org) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("boards")
      .select("id, name, pinterest_board_id, category")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("name");
    setActiveBoards(((data as ActiveBoard[]) || []));
  }

  /**
   * Toggle one board on/off for a single creative. If the creative doesn't
   * have a selection yet, we seed from the AI's matched boards first so
   * the AI picks aren't silently wiped when the user makes their first click.
   */
  function toggleBoard(creativeUrl: string, boardId: string) {
    setBoardSelections((prev) => {
      const current =
        prev[creativeUrl] ??
        (creatives
          .find((c) => c.image_url === creativeUrl)
          ?.analysis?.boards?.map((b) => b.id)
          .filter((id): id is string => !!id) ??
          []);
      const set = new Set(current);
      if (set.has(boardId)) set.delete(boardId);
      else set.add(boardId);
      return { ...prev, [creativeUrl]: Array.from(set) };
    });
  }

  /**
   * Add the chosen batch board to every uploaded creative's selection. Unlike
   * the old "override all" behaviour, this UNIONs with the existing AI picks
   * so the user can layer in a seasonal or campaign board on top of the AI's
   * automatic matches with a single click.
   */
  function applyBatchBoard() {
    if (!batchBoardId) return;
    setBoardSelections((prev) => {
      const next = { ...prev };
      for (const c of creatives) {
        const current =
          next[c.image_url] ??
          (c.analysis?.boards?.map((b) => b.id).filter((id): id is string => !!id) ?? []);
        const set = new Set(current);
        set.add(batchBoardId);
        next[c.image_url] = Array.from(set);
      }
      return next;
    });
  }

  /** Effective board IDs for a creative — user selection if present, else the
   *  AI's matched boards. Empty array = nothing to queue. */
  function getSelectedBoardIds(creative: UploadedCreative): string[] {
    const override = boardSelections[creative.image_url];
    if (override) return override;
    return (creative.analysis?.boards ?? [])
      .map((b) => b.id)
      .filter((id): id is string => !!id);
  }

  function setLinkOverride(creativeUrl: string, link: string) {
    setLinkOverrides((prev) => ({ ...prev, [creativeUrl]: link }));
  }

  /**
   * Extract the first frame of a video as a JPEG blob using canvas.
   * This runs client-side so we can send the thumbnail to Claude Vision.
   */
  async function extractVideoThumbnail(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadeddata = () => {
        video.currentTime = 0.5; // Seek to 0.5s for a good frame
      };

      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1000;
        canvas.height = video.videoHeight || 1500;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, "image/jpeg", 0.85);
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      // Timeout after 10s
      setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 10000);
    });
  }

  // Process one uploaded file end-to-end (upload → analyze → overlay). The
  // overlay variant is decided up-front by the caller so the rotation stays
  // deterministic even though files run concurrently.
  async function processFile(
    file: File,
    overlayVariant: "full" | "logo-only" | "clean" | null
  ) {
    if (!org) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const isVideo = file.type.startsWith("video/") || ["mov", "mp4", "avi", "webm", "mkv"].includes(ext);
    const mediaType: "image" | "video" = isVideo ? "video" : "image";

    const rand = Math.random().toString(36).slice(2, 8);
    const fileName = `${org.id}/creatives/${Date.now()}-${rand}.${ext}`;
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
      return;
    }

    const { data: urlData } = supabase.storage.from("pin-images").getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    setCreatives((prev) =>
      prev.map((c) => (c.image_url === tempUrl ? { ...c, image_url: publicUrl, status: "analyzing" as const, media_type: mediaType } : c))
    );

    // For videos: extract thumbnail and upload it so Claude can see the content
    let thumbnailUrl: string | null = null;
    if (isVideo) {
      const thumbBlob = await extractVideoThumbnail(file);
      if (thumbBlob) {
        const thumbName = `${org.id}/creatives/thumb-${Date.now()}-${rand}.jpg`;
        const { error: thumbErr } = await supabase.storage
          .from("pin-images")
          .upload(thumbName, thumbBlob, { contentType: "image/jpeg", upsert: false });
        if (!thumbErr) {
          const { data: thumbUrlData } = supabase.storage.from("pin-images").getPublicUrl(thumbName);
          thumbnailUrl = thumbUrlData.publicUrl;
        }
      }
    }

    // Analyze the creative (SEO generation)
    try {
      const res = await fetch("/api/ai/analyze-creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: publicUrl,
          media_type: mediaType,
          file_name: file.name,
          thumbnail_url: thumbnailUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const analysis = data.analysis;

        // Auto-fill the destination URL from the product that best matches
        // the analyzed title, unless the user already set one manually.
        if (analysis?.title) {
          const matched = matchProductUrl(analysis.title);
          if (matched) {
            setLinkOverrides(prev => {
              if (prev[publicUrl] !== undefined && prev[publicUrl] !== "") return prev;
              return { ...prev, [publicUrl]: matched };
            });
          }
        }

        // For statics: apply the pre-assigned overlay variant (full / logo-only / clean)
        if (!isVideo && mediaType === "image" && analysis && overlayVariant) {
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
                variant: overlayVariant,
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

  function isVideoFile(file: File): boolean {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    return file.type.startsWith("video/") || ["mov", "mp4", "avi", "webm", "mkv"].includes(ext);
  }

  /** Shared processing for anything that hands us File objects — the file
   *  picker, paste from clipboard, and drag-and-drop all route through here so
   *  overlay rotation + concurrency stay identical across entry points. */
  async function processFiles(fileArr: File[]) {
    if (!fileArr.length || !org) return;

    // Filter to only files that match the current tab so pasting a screenshot
    // while on the Videos tab (or vice versa) is silently ignored instead of
    // creating an "error" card.
    const wantVideo = activeTab === "video";
    const filtered = fileArr.filter((f) => isVideoFile(f) === wantVideo);
    if (filtered.length === 0) return;

    // Decide the overlay variant for each static up-front (deterministic
    // rotation), so concurrent processing doesn't race on staticCounterRef.
    const variants = filtered.map((file) => {
      if (isVideoFile(file)) return null;
      const cycleSize = Math.max(1, rotation.full_overlay + rotation.logo_only + rotation.clean);
      const counter = staticCounterRef.current % cycleSize;
      staticCounterRef.current++;
      if (counter < rotation.full_overlay) return "full" as const;
      if (counter < rotation.full_overlay + rotation.logo_only) return "logo-only" as const;
      return "clean" as const;
    });

    // Process up to CONCURRENCY files at once instead of one-by-one.
    const CONCURRENCY = 3;
    let next = 0;
    async function worker() {
      while (next < filtered.length) {
        const i = next++;
        await processFile(filtered[i], variants[i]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, filtered.length) }, () => worker())
    );
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    await processFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Cmd/Ctrl+V from Finder or Windows Explorer drops File objects onto
  // clipboard.items. Route them straight into processFiles so pasting has the
  // same UX as picking a file. Skipped when the user is typing in a form so
  // pasting text into the title / description fields keeps working.
  useEffect(() => {
    if (activeTab === "settings") return;
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      processFiles(files);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, org?.id, rotation.full_overlay, rotation.logo_only, rotation.clean]);

  const [isDragging, setIsDragging] = useState(false);
  function handleDragEnter(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    // Only react to drags that actually carry files (not selected text, etc).
    if (e.dataTransfer.types?.includes("Files")) setIsDragging(true);
  }
  function handleDragOver(e: React.DragEvent<HTMLButtonElement>) {
    if (e.dataTransfer.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }
  function handleDragLeave(e: React.DragEvent<HTMLButtonElement>) {
    // dragleave fires when moving over child nodes too — check we've really left.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }
  async function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    await processFiles(files);
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

      const linkUrlOverride = linkOverrides[creative.image_url];
      const finalLinkUrl = (linkUrlOverride && linkUrlOverride.trim()) || defaultLinkUrl;

      // Resolve all boards the user (or AI, by default) selected for this
      // creative — one pin gets inserted per board so a single upload can
      // land on multiple boards with one click.
      const selectedIds = getSelectedBoardIds(creative);
      const boardsToUse: { id: string; name: string }[] = [];
      for (const id of selectedIds) {
        const known = activeBoards.find((b) => b.id === id);
        if (known) {
          boardsToUse.push({ id: known.id, name: known.name });
        } else {
          const aiMatch = a.boards?.find((b) => b.id === id);
          if (aiMatch?.id) boardsToUse.push({ id: aiMatch.id, name: aiMatch.name });
        }
      }
      // Nothing selected → fall back to the AI primary so the queue button
      // never silently drops the creative.
      if (boardsToUse.length === 0 && a.board_id) {
        boardsToUse.push({ id: a.board_id, name: a.board_name });
      }
      if (boardsToUse.length === 0) continue;

      const rows = boardsToUse.map((b) => ({
        org_id: org.id,
        board_id: b.id,
        title: a.title,
        description: a.description,
        alt_text: a.alt_text,
        link_url: finalLinkUrl,
        keywords: a.keywords,
        pin_type: isVideo ? "video" : "static",
        image_url: isVideo ? null : finalImageUrl,
        video_url: isVideo ? creative.image_url : null,
        status: "generated",
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }));

      const { error } = await supabase.from("pins").insert(rows);

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

  /** Total pins that Queue-All will create — sum of selected boards per ready
   *  creative. Shown on the queue button so the user sees the multiplier. */
  function computePinsToQueue(): number {
    let total = 0;
    for (const c of creatives) {
      if (c.status !== "ready" || !c.analysis) continue;
      const n = getSelectedBoardIds(c).length;
      total += n > 0 ? n : c.analysis.board_id ? 1 : 0;
    }
    return total;
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

      {/* Video / Static / Settings tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto",
            activeTab === "settings"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <SettingsIcon className="w-4 h-4" /> Settings
        </button>
      </div>

      {/* Settings tab content */}
      {activeTab === "settings" && <OverlaySettings orgName={org?.name} />}

      {/* Upload UI hidden when on settings tab */}
      {activeTab !== "settings" && (
      <>
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
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-3 px-6 py-10 border-2 border-dashed rounded-xl transition-colors bg-card",
            isDragging
              ? "border-primary text-primary bg-primary/5"
              : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
          )}
        >
          <Upload className="w-8 h-8" />
          <div className="text-center">
            <p className="text-sm font-medium">
              {isDragging
                ? `Drop to upload ${activeTab === "video" ? "video" : "photo"}${activeTab === "video" ? "s" : "s"}`
                : `Upload ${activeTab === "video" ? "Videos" : "Photos"}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTab === "video"
                ? "AI transcribes audio and generates Pinterest SEO. No edits to the video."
                : "AI adds subtle text overlay + logo and generates Pinterest SEO."}
            </p>
            {!isDragging && (
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                Click to pick files &middot; drag &amp; drop from Finder / Explorer &middot; or paste with{" "}
                <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-medium">
                  {typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("mac") ? "⌘V" : "Ctrl+V"}
                </kbd>
              </p>
            )}
          </div>
        </button>
      </div>

      {/* Batch: add a board to every uploaded creative in one click */}
      {tabCreatives.length > 0 && activeBoards.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Add one board to all creatives</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Adds the chosen board to every uploaded creative&apos;s selection on top of the AI picks —
            handy for seasonal or campaign boards. Existing selections stay intact.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={batchCategoryFilter}
              onChange={(e) => {
                setBatchCategoryFilter(e.target.value);
                setBatchBoardId("");
              }}
              className="px-2.5 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="all">All categories</option>
              {BOARD_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select
              value={batchBoardId}
              onChange={(e) => setBatchBoardId(e.target.value)}
              className="flex-1 min-w-[180px] px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">— Choose a board —</option>
              {activeBoards
                .filter((b) => batchCategoryFilter === "all" || b.category === batchCategoryFilter)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.category ? ` · ${boardCategoryLabel(b.category)}` : ""}
                    {!b.pinterest_board_id ? " ⚠ not on Pinterest" : ""}
                  </option>
                ))}
            </select>
            <button
              type="button"
              onClick={applyBatchBoard}
              disabled={!batchBoardId}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              Add to all {tabCreatives.length}
            </button>
          </div>
        </div>
      )}

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
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Keywords</label>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {creative.analysis.keywords.join(", ")}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Boards <span className="text-primary">(pick one or more — one pin gets created per board)</span>
                        </label>
                        {(() => {
                          const aiIds = new Set(
                            (creative.analysis.boards ?? [])
                              .map((b) => b.id)
                              .filter((id): id is string => !!id)
                          );
                          const selectedIds = new Set(getSelectedBoardIds(creative));
                          const disabled = creative.status === "queued";
                          if (activeBoards.length === 0) {
                            return (
                              <p className="text-xs text-muted-foreground mt-1">
                                No synced boards yet — run Sync from Pinterest on the Boards page.
                              </p>
                            );
                          }
                          // AI boards first (highlighted), then the rest alphabetically.
                          const sorted = [...activeBoards].sort((a, b) => {
                            const aAi = aiIds.has(a.id) ? 0 : 1;
                            const bAi = aiIds.has(b.id) ? 0 : 1;
                            if (aAi !== bAi) return aAi - bAi;
                            return a.name.localeCompare(b.name);
                          });
                          return (
                            <>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {sorted.map((b) => {
                                  const isAi = aiIds.has(b.id);
                                  const isOn = selectedIds.has(b.id);
                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      onClick={() => toggleBoard(creative.image_url, b.id)}
                                      disabled={disabled}
                                      title={
                                        (isAi ? "AI pick · " : "") +
                                        b.name +
                                        (b.category ? ` (${boardCategoryLabel(b.category)})` : "") +
                                        (!b.pinterest_board_id ? " · not on Pinterest" : "")
                                      }
                                      className={cn(
                                        "px-2 py-1 text-[11px] font-medium rounded-full border transition-colors inline-flex items-center gap-1",
                                        isOn
                                          ? isAi
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-blue-500/15 text-blue-700 border-blue-500/40"
                                          : isAi
                                            ? "bg-primary/5 text-primary border-primary/40 hover:bg-primary/10"
                                            : "bg-muted text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
                                        disabled && "opacity-60 cursor-not-allowed"
                                      )}
                                    >
                                      {isOn && <Check className="w-3 h-3" />}
                                      {b.name}
                                      {isAi && <Sparkles className="w-3 h-3 opacity-70" />}
                                      {!b.pinterest_board_id && <span title="Not on Pinterest">⚠</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1.5">
                                {selectedIds.size === 0 ? (
                                  <span className="text-yellow-700">
                                    No board selected — this creative will be skipped when you queue.
                                  </span>
                                ) : (
                                  <>
                                    {selectedIds.size} board{selectedIds.size === 1 ? "" : "s"} selected — {selectedIds.size} pin
                                    {selectedIds.size === 1 ? "" : "s"} will be created.
                                    {aiIds.size > 0 && (
                                      <>
                                        {" · "}
                                        <Sparkles className="inline w-3 h-3 -mt-0.5" /> = AI pick
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">
                          Destination URL <span className="text-primary">(where the pin links to when clicked)</span>
                        </label>
                        <input
                          type="url"
                          value={linkOverrides[creative.image_url] ?? defaultLinkUrl}
                          onChange={(e) => setLinkOverride(creative.image_url, e.target.value)}
                          disabled={creative.status === "queued"}
                          placeholder={defaultLinkUrl || "https://example.com/product"}
                          className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        {/* Product URL quick-pick chips */}
                        {productUrls.length > 0 && creative.status !== "queued" && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {productUrls.map((p) => {
                              const current = linkOverrides[creative.image_url] ?? defaultLinkUrl;
                              const isActive = current === p.product_url;
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setLinkOverride(creative.image_url, p.product_url)}
                                  className={cn(
                                    "px-2 py-0.5 text-[11px] font-medium rounded-full border transition-colors",
                                    isActive
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-muted text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                                  )}
                                  title={p.product_url}
                                >
                                  {p.title}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {linkOverrides[creative.image_url] !== undefined &&
                          linkOverrides[creative.image_url] !== defaultLinkUrl
                            ? "Custom URL for this pin."
                            : defaultLinkUrl
                              ? "Using brand default. Change above to point this pin somewhere else."
                              : "No brand default URL set in Settings — enter one here, or pins will save without a link."}
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
      {readyCount > 0 && (() => {
        const pinCount = computePinsToQueue();
        return (
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
                <Check className="w-4 h-4" /> {queuedCount} creative{queuedCount !== 1 ? "s" : ""} queued
              </>
            ) : saving ? (
              "Adding to queue..."
            ) : (
              <>
                <Send className="w-4 h-4" /> Add {readyCount} creative{readyCount !== 1 ? "s" : ""} → {pinCount} pin
                {pinCount !== 1 ? "s" : ""} to queue
              </>
            )}
          </button>
        );
      })()}

      {/* Stats */}
      {creatives.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <span>
            {readyCount} ready · {queuedCount} queued ·{" "}
            {creatives.filter((c) => c.status === "analyzing" || c.status === "applying_overlay").length} processing
          </span>
        </div>
      )}
      </>
      )}
    </div>
  );
}
