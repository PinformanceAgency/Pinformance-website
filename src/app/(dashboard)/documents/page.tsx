"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import {
  FileText,
  Download,
  Plus,
  X,
  Upload,
  File,
  Image,
  FileSpreadsheet,
} from "lucide-react";
import type { ClientDocument } from "@/lib/types";

export default function DocumentsPage() {
  const { org, isAgencyAdmin, loading } = useOrg();
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newDoc, setNewDoc] = useState({ title: "", description: "" });
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!org) return;
    loadDocuments();
  }, [org]);

  async function loadDocuments() {
    if (!org) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("client_documents")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    setDocuments((data as ClientDocument[]) || []);
  }

  async function handleUpload() {
    if (!org || !file || !newDoc.title.trim()) return;
    setUploading(true);

    const supabase = createClient();
    const filePath = `${org.id}/documents/${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, file);

    if (uploadError) {
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("client_documents").insert({
      org_id: org.id,
      title: newDoc.title.trim(),
      description: newDoc.description.trim() || null,
      file_url: urlData.publicUrl,
      file_type: file.type || null,
      file_size: file.size,
      uploaded_by: user?.id || null,
    });

    setNewDoc({ title: "", description: "" });
    setFile(null);
    setShowUpload(false);
    setUploading(false);
    loadDocuments();
  }

  function getFileIcon(fileType: string | null) {
    if (!fileType) return File;
    if (fileType.startsWith("image/")) return Image;
    if (fileType.includes("spreadsheet") || fileType.includes("csv")) return FileSpreadsheet;
    if (fileType.includes("pdf")) return FileText;
    return File;
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-muted-foreground mt-1">
            {documents.length} documents available
          </p>
        </div>
        {isAgencyAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Upload Document
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => {
          const IconComponent = getFileIcon(doc.file_type);
          return (
            <div
              key={doc.id}
              className="bg-card border border-border rounded-xl p-5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                  <IconComponent className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium truncate">{doc.title}</h3>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {doc.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatFileSize(doc.file_size)}</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>

              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-muted text-foreground py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-muted/80 transition-colors"
              >
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          );
        })}
      </div>

      {documents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
          No documents yet.{" "}
          {isAgencyAdmin
            ? "Upload documents for your clients."
            : "Documents shared by your agency will appear here."}
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl border border-border max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Upload Document</h3>
                <button onClick={() => setShowUpload(false)} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  type="text"
                  value={newDoc.title}
                  onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                  placeholder="Document title"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                <textarea
                  value={newDoc.description}
                  onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of this document"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">File</label>
                <div className="mt-1">
                  <label className="flex items-center justify-center gap-2 w-full py-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {file ? file.name : "Click to select a file"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowUpload(false)}
                  className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !newDoc.title.trim() || !file}
                  className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
