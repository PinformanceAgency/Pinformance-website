"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Save,
  Check,
  Plus,
  Trash2,
  Image as ImageIcon,
  Package,
  Upload,
  Camera,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
  { href: "/settings/overlays", label: "Statics & Overlays" },
];

interface ProductImage {
  url: string;
  alt: string;
  position: number;
}

interface ProductItem {
  id: string;
  title: string;
  product_type: string | null;
  images: ProductImage[];
  status: string;
}

interface ReferenceImage {
  product_id: string;
  image_urls: string[];
}

export default function ImagesPage() {
  const pathname = usePathname();
  const { org, loading } = useOrg();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [customScreenshots, setCustomScreenshots] = useState<string[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processingBg, setProcessingBg] = useState<string | null>(null);
  const [cleanProducts, setCleanProducts] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"custom" | "shopify">("custom");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!org) return;
    loadData();
  }, [org]);

  async function loadData() {
    const supabase = createClient();

    const { data: prods } = await supabase
      .from("products")
      .select("id, title, product_type, images, status")
      .eq("org_id", org!.id)
      .eq("status", "active")
      .order("title");

    if (prods) setProducts(prods as ProductItem[]);

    const res = await fetch("/api/brand-settings");
    if (res.ok) {
      const data = await res.json();
      if (data.reference_images?.length) {
        setReferenceImages(data.reference_images as ReferenceImage[]);
      }
      if (data.custom_screenshots?.length) {
        setCustomScreenshots(data.custom_screenshots as string[]);
      }
      if (data.clean_products?.length) {
        setCleanProducts(data.clean_products as string[]);
      }
    }
  }

  async function handleRemoveBackground(screenshotUrl: string) {
    setProcessingBg(screenshotUrl);
    try {
      const res = await fetch("/api/ai/remove-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: screenshotUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.clean_image_url) {
          setCleanProducts([...cleanProducts, data.clean_image_url]);
        }
      }
    } catch {
      // silently fail
    }
    setProcessingBg(null);
  }

  function removeCleanProduct(url: string) {
    setCleanProducts(cleanProducts.filter((u) => u !== url));
  }

  async function handleUploadScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !org) return;
    setUploading(true);

    const supabase = createClient();
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${org.id}/screenshots/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error } = await supabase.storage
        .from("pin-images")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (!error) {
        const { data: urlData } = supabase.storage
          .from("pin-images")
          .getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
    }

    setCustomScreenshots([...customScreenshots, ...newUrls]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeScreenshot(url: string) {
    setCustomScreenshots(customScreenshots.filter((u) => u !== url));
  }

  function isProductSelected(productId: string) {
    return referenceImages.some((ri) => ri.product_id === productId);
  }

  function getSelectedImageUrls(productId: string): string[] {
    return referenceImages.find((ri) => ri.product_id === productId)?.image_urls || [];
  }

  function addProduct(productId: string) {
    if (isProductSelected(productId)) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const firstImage = product.images[0]?.url;
    setReferenceImages([
      ...referenceImages,
      { product_id: productId, image_urls: firstImage ? [firstImage] : [] },
    ]);
    setShowProductPicker(false);
  }

  function removeProduct(productId: string) {
    setReferenceImages(referenceImages.filter((ri) => ri.product_id !== productId));
  }

  function toggleImage(productId: string, imageUrl: string) {
    setReferenceImages(
      referenceImages.map((ri) => {
        if (ri.product_id !== productId) return ri;
        const has = ri.image_urls.includes(imageUrl);
        return {
          ...ri,
          image_urls: has
            ? ri.image_urls.filter((u) => u !== imageUrl)
            : [...ri.image_urls, imageUrl],
        };
      })
    );
  }

  async function handleSave() {
    if (!org) return;
    setSaving(true);

    await fetch("/api/brand-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference_images: referenceImages,
        custom_screenshots: customScreenshots,
        clean_products: cleanProducts,
      }),
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const selectedProducts = products.filter((p) => isProductSelected(p.id));
  const unselectedProducts = products.filter((p) => !isProductSelected(p.id));

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Upload clean product screenshots or select Shopify images for pin creatives
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 text-center px-4 py-2 rounded-md text-sm font-medium transition-colors",
              pathname === tab.href
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Sub-tabs: Custom Screenshots vs Shopify */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("custom")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "custom"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Camera className="w-4 h-4" /> Product Screenshots
        </button>
        <button
          onClick={() => setActiveTab("shopify")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeTab === "shopify"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Package className="w-4 h-4" /> Shopify Images
        </button>
      </div>

      {/* ═══ CUSTOM SCREENSHOTS TAB ═══ */}
      {activeTab === "custom" && (
        <>
          {/* Step 1: Clean Product Images (used for AI generation) */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Clean Product Images
            </h2>
            <p className="text-sm text-muted-foreground">
              These are your product images with the background removed. The AI uses these
              to place your exact product into new lifestyle scenes for pin creatives.
            </p>
          </div>

          {cleanProducts.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {cleanProducts.map((url, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden border-2 border-green-500/30 bg-[#f0f0f0] aspect-square">
                  <img
                    src={url}
                    alt={`Clean product ${i + 1}`}
                    className="w-full h-full object-contain p-2"
                  />
                  <button
                    onClick={() => removeCleanProduct(url)}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-green-600/80 text-white text-xs py-1 px-2 text-center">
                    Clean product {i + 1}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-green-50 border border-dashed border-green-300 rounded-xl p-6 text-center">
              <p className="text-sm text-green-800">
                No clean product images yet. Upload screenshots below and click
                &quot;Remove Background&quot; to extract the product.
              </p>
            </div>
          )}

          {/* Step 2: Upload Screenshots */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <Camera className="w-4 h-4" /> Product Screenshots
            </h2>
            <p className="text-sm text-muted-foreground">
              Upload screenshots of your product. Then click &quot;Remove Background&quot;
              on each one to extract the product and create a clean image.
            </p>
          </div>

          {customScreenshots.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {customScreenshots.map((url, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden border-2 border-primary/20 aspect-square">
                  <img
                    src={url}
                    alt={`Product screenshot ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeScreenshot(url)}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {/* Remove Background button */}
                  <button
                    onClick={() => handleRemoveBackground(url)}
                    disabled={processingBg === url}
                    className="absolute bottom-0 left-0 right-0 bg-primary text-primary-foreground text-xs font-medium py-2 px-2 text-center hover:opacity-90 transition-opacity"
                  >
                    {processingBg === url ? "Removing background..." : "Remove Background"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-8 text-center">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No product screenshots uploaded yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload photos of your product, then remove the background to extract it.
              </p>
            </div>
          )}

          {/* Upload button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUploadScreenshot}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
            >
              {uploading ? (
                "Uploading..."
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Upload Product Screenshots
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {cleanProducts.length} clean product image{cleanProducts.length !== 1 ? "s" : ""} ·{" "}
            {customScreenshots.length} screenshot{customScreenshots.length !== 1 ? "s" : ""} uploaded
          </p>
        </>
      )}

      {/* ═══ SHOPIFY IMAGES TAB ═══ */}
      {activeTab === "shopify" && (
        <>
          <div className="bg-card border border-border rounded-xl p-6 space-y-2">
            <h2 className="font-semibold flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Shopify Product Images
            </h2>
            <p className="text-sm text-muted-foreground">
              Select images from your Shopify products as fallback reference.
              Custom screenshots (if uploaded) are always preferred over these.
            </p>
          </div>

          {/* Selected Reference Products */}
          {selectedProducts.length > 0 ? (
            <div className="space-y-4">
              {selectedProducts.map((product) => {
                const selectedUrls = getSelectedImageUrls(product.id);
                const images = (product.images || []).slice(0, 5);

                return (
                  <div
                    key={product.id}
                    className="bg-card border border-border rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{product.title}</span>
                        {product.product_type && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {product.product_type}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeProduct(product.id)}
                        className="p-1.5 rounded-lg hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Remove from reference images"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {images.length > 0 ? (
                      <div className="flex gap-2 flex-wrap">
                        {images.map((img, i) => {
                          const isSelected = selectedUrls.includes(img.url);
                          return (
                            <button
                              key={i}
                              onClick={() => toggleImage(product.id, img.url)}
                              className={cn(
                                "relative w-24 h-24 rounded-lg overflow-hidden border-2 transition-all",
                                isSelected
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-border hover:border-muted-foreground/50 opacity-50"
                              )}
                            >
                              <img
                                src={img.url}
                                alt={img.alt || product.title}
                                className="w-full h-full object-cover"
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No images available for this product
                      </p>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {selectedUrls.length} of {images.length} images selected
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-8 text-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No Shopify products selected. Add products below as fallback reference.
              </p>
            </div>
          )}

          {/* Add Product Button */}
          <div className="relative">
            <button
              onClick={() => setShowProductPicker(!showProductPicker)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Reference Product
            </button>

            {showProductPicker && unselectedProducts.length > 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border rounded-xl shadow-lg z-10 max-h-64 overflow-y-auto">
                {unselectedProducts.map((product) => {
                  const firstImg = product.images?.[0]?.url;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                    >
                      {firstImg ? (
                        <img
                          src={firstImg}
                          alt={product.title}
                          className="w-10 h-10 rounded-lg object-cover border border-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">{product.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.images?.length || 0} images
                          {product.product_type ? ` · ${product.product_type}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {showProductPicker && unselectedProducts.length === 0 && (
              <div className="absolute top-full mt-2 left-0 right-0 bg-card border border-border rounded-xl shadow-lg z-10 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  All active products are already added
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
        <span>
          {customScreenshots.length} screenshots ·{" "}
          {referenceImages.reduce((sum, ri) => sum + ri.image_urls.length, 0)} Shopify images
        </span>
        <span>{products.length} total products</span>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
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
            <Check className="w-4 h-4" /> Saved
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          <>
            <Save className="w-4 h-4" /> Save All Images
          </>
        )}
      </button>
    </div>
  );
}
