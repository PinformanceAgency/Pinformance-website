"use client";

import { useState } from "react";
import {
  ShoppingCart,
  CheckCircle2,
  Rocket,
  Info,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

const STEPS_LIST = [
  "Ensure your Pinterest tag and ad account are linked to your tracking partner.",
  "Go to your Shopify store and place a test order (you can refund it afterwards).",
  "Verify that the tracking partner registers a purchase event.",
  "Once confirmed, notify the team — your account is ready to launch.",
];

export function TestSaleStep({
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
            <ShoppingCart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Why a test sale is required</h4>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              For conversion campaigns, a test purchase allows your tracking
              partner to correctly register a Shopify purchase and properly link
              it to your Pinterest ad account. This step is only needed for{" "}
              <strong>new ad accounts</strong> that haven't run conversion
              campaigns before.
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div>
        <p className="text-sm font-medium mb-3">How to complete this step</p>
        <div className="space-y-3">
          {STEPS_LIST.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground leading-relaxed">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          Once the five onboarding steps are completed, your setup will be
          finalised and we'll proceed with launching your campaigns. You can
          refund the test order immediately after placing it.
        </p>
      </div>

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
            I've completed the test sale
          </span>
          <span className="text-xs text-muted-foreground mt-0.5 block">
            Or this step doesn't apply — my ad account has already run conversion campaigns.
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
