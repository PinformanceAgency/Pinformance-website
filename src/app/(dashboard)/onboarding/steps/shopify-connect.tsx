"use client";

import { useState } from "react";
import {
  ShoppingBag,
  Upload,
  Check,
  Loader2,
  ArrowRight,
  ChevronRight,
  Package,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export function ShopifyConnectStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"shopify" | "csv">("shopify");
  const [domain, setDomain] = useState(org.shopify_domain || "");
  const [accessToken, setAccessToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(!!org.shopify_domain);
  const [syncing, setSyncing] = useState(false);
  const [syncedProducts, setSyncedProducts] = useState(0);
  const [error, setError] = useState("");

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setConnecting(true);

    try {
      const res = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          access_token: accessToken,
          org_id: org.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to connect");
      }

      setConnected(true);
      setSyncing(true);

      // Trigger product sync
      const syncRes = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });

      if (syncRes.ok) {
        const data = await syncRes.json();
        setSyncedProducts(data.count || 0);
      }
      setSyncing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setConnecting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("org_id", org.id);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setMode("shopify")}
          className={cn(
            "relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 text-sm font-medium transition-all duration-200",
            mode === "shopify"
              ? "border-[#96BF47] bg-[#96BF47]/5 shadow-sm"
              : "border-border hover:border-[#96BF47]/40 hover:bg-muted/30"
          )}
        >
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
              mode === "shopify"
                ? "bg-[#96BF47]/15 text-[#96BF47]"
                : "bg-muted text-muted-foreground"
            )}
          >
            <ShoppingBag className="w-6 h-6" />
          </div>
          <span>Shopify Integration</span>
          <span className="text-xs text-muted-foreground font-normal">
            Recommended
          </span>
        </button>
        <button
          onClick={() => setMode("csv")}
          className={cn(
            "relative flex flex-col items-center gap-3 p-5 rounded-xl border-2 text-sm font-medium transition-all duration-200",
            mode === "csv"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
          )}
        >
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
              mode === "csv"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Upload className="w-6 h-6" />
          </div>
          <span>CSV Upload</span>
          <span className="text-xs text-muted-foreground font-normal">
            Manual import
          </span>
        </button>
      </div>

      {/* Connected State */}
      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Products connected successfully
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                {syncing
                  ? "Syncing products in the background..."
                  : syncedProducts > 0
                    ? `${syncedProducts} products synced`
                    : "Products are being synced in the background"}
              </p>
            </div>
            {syncing && (
              <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin ml-auto" />
            )}
          </div>

          {syncing && (
            <div className="bg-muted/30 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Sync Progress</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Importing products, images, and variants...
              </p>
            </div>
          )}
        </div>
      ) : mode === "shopify" ? (
        <div className="space-y-5">
          {/* Setup Instructions */}
          <div className="bg-muted/30 border border-border rounded-xl p-5">
            <h4 className="text-sm font-semibold mb-3">
              How to get your Shopify API credentials
            </h4>
            <div className="space-y-3">
              {[
                "Go to your Shopify Admin > Settings > Apps and sales channels",
                'Click "Develop apps" > "Create an app"',
                "Configure Admin API scopes: read_products, read_product_listings",
                "Install the app and copy the Admin API access token",
              ].map((instruction, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    {instruction}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Shopify Store Domain
              </label>
              <div className="relative">
                <ShoppingBag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#96BF47]/20 focus:border-[#96BF47] transition-all"
                  placeholder="yourstore.myshopify.com"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Admin API Access Token
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#96BF47]/20 focus:border-[#96BF47] transition-all font-mono"
                placeholder="shpat_xxxxx"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={connecting}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
                "bg-[#96BF47] text-white hover:bg-[#7EA33C]",
                "disabled:opacity-50 shadow-sm hover:shadow-md"
              )}
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting to Shopify...
                </>
              ) : (
                <>
                  Connect Shopify Store
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-primary/40 transition-all duration-200 group cursor-pointer"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                const fakeEvent = {
                  target: { files: e.dataTransfer.files },
                } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleCSVUpload(fakeEvent);
              }
            }}
          >
            <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4 group-hover:text-primary transition-colors" />
            <p className="text-sm font-medium mb-1">
              Drop your CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              Required columns: title, description, product_type, tags,
              image_url, price, url
            </p>
            <label className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer hover:bg-primary/90 transition-colors shadow-sm">
              Choose File
              <ChevronRight className="w-4 h-4" />
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
            </label>
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!connected}
          className={cn(
            "px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "shadow-sm hover:shadow-md"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
