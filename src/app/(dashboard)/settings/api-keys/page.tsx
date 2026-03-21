"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Key,
  Check,
  AlertCircle,
  RefreshCw,
  Unlink,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
];

interface ConnectionStatus {
  pinterest: { connected: boolean; expiresAt: string | null };
  krea: { connected: boolean };
  shopify: { connected: boolean; domain: string | null };
}

export default function ApiKeysPage() {
  const pathname = usePathname();
  const { org, loading } = useOrg();
  const [status, setStatus] = useState<ConnectionStatus>({
    pinterest: { connected: false, expiresAt: null },
    krea: { connected: false },
    shopify: { connected: false, domain: null },
  });
  const [kreaKey, setKreaKey] = useState("");
  const [updatingKrea, setUpdatingKrea] = useState(false);
  const [showKreaInput, setShowKreaInput] = useState(false);

  useEffect(() => {
    if (!org) return;

    async function load() {
      const supabase = createClient();

      // Check Pinterest connection
      const pinterestConnected = !!org!.pinterest_user_id;

      // Check kie.ai key — onboarding step 6+ means krea was connected
      const kreaConnected = org!.onboarding_step >= 6;

      // Check Shopify
      const shopifyConnected = !!org!.shopify_domain;

      setStatus({
        pinterest: {
          connected: pinterestConnected,
          expiresAt: org!.pinterest_token_expires_at,
        },
        krea: { connected: kreaConnected },
        shopify: {
          connected: shopifyConnected,
          domain: org!.shopify_domain,
        },
      });
    }

    load();
  }, [org]);

  async function handleDisconnectPinterest() {
    if (!org || !confirm("Disconnect your Pinterest account?")) return;
    const supabase = createClient();
    await supabase
      .from("organizations")
      .update({
        pinterest_user_id: null,
        pinterest_access_token_encrypted: null,
        pinterest_refresh_token_encrypted: null,
        pinterest_token_expires_at: null,
      })
      .eq("id", org.id);
    setStatus({
      ...status,
      pinterest: { connected: false, expiresAt: null },
    });
  }

  async function handleUpdateKrea() {
    if (!org || !kreaKey.trim()) return;
    setUpdatingKrea(true);

    await fetch("/api/shopify/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "krea", api_key: kreaKey.trim() }),
    });

    setKreaKey("");
    setShowKreaInput(false);
    setUpdatingKrea(false);
    setStatus({ ...status, krea: { connected: true } });
  }

  async function handleReconnectShopify() {
    window.location.href = "/api/shopify/auth";
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your organization and posting preferences
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

      <div>
        <h2 className="text-lg font-semibold">API Keys & Connections</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your third-party integrations
        </p>
      </div>

      {/* Pinterest */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">Pinterest</h3>
              <p className="text-xs text-muted-foreground">
                {status.pinterest.connected
                  ? `Connected ${
                      status.pinterest.expiresAt
                        ? `· Expires ${new Date(
                            status.pinterest.expiresAt
                          ).toLocaleDateString()}`
                        : ""
                    }`
                  : "Not connected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                status.pinterest.connected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}
            >
              {status.pinterest.connected ? (
                <>
                  <Check className="w-3 h-3" /> Connected
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3" /> Not connected
                </>
              )}
            </span>
            {status.pinterest.connected && (
              <button
                onClick={handleDisconnectPinterest}
                className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80 text-red-600"
              >
                <Unlink className="w-3 h-3" /> Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* kie.ai */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-medium">kie.ai</h3>
              <p className="text-xs text-muted-foreground">
                {status.krea.connected
                  ? "API key configured · ****••••••••"
                  : "Not configured"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                status.krea.connected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}
            >
              {status.krea.connected ? (
                <>
                  <Check className="w-3 h-3" /> Connected
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3" /> Not connected
                </>
              )}
            </span>
            <button
              onClick={() => setShowKreaInput(!showKreaInput)}
              className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80"
            >
              <RefreshCw className="w-3 h-3" /> Update
            </button>
          </div>
        </div>

        {showKreaInput && (
          <div className="flex gap-2">
            <input
              type="password"
              value={kreaKey}
              onChange={(e) => setKreaKey(e.target.value)}
              placeholder="Enter your kie.ai API key"
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={handleUpdateKrea}
              disabled={updatingKrea || !kreaKey.trim()}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-3 h-3" />
              {updatingKrea ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Shopify */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <Key className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium">Shopify</h3>
              <p className="text-xs text-muted-foreground">
                {status.shopify.connected
                  ? `Connected to ${status.shopify.domain}`
                  : "Not connected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1",
                status.shopify.connected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              )}
            >
              {status.shopify.connected ? (
                <>
                  <Check className="w-3 h-3" /> Connected
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3" /> Not connected
                </>
              )}
            </span>
            <button
              onClick={handleReconnectShopify}
              className="text-xs bg-muted px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-muted/80"
            >
              <RefreshCw className="w-3 h-3" /> Reconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
