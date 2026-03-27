"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Palette,
  ShoppingBag,
  Eye,
  FileText,
  ChevronDown,
  ChevronUp,
  Upload,
  X,
  Plus,
  Link2,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Visual style options                                               */
/* ------------------------------------------------------------------ */

const VISUAL_STYLE_OPTIONS = [
  "Minimalist",
  "Bold",
  "Lifestyle",
  "Flat-lay",
  "Editorial",
  "Infographic",
] as const;

type VisualStyle = (typeof VISUAL_STYLE_OPTIONS)[number];

/* ------------------------------------------------------------------ */
/*  Expandable section card                                            */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon: Icon,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-border/60 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File upload area                                                   */
/* ------------------------------------------------------------------ */

function FileUploadArea({
  label,
  accept,
  multiple,
  files,
  onFilesChange,
  helpText,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
  helpText?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    onFilesChange(multiple ? [...files, ...dropped] : dropped.slice(0, 1));
  }

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    onFilesChange(multiple ? [...files, ...selected] : selected.slice(0, 1));
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all"
      >
        <Upload className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Drag & drop or{" "}
          <span className="text-primary font-medium">browse</span>
        </span>
        {helpText && (
          <span className="text-xs text-muted-foreground/70">{helpText}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleSelect}
          className="hidden"
        />
      </div>
      {files.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg text-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  URL list input (add / remove)                                      */
/* ------------------------------------------------------------------ */

function UrlListInput({
  label,
  placeholder,
  maxItems,
  urls,
  onUrlsChange,
}: {
  label: string;
  placeholder: string;
  maxItems: number;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
}) {
  function updateUrl(index: number, value: string) {
    const updated = [...urls];
    updated[index] = value;
    onUrlsChange(updated);
  }

  function addUrl() {
    if (urls.length < maxItems) {
      onUrlsChange([...urls, ""]);
    }
  }

  function removeUrl(index: number) {
    onUrlsChange(urls.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      <div className="space-y-2">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="url"
                value={url}
                onChange={(e) => updateUrl(i, e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder={placeholder}
              />
            </div>
            {urls.length > 1 && (
              <button
                type="button"
                onClick={() => removeUrl(i)}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {urls.length < maxItems && (
          <button
            type="button"
            onClick={addUrl}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add another ({urls.length}/{maxItems})
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main step component                                                */
/* ------------------------------------------------------------------ */

export function BrandAssetsStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Brand Guidelines ---
  const [logoFiles, setLogoFiles] = useState<File[]>([]);
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [secondaryColor, setSecondaryColor] = useState("#FFFFFF");
  const [fontPreferences, setFontPreferences] = useState("");
  const [brandVoiceDescription, setBrandVoiceDescription] = useState("");

  // --- Product Assets ---
  const [productCatalogUrl, setProductCatalogUrl] = useState("");
  const [heroProductImages, setHeroProductImages] = useState<File[]>([]);
  const [productDescriptions, setProductDescriptions] = useState("");

  // --- Design References ---
  const [pinterestBoards, setPinterestBoards] = useState<string[]>([""]);
  const [competitorAccounts, setCompetitorAccounts] = useState<string[]>([""]);
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>([]);

  // --- Brand Research / Strategy ---
  const [targetAudience, setTargetAudience] = useState("");
  const [uniqueSellingPoints, setUniqueSellingPoints] = useState("");
  const [keywords, setKeywords] = useState("");
  const [seasonalCalendar, setSeasonalCalendar] = useState("");
  const [anythingElse, setAnythingElse] = useState("");

  function toggleVisualStyle(style: VisualStyle) {
    setVisualStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  }

  /* Upload helper — returns metadata for each uploaded file */
  async function uploadFiles(
    supabase: ReturnType<typeof createClient>,
    files: File[],
    folder: string
  ) {
    const results: {
      url: string;
      name: string;
      size: number;
      type: string;
    }[] = [];

    for (const file of files) {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${org.id}/${folder}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("uploads")
        .getPublicUrl(filePath);

      results.push({
        url: urlData.publicUrl,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    }

    return results;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      // Upload logo files
      const uploadedLogos = await uploadFiles(
        supabase,
        logoFiles,
        "brand-assets/logos"
      );

      // Upload hero product images
      const uploadedHeroImages = await uploadFiles(
        supabase,
        heroProductImages,
        "brand-assets/products"
      );

      // Build the JSONB payload
      const brandAssetsData = {
        brand_guidelines: {
          logos: uploadedLogos,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          font_preferences: fontPreferences,
          brand_voice_description: brandVoiceDescription,
        },
        product_assets: {
          product_catalog_url: productCatalogUrl,
          hero_product_images: uploadedHeroImages,
          product_descriptions: productDescriptions,
        },
        design_references: {
          pinterest_boards: pinterestBoards.filter(Boolean),
          competitor_accounts: competitorAccounts.filter(Boolean),
          visual_styles: visualStyles,
        },
        brand_research: {
          target_audience: targetAudience,
          unique_selling_points: uniqueSellingPoints,
          keywords,
          seasonal_calendar: seasonalCalendar,
          anything_else: anythingElse,
        },
      };

      // Merge with existing raw_data in brand_profiles
      const { data: existingProfile } = await supabase
        .from("brand_profiles")
        .select("raw_data")
        .eq("org_id", org.id)
        .single();

      const mergedRawData = {
        ...(existingProfile?.raw_data || {}),
        brand_assets: brandAssetsData,
      };

      await supabase.from("brand_profiles").upsert(
        {
          org_id: org.id,
          raw_data: mergedRawData,
        },
        { onConflict: "org_id" }
      );

      // Create client_documents entries for every uploaded file
      const allUploaded = [...uploadedLogos, ...uploadedHeroImages];

      for (const file of allUploaded) {
        await supabase.from("client_documents").insert({
          org_id: org.id,
          title: file.name,
          description: "Brand asset uploaded during onboarding",
          file_url: file.url,
          file_type: file.type,
          file_size: file.size,
        });
      }

      onNext();
    } catch (err) {
      console.error("Failed to save brand assets:", err);
      setError("Something went wrong saving your assets. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ---- Section 1: Brand Guidelines ---- */}
      <SectionCard
        icon={Palette}
        title="Brand Guidelines"
        description="Logo, colors, fonts, and tone of voice"
        defaultOpen
      >
        <FileUploadArea
          label="Logo"
          accept=".png,.svg,image/png,image/svg+xml"
          files={logoFiles}
          onFilesChange={setLogoFiles}
          helpText="PNG or SVG format recommended"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Primary Brand Color
            </label>
            <div className="flex items-center gap-2">
              <label className="relative w-10 h-10 rounded-lg border border-input cursor-pointer overflow-hidden flex-shrink-0">
                <div
                  className="w-full h-full"
                  style={{ backgroundColor: primaryColor }}
                />
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="#000000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Secondary Brand Color
            </label>
            <div className="flex items-center gap-2">
              <label className="relative w-10 h-10 rounded-lg border border-input cursor-pointer overflow-hidden flex-shrink-0">
                <div
                  className="w-full h-full"
                  style={{ backgroundColor: secondaryColor }}
                />
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="#FFFFFF"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Font Preferences
          </label>
          <input
            type="text"
            value={fontPreferences}
            onChange={(e) => setFontPreferences(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="e.g. Montserrat for headings, Open Sans for body text"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Brand Voice / Tone Description
          </label>
          <textarea
            value={brandVoiceDescription}
            onChange={(e) => setBrandVoiceDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="Describe how your brand communicates. e.g. friendly and approachable, but professional..."
          />
        </div>
      </SectionCard>

      {/* ---- Section 2: Product Assets ---- */}
      <SectionCard
        icon={ShoppingBag}
        title="Product Assets"
        description="Product catalog, hero images, and descriptions"
      >
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Product Catalog Link
          </label>
          <div className="relative">
            <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="url"
              value={productCatalogUrl}
              onChange={(e) => setProductCatalogUrl(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="https://yourstore.com/collections"
            />
          </div>
        </div>

        <FileUploadArea
          label="Hero Product Images"
          accept="image/*"
          multiple
          files={heroProductImages}
          onFilesChange={setHeroProductImages}
          helpText="Upload your best product shots. Multiple files allowed."
        />

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Product Descriptions
          </label>
          <textarea
            value={productDescriptions}
            onChange={(e) => setProductDescriptions(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[100px] resize-none"
            placeholder="Brief descriptions of your key products or product lines..."
          />
        </div>
      </SectionCard>

      {/* ---- Section 3: Design References ---- */}
      <SectionCard
        icon={Eye}
        title="Design References"
        description="Pinterest inspiration, competitors, and visual style"
      >
        <UrlListInput
          label="Pinterest Boards You Like"
          placeholder="https://pinterest.com/user/board-name"
          maxItems={5}
          urls={pinterestBoards}
          onUrlsChange={setPinterestBoards}
        />

        <UrlListInput
          label="Competitor Pinterest Accounts"
          placeholder="https://pinterest.com/competitor"
          maxItems={3}
          urls={competitorAccounts}
          onUrlsChange={setCompetitorAccounts}
        />

        <div>
          <label className="block text-sm font-medium mb-2">
            Visual Style Preferences
          </label>
          <div className="flex flex-wrap gap-2">
            {VISUAL_STYLE_OPTIONS.map((style) => {
              const selected = visualStyles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => toggleVisualStyle(style)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-200",
                    selected
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {style}
                </button>
              );
            })}
          </div>
          {visualStyles.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Selected: {visualStyles.join(", ")}
            </p>
          )}
        </div>
      </SectionCard>

      {/* ---- Section 4: Brand Research / Strategy ---- */}
      <SectionCard
        icon={FileText}
        title="Brand Research & Strategy"
        description="Audience, USPs, keywords, and seasonal planning"
      >
        <div>
          <label className="block text-sm font-medium mb-1.5">
            Target Audience Description
          </label>
          <textarea
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="Who is your ideal customer? Demographics, interests, pain points..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Unique Selling Points
          </label>
          <textarea
            value={uniqueSellingPoints}
            onChange={(e) => setUniqueSellingPoints(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder={"- Free shipping on all orders\n- 100% organic ingredients\n- Hand-crafted in small batches"}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Use bullet points (one per line) for each unique selling point.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Keywords to Rank For
          </label>
          <textarea
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="organic skincare, natural moisturizer, vegan beauty products..."
          />
          <p className="text-xs text-muted-foreground mt-1">
            Keywords people search for on Pinterest that relate to your brand.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Seasonal Calendar / Promotion Schedule
          </label>
          <textarea
            value={seasonalCalendar}
            onChange={(e) => setSeasonalCalendar(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="e.g. Spring collection launch in March, Black Friday sale in November, Holiday gift guides in December..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Anything Else
          </label>
          <textarea
            value={anythingElse}
            onChange={(e) => setAnythingElse(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="Any other information, brand guidelines documents, notes for our team..."
          />
        </div>
      </SectionCard>

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "relative px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "shadow-sm hover:shadow-md"
          )}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving assets...
            </span>
          ) : (
            "Complete Step"
          )}
        </button>
      </div>
    </form>
  );
}
