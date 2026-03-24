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
      status: "not_connected",
      envKey: "ANTHROPIC_API_KEY",
      statusMessage: "Add ANTHROPIC_API_KEY to Vercel environment variables",
      docsUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "krea",
      name: "Krea AI (kie.ai)",
      description: "Generates Pinterest-optimized 2:3 images from AI prompts",
      icon: "🎨",
      status: "not_connected",
      envKey: "KREA_API_KEY",
      statusMessage: "Add KREA_API_KEY to Vercel environment variables",
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
