"use client";

import { useState } from "react";
import {
  Check,
  Loader2,
  ExternalLink,
  Sparkles,
  Image,
  Wand2,
  Palette,
  Zap,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const CAPABILITIES = [
  {
    icon: Image,
    title: "Product-style pin images",
    description: "Generate stunning product shots tailored to your brand aesthetic",
  },
  {
    icon: Palette,
    title: "Brand-consistent visuals",
    description: "AI learns your colors, style, and mood to maintain visual consistency",
  },
  {
    icon: Wand2,
    title: "Lifestyle & scene generation",
    description: "Create lifestyle imagery showing products in real-world contexts",
  },
  {
    icon: Zap,
    title: "Batch generation",
    description: "Generate hundreds of unique pins at scale, not one at a time",
  },
];

export function KreaConnectStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setValidating(true);

    try {
      const res = await fetch("/api/shopify/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: org.id,
          type: "krea",
          api_key: apiKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Invalid API key");
      }

      setConnected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* What is kie.ai */}
      <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/20 border border-violet-100 dark:border-violet-900/50 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-violet-900 dark:text-violet-200">
              What is kie.ai?
            </h4>
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-1 leading-relaxed">
              kie.ai is our AI image generation partner powered by NanoBanana 2.
              It creates high-quality, Pinterest-optimized visuals for your
              product pins — no design skills needed.
            </p>
          </div>
        </div>

        {/* Example generated images placeholder */}
        <div className="grid grid-cols-4 gap-2">
          {[
            "from-rose-200 to-pink-200 dark:from-rose-900 dark:to-pink-900",
            "from-amber-200 to-orange-200 dark:from-amber-900 dark:to-orange-900",
            "from-emerald-200 to-teal-200 dark:from-emerald-900 dark:to-teal-900",
            "from-sky-200 to-blue-200 dark:from-sky-900 dark:to-blue-900",
          ].map((gradient, i) => (
            <div
              key={i}
              className={cn(
                "aspect-[2/3] rounded-lg bg-gradient-to-br",
                gradient,
                "flex items-center justify-center"
              )}
            >
              <Image className="w-5 h-5 text-white/40" />
            </div>
          ))}
        </div>
        <p className="text-xs text-violet-600 dark:text-violet-400 mt-2 text-center">
          Example: AI-generated product pin styles
        </p>
      </div>

      {/* Capabilities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CAPABILITIES.map((cap) => (
          <div
            key={cap.title}
            className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-background"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <cap.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <h5 className="text-xs font-semibold">{cap.title}</h5>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {cap.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Connection */}
      {connected ? (
        <div className="flex items-center gap-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-5 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center flex-shrink-0">
            <Check className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              kie.ai API key validated and saved
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              AI image generation is now enabled for your account.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleValidate} className="space-y-4">
          <div className="bg-muted/30 border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Get your API key</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign up or log in at{" "}
              <a
                href="https://kie.ai/api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              >
                kie.ai/api-key
                <ExternalLink className="w-3 h-3" />
              </a>{" "}
              to generate your API key. The Starter plan includes 1,000
              generations per month.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
              placeholder="Enter your kie.ai API key"
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
            disabled={validating || !apiKey}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
              "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white",
              "hover:from-violet-700 hover:to-fuchsia-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "shadow-sm hover:shadow-md"
            )}
          >
            {validating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating API key...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Validate & Connect
              </>
            )}
          </button>
        </form>
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
