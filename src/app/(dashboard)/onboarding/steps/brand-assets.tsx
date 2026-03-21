"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  Check,
  Paintbrush,
  Camera,
  BookOpen,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

interface UploadedFile {
  name: string;
  path: string;
  type: string;
  category: string;
  status: "uploading" | "uploaded" | "parsing" | "parsed" | "error";
  previewUrl?: string;
}

const ASSET_CATEGORIES = [
  {
    id: "logo",
    label: "Logo",
    icon: Star,
    description: "Your brand logo in various formats",
    accept: ".png,.jpg,.jpeg,.svg,.pdf",
  },
  {
    id: "guidelines",
    label: "Brand Guidelines",
    icon: BookOpen,
    description: "Brand book, style guide, or design rules",
    accept: ".pdf,.png,.jpg,.jpeg",
  },
  {
    id: "moodboard",
    label: "Mood Board",
    icon: Paintbrush,
    description: "Visual inspiration and aesthetic references",
    accept: ".png,.jpg,.jpeg,.pdf",
  },
  {
    id: "photography",
    label: "Photography Style",
    icon: Camera,
    description: "Product photos or photography references",
    accept: ".png,.jpg,.jpeg",
  },
];

export function BrandAssetsStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (fileList: FileList, category: string = "general") => {
      setUploading(true);
      const supabase = createClient();

      for (const file of Array.from(fileList)) {
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `brand-assets/${org.id}/${fileName}`;

        // Generate preview for images
        let previewUrl: string | undefined;
        if (file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(file);
        }

        setFiles((prev) => [
          ...prev,
          {
            name: file.name,
            path: filePath,
            type: file.type,
            category,
            status: "uploading",
            previewUrl,
          },
        ]);

        const { error } = await supabase.storage
          .from("uploads")
          .upload(filePath, file);

        if (error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === filePath ? { ...f, status: "error" } : f
            )
          );
          continue;
        }

        await supabase.from("brand_documents").insert({
          org_id: org.id,
          file_path: filePath,
          file_type: file.type,
          parse_status: "pending",
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.path === filePath ? { ...f, status: "uploaded" } : f
          )
        );
      }

      setUploading(false);
      setActiveCategory(null);
    },
    [org.id]
  );

  function removeFile(path: string) {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  }

  const getCategoryFiles = (categoryId: string) =>
    files.filter((f) => f.category === categoryId);

  return (
    <div className="space-y-6">
      {/* Category Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ASSET_CATEGORIES.map((cat) => {
          const categoryFiles = getCategoryFiles(cat.id);
          const hasFiles = categoryFiles.length > 0;

          return (
            <div
              key={cat.id}
              className={cn(
                "relative border-2 rounded-xl p-4 transition-all duration-200",
                hasFiles
                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border hover:border-primary/30 bg-background"
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    hasFiles
                      ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {hasFiles ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <cat.icon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{cat.label}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {cat.description}
                  </p>
                </div>
              </div>

              {/* Thumbnails */}
              {categoryFiles.length > 0 && (
                <div className="flex gap-2 mb-3 flex-wrap">
                  {categoryFiles.map((file) => (
                    <div
                      key={file.path}
                      className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted border border-border group"
                    >
                      {file.previewUrl ? (
                        <img
                          src={file.previewUrl}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(file.path)}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      {file.status === "uploading" && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="w-3 h-3 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-primary cursor-pointer hover:text-primary/80 transition-colors">
                <Upload className="w-3.5 h-3.5" />
                {hasFiles ? "Add more" : "Upload files"}
                <input
                  type="file"
                  multiple
                  accept={cat.accept}
                  onChange={(e) =>
                    e.target.files && handleUpload(e.target.files, cat.id)
                  }
                  className="hidden"
                />
              </label>
            </div>
          );
        })}
      </div>

      {/* General Drop Zone */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/40 transition-all duration-200 group"
        onDragOver={(e) => {
          e.preventDefault();
          setActiveCategory("general");
        }}
        onDragLeave={() => setActiveCategory(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length)
            handleUpload(e.dataTransfer.files, "general");
        }}
      >
        <Upload
          className={cn(
            "w-8 h-8 mx-auto mb-3 transition-colors",
            activeCategory === "general"
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary/60"
          )}
        />
        <p className="text-sm text-muted-foreground mb-1">
          Or drag and drop any brand files here
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          PDF, PNG, JPG, SVG
        </p>
        <label className="inline-flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors">
          {uploading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
            </span>
          ) : (
            "Browse Files"
          )}
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.svg"
            onChange={(e) =>
              e.target.files && handleUpload(e.target.files, "general")
            }
            className="hidden"
          />
        </label>
      </div>

      {/* General files list */}
      {files.filter((f) => f.category === "general").length > 0 && (
        <div className="space-y-2">
          {files
            .filter((f) => f.category === "general")
            .map((file) => (
              <div
                key={file.path}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-border"
              >
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : file.type.startsWith("image/") ? (
                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <span
                  className={cn(
                    "text-xs capitalize px-2 py-0.5 rounded-full",
                    file.status === "uploaded" &&
                      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
                    file.status === "uploading" &&
                      "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                    file.status === "error" &&
                      "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                  )}
                >
                  {file.status}
                </span>
                <button
                  onClick={() => removeFile(file.path)}
                  className="p-1 hover:bg-muted rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className={cn(
            "px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "shadow-sm hover:shadow-md"
          )}
        >
          {files.length > 0 ? "Continue" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}
