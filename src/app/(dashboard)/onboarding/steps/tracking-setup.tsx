"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, BarChart3, Rocket, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const TRACKING_PARTNERS = [
  { name: "Wetracked", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { name: "Elevar", color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300" },
  { name: "Triple Whale", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
  { name: "Other", color: "bg-muted text-muted-foreground" },
];

export function TrackingSetupStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [launching, setLaunching] = useState(false);

  async function handleLaunch() {
    setLaunching(true);
    await new Promise((r) => setTimeout(r, 600)); // brief visual feedback
    onNext();
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-muted/40 border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Connect your store with tracking</h4>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Proper conversion tracking lets us measure what's working and
              optimise your campaigns. Connect your store to your tracking
              partner to get started.
            </p>
          </div>
        </div>
      </div>

      {/* Supported partners */}
      <div>
        <p className="text-sm font-medium mb-3">Supported tracking partners</p>
        <div className="flex flex-wrap gap-2">
          {TRACKING_PARTNERS.map((p) => (
            <span
              key={p.name}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-full",
                p.color
              )}
            >
              {p.name}
            </span>
          ))}
        </div>
      </div>

      {/* Important warning */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Important: Remove the Pinterest Shopify app first
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
            If you use a third-party tracking tool (Wetracked, Elevar, Triple Whale,
            etc.), make sure to{" "}
            <strong>delete the Pinterest app from your Shopify store</strong>{" "}
            before connecting. Keeping it installed causes overtracking and
            inaccurate data. We'll guide you through this if needed.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-sm font-medium">What to do</p>
        {[
          "Choose your tracking partner (Wetracked, Elevar, Triple Whale, or another).",
          "If using a third-party tracker: remove the Pinterest app from Shopify first.",
          "Connect your Shopify store to the tracking partner.",
          "Link your Pinterest ad account within the tracking tool.",
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
          </div>
        ))}
      </div>

      {/* Guidance note */}
      <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-4 py-3 border border-border">
        Not sure which tracking partner to use, or need help with the setup? Let us
        know and we'll provide guidance to make sure everything is configured correctly.
      </p>

      {/* Confirmation checkbox */}
      <label
        className={cn(
          "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
          confirmed
            ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/20"
            : "border-border hover:border-primary/30 bg-background"
        )}
      >
        <div className="pt-0.5 flex-shrink-0">
          <div
            className={cn(
              "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
              confirmed
                ? "bg-emerald-500 border-emerald-500"
                : "border-border"
            )}
          >
            {confirmed && (
              <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            )}
          </div>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={() => setConfirmed((v) => !v)}
            className="hidden"
          />
        </div>
        <div>
          <span className="text-sm font-medium block">
            I've connected my tracking partner (or contacted the team for help)
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            You can confirm and let the team finalise the integration.
          </span>
        </div>
      </label>

      {/* Launch button */}
      <div className="flex justify-end pt-1">
        <button
          onClick={handleLaunch}
          disabled={!confirmed || launching}
          className={cn(
            "flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
            "hover:shadow-lg hover:shadow-primary/20",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "shadow-sm"
          )}
        >
          {launching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finalising setup…
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              Complete Onboarding
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
