"use client";

import { useState, useEffect } from "react";
import {
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  Info,
} from "lucide-react";
import { useOrg } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/client";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: "connected" | "not_connected" | "expired" | "pending";
  statusMessage?: string;
  envKey?: string;
  connectAction?: () => void;
  docsUrl?: string;
}

export default function IntegrationsPage() {
  const { org } = useOrg();
  const [loading, setLoading] = useState(false);
  const [connectingPinterest, setConnectingPinterest] = useState(false);
  const [pinterestAppId, setPinterestAppId] = useState("");
  const [pinterestAppSecret, setPinterestAppSecret] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Anthropic per-org credentials
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [anthropicSaved, setAnthropicSaved] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [anthropicExpanded, setAnthropicExpanded] = useState(false);

  // Krea per-org credentials
  const [kreaApiKey, setKreaApiKey] = useState("");
  const [savingKrea, setSavingKrea] = useState(false);
  const [kreaSaved, setKreaSaved] = useState(false);
  const [showKreaKey, setShowKreaKey] = useState(false);
  const [kreaExpanded, setKreaExpanded] = useState(false);

  // Pinterest session cookie for organic conversion data
  const [pinterestSession, setPinterestSession] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [showSession, setShowSession] = useState(false);

  // Shopify per-org credentials
  const [shopifyDomain, setShopifyDomain] = useState("");
  const [shopifyAccessToken, setShopifyAccessToken] = useState("");
  const [savingShopify, setSavingShopify] = useState(false);
  const [showShopifyToken, setShowShopifyToken] = useState(false);

  // Load existing credentials when org data is available
  useEffect(() => {
    if (org?.pinterest_app_id) {
      setPinterestAppId(org.pinterest_app_id);
      setCredentialsSaved(true);
    }
  }, [org?.pinterest_app_id]);

  useEffect(() => {
    if (org?.anthropic_api_key_encrypted) {
      setAnthropicSaved(true);
    }
  }, [org?.anthropic_api_key_encrypted]);

  useEffect(() => {
    if (org?.krea_api_key_encrypted) {
      setKreaSaved(true);
    }
  }, [org?.krea_api_key_encrypted]);

  async function saveCredentials() {
    if (!pinterestAppId.trim() || !pinterestAppSecret.trim()) {
      alert("Please enter both App ID and App Secret.");
      return;
    }
    setSavingCredentials(true);
    try {
      const res = await fetch("/api/pinterest/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: pinterestAppId.trim(),
          app_secret: pinterestAppSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save credentials");
        return;
      }
      setCredentialsSaved(true);
      setPinterestAppSecret("");
      setShowSecret(false);
    } catch {
      alert("Failed to save credentials");
    } finally {
      setSavingCredentials(false);
    }
  }

  async function saveAnthropicKey() {
    if (!anthropicApiKey.trim()) {
      alert("Please enter an API key.");
      return;
    }
    setSavingAnthropic(true);
    try {
      const res = await fetch("/api/ai/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropic_api_key: anthropicApiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save credentials");
        return;
      }
      setAnthropicSaved(true);
      setAnthropicApiKey("");
      setShowAnthropicKey(false);
    } catch {
      alert("Failed to save credentials");
    } finally {
      setSavingAnthropic(false);
    }
  }

  async function saveKreaKey() {
    if (!kreaApiKey.trim()) {
      alert("Please enter an API key.");
      return;
    }
    setSavingKrea(true);
    try {
      const res = await fetch("/api/ai/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ krea_api_key: kreaApiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to save credentials");
        return;
      }
      setKreaSaved(true);
      setKreaApiKey("");
      setShowKreaKey(false);
    } catch {
      alert("Failed to save credentials");
    } finally {
      setSavingKrea(false);
    }
  }

  // Load Shopify domain
  useEffect(() => {
    if (org?.pinterest_session_encrypted) {
      setSessionSaved(true);
    }
  }, [org?.pinterest_session_encrypted]);

  async function savePinterestSession() {
    if (!pinterestSession.trim()) {
      setSessionError("Please paste your Pinterest session cookie.");
      return;
    }
    setSavingSession(true);
    setSessionError("");
    try {
      const res = await fetch("/api/pinterest/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_cookie: pinterestSession.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSessionError(data.error || "Failed to save session");
        return;
      }
      setSessionSaved(true);
      setPinterestSession("");
      setShowSession(false);
    } catch {
      setSessionError("Failed to save session cookie");
    } finally {
      setSavingSession(false);
    }
  }

  useEffect(() => {
    if (org?.shopify_domain) {
      setShopifyDomain(org.shopify_domain);
    }
  }, [org?.shopify_domain]);

  async function saveShopify() {
    if (!shopifyDomain.trim() || !shopifyAccessToken.trim()) {
      alert("Please enter both the Shopify domain and access token.");
      return;
    }
    setSavingShopify(true);
    try {
      const res = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: shopifyDomain.trim(),
          access_token: shopifyAccessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to connect Shopify");
        return;
      }
      setShopifyAccessToken("");
      setShowShopifyToken(false);
      alert("Shopify connected successfully! Products will sync shortly.");
      window.location.reload();
    } catch {
      alert("Failed to connect Shopify");
    } finally {
      setSavingShopify(false);
    }
  }

  const pinterestConnected = !!org?.pinterest_user_id;
  const pinterestExpired =
    org?.pinterest_token_expires_at &&
    new Date(org.pinterest_token_expires_at) < new Date();

  async function connectPinterest() {
    setConnectingPinterest(true);
    try {
      const res = await fetch("/api/pinterest/oauth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Failed to get Pinterest OAuth URL. Check that PINTEREST_APP_ID and PINTEREST_APP_SECRET are configured.");
      }
    } catch {
      alert("Failed to connect Pinterest");
    } finally {
      setConnectingPinterest(false);
    }
  }

  const integrations: Integration[] = [
    {
      id: "pinterest",
      name: "Pinterest API",
      description: "Post pins, manage boards, and pull analytics directly from Pinterest",
      icon: "📌",
      status: pinterestExpired
        ? "expired"
        : pinterestConnected
          ? "connected"
          : "pending",
      statusMessage: pinterestExpired
        ? "Token expired — reconnect to continue posting"
        : pinterestConnected
          ? `Connected as @${org?.pinterest_user_id}`
          : "Waiting for Pinterest API access approval (1-2 days)",
      connectAction: connectPinterest,
      docsUrl: "https://developers.pinterest.com/docs/getting-started/set-up-app/",
    },
    {
      id: "anthropic",
      name: "Anthropic (Claude AI)",
      description: "Powers keyword research, content generation, and performance optimization",
      icon: "🧠",
      status: anthropicSaved ? "connected" : "not_connected",
      envKey: "ANTHROPIC_API_KEY",
      statusMessage: anthropicSaved
        ? "Per-org API key saved"
        : "Add ANTHROPIC_API_KEY to Vercel environment variables, or set a per-org key below",
      docsUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "krea",
      name: "Krea AI (kie.ai)",
      description: "Generates Pinterest-optimized 2:3 images from AI prompts",
      icon: "🎨",
      status: kreaSaved ? "connected" : "not_connected",
      envKey: "KREA_API_KEY",
      statusMessage: kreaSaved
        ? "Per-org API key saved"
        : "Add KREA_API_KEY to Vercel environment variables, or set a per-org key below",
      docsUrl: "https://www.krea.ai/apps/image/flux",
    },
    {
      id: "shopify",
      name: "Shopify",
      description: "Syncs product catalog for automated pin content generation",
      icon: "🛍️",
      status: org?.shopify_domain ? "connected" : "not_connected",
      statusMessage: org?.shopify_domain
        ? `Connected: ${org.shopify_domain}`
        : "Add Shopify domain and access token",
      docsUrl: "https://shopify.dev/docs/apps/getting-started",
    },
    {
      id: "supabase",
      name: "Supabase",
      description: "Database, authentication, and file storage",
      icon: "⚡",
      status: "connected",
      statusMessage: "Connected and operational",
      docsUrl: "https://supabase.com/dashboard",
    },
    {
      id: "vercel",
      name: "Vercel",
      description: "Hosting, deployments, and cron jobs for auto-posting",
      icon: "▲",
      status: "connected",
      statusMessage: "Auto-deploys from GitHub",
      docsUrl: "https://vercel.com/dashboard",
    },
  ];

  const envVarsNeeded = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL", required: true },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anonymous key", required: true },
    { key: "SUPABASE_SERVICE_ROLE_KEY", description: "Supabase service role key (server-side)", required: true },
    { key: "NEXT_PUBLIC_APP_URL", description: "Your app URL (e.g. https://pinformance.vercel.app)", required: true },
    { key: "ANTHROPIC_API_KEY", description: "Claude AI API key for content generation", required: true },
    { key: "KREA_API_KEY", description: "Krea/kie.ai API key for image generation", required: true },
    { key: "ENCRYPTION_KEY", description: "32-byte hex key for encrypting API tokens", required: true },
    { key: "CRON_SECRET", description: "Secret for authenticating cron job requests", required: true },
    { key: "PINTEREST_APP_ID", description: "Pinterest app client ID", required: false },
    { key: "PINTEREST_APP_SECRET", description: "Pinterest app client secret", required: false },
    { key: "SHOPIFY_ACCESS_TOKEN", description: "Shopify Admin API access token", required: false },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Key className="w-6 h-6 text-primary" />
          Integrations
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect external services to power the automation pipeline
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-4">
        {integrations.map((integration) => (
          <div key={integration.id} className="glass-card rounded-xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">
                {integration.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{integration.name}</h3>
                  <StatusBadge status={integration.status} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {integration.description}
                </p>
                {integration.statusMessage && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    {integration.statusMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {integration.docsUrl && (
                  <a
                    href={integration.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5"
                  >
                    Docs
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {integration.connectAction && (
                  <button
                    onClick={integration.connectAction}
                    disabled={connectingPinterest && integration.id === "pinterest"}
                    className="px-4 py-2 text-sm bg-primary text-white rounded-lg glow-btn disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {connectingPinterest && integration.id === "pinterest" ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : integration.status === "connected" ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reconnect
                      </>
                    ) : (
                      "Connect"
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Per-org Pinterest credentials */}
            {integration.id === "pinterest" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Per-organization Pinterest API Credentials (optional)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">App ID</label>
                    <input
                      type="text"
                      value={pinterestAppId}
                      onChange={(e) => setPinterestAppId(e.target.value)}
                      placeholder="Pinterest App ID"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      App Secret {credentialsSaved && <span className="text-green-600">(saved)</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showSecret ? "text" : "password"}
                        value={pinterestAppSecret}
                        onChange={(e) => setPinterestAppSecret(e.target.value)}
                        placeholder={credentialsSaved ? "****  (enter new value to update)" : "Pinterest App Secret"}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={saveCredentials}
                    disabled={savingCredentials}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingCredentials ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Save Credentials
                      </>
                    )}
                  </button>
                  {credentialsSaved && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Credentials saved
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-2">
                  Override the global Pinterest API credentials for this organization. The secret is encrypted at rest. Leave empty to use the global environment variable credentials.
                </p>

                {/* Pinterest Session Cookie for Organic Conversion Data */}
                <div className="mt-5 pt-4 border-t border-border/30">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Conversion Insights Session
                    {sessionSaved && (
                      <span className="text-green-600 flex items-center gap-0.5 ml-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Active
                      </span>
                    )}
                    {org?.pinterest_session_expires_at && (
                      <span className="text-muted-foreground/60 ml-1">
                        — expires {new Date(org.pinterest_session_expires_at).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mb-3">
                    Required for accurate organic conversion data (revenue, page visits, add to cart, checkouts).
                    Pinterest does not expose this data through their public API.
                  </p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Pinterest Session Cookie
                    </label>
                    <div className="relative">
                      <input
                        type={showSession ? "text" : "password"}
                        value={pinterestSession}
                        onChange={(e) => { setPinterestSession(e.target.value); setSessionError(""); }}
                        placeholder={sessionSaved ? "**** (paste new value to refresh)" : "Paste _pinterest_sess cookie value here"}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSession(!showSession)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSession ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {sessionError && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      {sessionError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={savePinterestSession}
                      disabled={savingSession}
                      className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {savingSession ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Validating &amp; Saving...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Save Session
                        </>
                      )}
                    </button>
                  </div>
                  <details className="mt-3">
                    <summary className="text-[11px] text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
                      How to get your Pinterest session cookie
                    </summary>
                    <ol className="text-[11px] text-muted-foreground/60 mt-2 space-y-1 list-decimal list-inside">
                      <li>Open <a href="https://www.pinterest.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pinterest.com</a> in Chrome and log in</li>
                      <li>Press F12 (or right-click → Inspect) to open DevTools</li>
                      <li>Go to the <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>https://www.pinterest.com</strong></li>
                      <li>Find the cookie named <code className="bg-muted px-1 rounded">_pinterest_sess</code></li>
                      <li>Double-click its <strong>Value</strong> column, copy the full value</li>
                      <li>Paste it above and click Save Session</li>
                    </ol>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">
                      The session is valid for ~30 days. You will be notified when it needs to be refreshed.
                    </p>
                  </details>
                </div>
              </div>
            )}

            {/* Per-org Anthropic credentials */}
            {integration.id === "anthropic" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <button
                  onClick={() => setAnthropicExpanded(!anthropicExpanded)}
                  className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5 hover:text-foreground transition"
                >
                  <Key className="w-3.5 h-3.5" />
                  Per-organization API Key (optional)
                  <span className="ml-1">{anthropicExpanded ? "\u25B2" : "\u25BC"}</span>
                </button>
                {anthropicExpanded && (
                  <div className="mt-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Anthropic API Key {anthropicSaved && <span className="text-green-600">(saved)</span>}
                      </label>
                      <div className="relative max-w-md">
                        <input
                          type={showAnthropicKey ? "text" : "password"}
                          value={anthropicApiKey}
                          onChange={(e) => setAnthropicApiKey(e.target.value)}
                          placeholder={anthropicSaved ? "****  (enter new value to update)" : "sk-ant-..."}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={saveAnthropicKey}
                        disabled={savingAnthropic}
                        className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {savingAnthropic ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Save API Key
                          </>
                        )}
                      </button>
                      {anthropicSaved && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Key saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">
                      Override the global Anthropic API key for this organization. The key is encrypted at rest. Leave empty to use the global environment variable.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Per-org Krea credentials */}
            {/* Shopify credentials */}
            {integration.id === "shopify" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5" />
                  Shopify Store Connection
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Store Domain</label>
                    <input
                      type="text"
                      value={shopifyDomain}
                      onChange={(e) => setShopifyDomain(e.target.value)}
                      placeholder="your-store.myshopify.com"
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Admin API Access Token {org?.shopify_domain && <span className="text-green-600">(connected)</span>}
                    </label>
                    <div className="relative">
                      <input
                        type={showShopifyToken ? "text" : "password"}
                        value={shopifyAccessToken}
                        onChange={(e) => setShopifyAccessToken(e.target.value)}
                        placeholder={org?.shopify_domain ? "**** (enter new value to update)" : "shpat_..."}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowShopifyToken(!showShopifyToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showShopifyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={saveShopify}
                    disabled={savingShopify}
                    className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingShopify ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Connect Shopify
                      </>
                    )}
                  </button>
                  {org?.shopify_domain && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Connected: {org.shopify_domain}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-2">
                  Get your access token from Shopify Admin → Settings → Apps → Develop apps → Your app → API credentials. The token is encrypted at rest.
                </p>
              </div>
            )}

            {integration.id === "krea" && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <button
                  onClick={() => setKreaExpanded(!kreaExpanded)}
                  className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5 hover:text-foreground transition"
                >
                  <Key className="w-3.5 h-3.5" />
                  Per-organization API Key (optional)
                  <span className="ml-1">{kreaExpanded ? "\u25B2" : "\u25BC"}</span>
                </button>
                {kreaExpanded && (
                  <div className="mt-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Krea API Key {kreaSaved && <span className="text-green-600">(saved)</span>}
                      </label>
                      <div className="relative max-w-md">
                        <input
                          type={showKreaKey ? "text" : "password"}
                          value={kreaApiKey}
                          onChange={(e) => setKreaApiKey(e.target.value)}
                          placeholder={kreaSaved ? "****  (enter new value to update)" : "Krea API Key"}
                          className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKreaKey(!showKreaKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showKreaKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={saveKreaKey}
                        disabled={savingKrea}
                        className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {savingKrea ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Save API Key
                          </>
                        )}
                      </button>
                      {kreaSaved && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Key saved
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-2">
                      Override the global Krea API key for this organization. The key is encrypted at rest. Leave empty to use the global environment variable.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Environment Variables Guide */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Environment Variables
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          These must be set in{" "}
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Vercel → Settings → Environment Variables
          </a>{" "}
          for the pipeline to work.
        </p>

        <div className="glass-card rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-medium">Variable</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium w-24">Required</th>
              </tr>
            </thead>
            <tbody>
              {envVarsNeeded.map((env) => (
                <tr key={env.key} className="border-b border-border/50">
                  <td className="px-4 py-3">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                      {env.key}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{env.description}</td>
                  <td className="px-4 py-3">
                    {env.required ? (
                      <span className="text-xs font-medium text-primary">Required</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Optional</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Quick Setup Checklist
        </h3>
        <div className="space-y-3 text-sm">
          <SetupStep
            done={true}
            text="Supabase database connected"
          />
          <SetupStep
            done={true}
            text="Vercel hosting configured"
          />
          <SetupStep
            done={false}
            text={
              <>
                Get Anthropic API key from{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  console.anthropic.com
                </a>{" "}
                → add as <code className="bg-muted px-1 rounded">ANTHROPIC_API_KEY</code> in Vercel
              </>
            }
          />
          <SetupStep
            done={false}
            text={
              <>
                Get Krea API key from{" "}
                <a href="https://www.krea.ai" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  krea.ai
                </a>{" "}
                → add as <code className="bg-muted px-1 rounded">KREA_API_KEY</code> in Vercel
              </>
            }
          />
          <SetupStep
            done={false}
            text={
              <>
                Generate encryption key: <code className="bg-muted px-1 rounded">openssl rand -hex 32</code> → add as{" "}
                <code className="bg-muted px-1 rounded">ENCRYPTION_KEY</code> in Vercel
              </>
            }
          />
          <SetupStep
            done={false}
            text={
              <>
                Generate cron secret: <code className="bg-muted px-1 rounded">openssl rand -hex 16</code> → add as{" "}
                <code className="bg-muted px-1 rounded">CRON_SECRET</code> in Vercel
              </>
            }
          />
          <SetupStep
            done={pinterestConnected}
            text="Pinterest API access approved → connect OAuth"
          />
          <SetupStep
            done={!!org?.shopify_domain}
            text="Shopify store connected (optional — can also add products manually)"
          />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Integration["status"] }) {
  switch (status) {
    case "connected":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">
          <CheckCircle2 className="w-3 h-3" />
          Connected
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
          <XCircle className="w-3 h-3" />
          Expired
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
          <Loader2 className="w-3 h-3" />
          Pending
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
          Not Connected
        </span>
      );
  }
}

function SetupStep({ done, text }: { done: boolean; text: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 mt-0.5 flex-shrink-0" />
      )}
      <span className={done ? "text-muted-foreground line-through" : ""}>{text}</span>
    </div>
  );
}
