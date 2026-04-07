"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
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
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!org) return;
    loadData();
  }, [org]);

  async function loadData() {
    const supabase = createClient();

    // Load all active products with images
    const { data: prods } = await supabase
      .from("products")
      .select("id, title, product_type, images, status")
      .eq("org_id", org!.id)
      .eq("status", "active")
      .order("title");

    if (prods) setProducts(prods as ProductItem[]);

    // Load saved reference images from brand profile
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("structured_data")
      .eq("org_id", org!.id)
      .single();

    const sd = profile?.structured_data as Record<string, unknown> | null;
    if (sd?.reference_images) {
      setReferenceImages(sd.reference_images as ReferenceImage[]);
    }
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
    // Default: select first image
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

    const supabase = createClient();

    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("structured_data")
      .eq("org_id", org.id)
      .single();

    const currentData = (profile?.structured_data as Record<string, unknown>) || {};

    await supabase
      .from("brand_profiles")
      .update({
        structured_data: { ...currentData, reference_images: referenceImages },
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", org.id);

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
          Select which product images are used as reference for pin creatives
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

      {/* Info */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-2">
        <h2 className="font-semibold flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Reference Images
        </h2>
        <p className="text-sm text-muted-foreground">
          Select products and their images to use as reference for pin creative generation.
          These images will be used instead of the default first product image.
          Each product shows up to 5 images from Shopify.
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
            No reference products selected yet. Add products below to choose which images to use for pin creatives.
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

        {/* Product Picker Dropdown */}
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

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
        <span>
          {selectedProducts.length} products selected ·{" "}
          {referenceImages.reduce((sum, ri) => sum + ri.image_urls.length, 0)} images active
        </span>
        <span>{products.length} total products from Shopify</span>
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
            <Save className="w-4 h-4" /> Save Reference Images
          </>
        )}
      </button>
    </div>
  );
}
