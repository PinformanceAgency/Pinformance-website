"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Check,
  Loader2,
  ExternalLink,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
  { href: "/settings/products", label: "Products" },
];

interface ProductRow {
  id: string;
  title: string;
  product_type: string | null;
  status: string;
  product_url: string | null;
}

interface EditState {
  [id: string]: {
    title: string;
    product_url: string;
    saving: boolean;
    saved: boolean;
    error: string | null;
  };
}

export default function ProductsSettingsPage() {
  const pathname = usePathname();
  const { org, loading } = useOrg();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editState, setEditState] = useState<EditState>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  // New product form
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) return;
    loadProducts();
  }, [org]);

  async function loadProducts() {
    setLoadingProducts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("products")
      .select("id, title, product_type, status, product_url")
      .eq("org_id", org!.id)
      .order("title");
    const rows = (data as ProductRow[]) || [];
    setProducts(rows);
    // Seed edit state for each product.
    const initial: EditState = {};
    for (const p of rows) {
      initial[p.id] = {
        title: p.title,
        product_url: p.product_url || "",
        saving: false,
        saved: false,
        error: null,
      };
    }
    setEditState(initial);
    setLoadingProducts(false);
  }

  function patch(id: string, field: "title" | "product_url", value: string) {
    setEditState((s) => ({
      ...s,
      [id]: { ...s[id], [field]: value, saved: false, error: null },
    }));
  }

  async function saveProduct(id: string) {
    const state = editState[id];
    if (!state) return;
    setEditState((s) => ({ ...s, [id]: { ...s[id], saving: true, error: null } }));
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: state.title.trim(),
          product_url: state.product_url.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setEditState((s) => ({ ...s, [id]: { ...s[id], saving: false, saved: true } }));
      setTimeout(() => {
        setEditState((s) => ({ ...s, [id]: { ...s[id], saved: false } }));
      }, 2000);
      // Keep local list in sync.
      setProducts((ps) =>
        ps.map((p) =>
          p.id === id
            ? { ...p, title: state.title.trim(), product_url: state.product_url.trim() || null }
            : p
        )
      );
    } catch (e) {
      setEditState((s) => ({
        ...s,
        [id]: {
          ...s[id],
          saving: false,
          error: e instanceof Error ? e.message : "Save failed",
        },
      }));
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product? This can't be undone.")) return;
    const supabase = createClient();
    await supabase.from("products").delete().eq("id", id);
    setProducts((ps) => ps.filter((p) => p.id !== id));
    setEditState((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  async function addProduct() {
    if (!newTitle.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          product_url: newUrl.trim() || null,
          status: "active",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setNewTitle("");
      setNewUrl("");
      setShowAdd(false);
      await loadProducts();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add product");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <div className="h-96 bg-muted animate-pulse rounded-xl" />;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your organisation settings.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              pathname === tab.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-muted-foreground" />
              Products &amp; destination URLs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set the exact destination URL per product. The pipeline uses this URL for pins —
              takes priority over auto-derived Shopify handles.
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add product
          </button>
        </div>

        {/* Add product form */}
        {showAdd && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="text-sm font-medium">New product</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Product name</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Foundation"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Destination URL</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com/products/…"
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            {addError && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {addError}
              </p>
            )}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setShowAdd(false); setNewTitle(""); setNewUrl(""); setAddError(null); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addProduct}
                disabled={adding || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {adding && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {adding ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        )}

        {/* Product list */}
        {loadingProducts ? (
          <div className="h-40 bg-muted animate-pulse rounded-xl" />
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No products yet. Add a product above or sync from Shopify.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {products.map((product) => {
              const s = editState[product.id];
              if (!s) return null;
              const isDirty =
                s.title !== product.title ||
                s.product_url !== (product.product_url || "");
              return (
                <div key={product.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                  {/* Product name */}
                  <div className="flex-1 min-w-[140px]">
                    <div className="text-[11px] text-muted-foreground mb-0.5">Product name</div>
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => patch(product.id, "title", e.target.value)}
                      className="w-full px-2 py-1 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>

                  {/* Destination URL */}
                  <div className="flex-[2] min-w-[240px]">
                    <div className="text-[11px] text-muted-foreground mb-0.5">
                      Destination URL
                      {!s.product_url && (
                        <span className="ml-1.5 text-amber-500">
                          (no URL set — will auto-derive from product name)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        value={s.product_url}
                        onChange={(e) => patch(product.id, "product_url", e.target.value)}
                        placeholder="https://…"
                        className="flex-1 px-2 py-1 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/40"
                      />
                      {s.product_url && (
                        <a
                          href={s.product_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open URL"
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4">
                    <button
                      onClick={() => saveProduct(product.id)}
                      disabled={s.saving || !isDirty}
                      className={cn(
                        "inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                        s.saved
                          ? "bg-green-500/10 text-green-600 border border-green-500/20"
                          : isDirty
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-muted text-muted-foreground cursor-not-allowed",
                        s.saving && "opacity-70"
                      )}
                    >
                      {s.saving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : s.saved ? (
                        <Check className="w-3 h-3" />
                      ) : null}
                      {s.saved ? "Saved" : "Save"}
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      title="Delete product"
                      className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {s.error && (
                    <p className="w-full text-xs text-red-500 flex items-center gap-1 -mt-1">
                      <AlertCircle className="w-3 h-3" />
                      {s.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
