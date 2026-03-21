"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Check,
  ShoppingBag,
  Image,
  Users,
  Loader2,
  Sparkles,
  Pin,
  Building2,
  Palette,
  Rocket,
  ArrowRight,
  Clock,
  Zap,
  BarChart3,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export function ReviewStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [productCount, setProductCount] = useState(0);
  const [competitorCount, setCompetitorCount] = useState(0);
  const [assetCount, setAssetCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressStep, setProgressStep] = useState(0);

  useEffect(() => {
    async function loadCounts() {
      const supabase = createClient();

      const [products, competitors, assets] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact" })
          .eq("org_id", org.id),
        supabase
          .from("competitors")
          .select("id", { count: "exact" })
          .eq("org_id", org.id),
        supabase
          .from("brand_documents")
          .select("id", { count: "exact" })
          .eq("org_id", org.id),
      ]);

      setProductCount(products.count || 0);
      setCompetitorCount(competitors.count || 0);
      setAssetCount(assets.count || 0);
    }

    loadCounts();
  }, [org.id]);

  async function handleLaunch() {
    setGenerating(true);
    setProgressStep(1);
    setProgress("Analyzing your brand profile and competitors...");

    try {
      const res = await fetch("/api/ai/generate-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });

      if (!res.ok) throw new Error("Strategy generation failed");

      setProgressStep(2);
      setProgress("Building keyword strategy and board plan...");
      await new Promise((r) => setTimeout(r, 2000));

      setProgressStep(3);
      setProgress("Generating your first week of pin content...");
      await new Promise((r) => setTimeout(r, 1000));

      setProgressStep(4);
      setProgress("Finalizing your Pinterest strategy...");
      await new Promise((r) => setTimeout(r, 500));

      onNext();
    } catch (err) {
      setProgress(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setGenerating(false);
    }
  }

  const summaryCards = [
    {
      icon: Building2,
      label: "Brand Profile",
      value: "Configured",
      status: true,
      color: "text-blue-500",
      bgColor: "bg-blue-50 dark:bg-blue-950/30",
      borderColor: "border-blue-100 dark:border-blue-900",
    },
    {
      icon: ShoppingBag,
      label: "Products",
      value: productCount > 0 ? `${productCount} imported` : "Not connected",
      status: productCount > 0,
      color: "text-emerald-500",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
      borderColor: "border-emerald-100 dark:border-emerald-900",
    },
    {
      icon: Palette,
      label: "Brand Assets",
      value: assetCount > 0 ? `${assetCount} uploaded` : "Skipped",
      status: assetCount > 0,
      color: "text-violet-500",
      bgColor: "bg-violet-50 dark:bg-violet-950/30",
      borderColor: "border-violet-100 dark:border-violet-900",
    },
    {
      icon: Users,
      label: "Competitors",
      value:
        competitorCount > 0 ? `${competitorCount} tracked` : "Skipped",
      status: competitorCount > 0,
      color: "text-purple-500",
      bgColor: "bg-purple-50 dark:bg-purple-950/30",
      borderColor: "border-purple-100 dark:border-purple-900",
    },
    {
      icon: Pin,
      label: "Pinterest",
      value: org.pinterest_user_id ? "Connected" : "Not connected",
      status: !!org.pinterest_user_id,
      color: "text-red-500",
      bgColor: "bg-red-50 dark:bg-red-950/30",
      borderColor: "border-red-100 dark:border-red-900",
    },
    {
      icon: Sparkles,
      label: "AI Generation",
      value: "Ready",
      status: true,
      color: "text-amber-500",
      bgColor: "bg-amber-50 dark:bg-amber-950/30",
      borderColor: "border-amber-100 dark:border-amber-900",
    },
  ];

  const PROGRESS_STEPS = [
    "Analyzing brand & competitors",
    "Building keyword strategy",
    "Generating content plan",
    "Finalizing strategy",
  ];

  return (
    <div className="space-y-6">
      {/* Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className={cn(
              "rounded-xl p-4 border transition-all duration-200",
              card.bgColor,
              card.borderColor
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={cn("w-4 h-4", card.color)} />
              {card.status && (
                <Check className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
              )}
            </div>
            <div className="text-xs font-semibold">{card.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* What Happens Next */}
      {!generating && (
        <div className="bg-muted/30 border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold mb-3">What happens when you launch</h4>
          <div className="space-y-3">
            {[
              {
                icon: Zap,
                title: "AI Strategy Generation",
                desc: "We analyze your brand, products, and competitors to create a tailored Pinterest strategy.",
              },
              {
                icon: CalendarDays,
                title: "Content Calendar",
                desc: "A 30-day content calendar is generated with optimized posting times.",
              },
              {
                icon: BarChart3,
                title: "Board Structure",
                desc: "We create a keyword-optimized board plan to maximize Pinterest SEO.",
              },
              {
                icon: Sparkles,
                title: "First Batch of Pins",
                desc: "Your first week of pins will be generated and queued for review.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h5 className="text-sm font-medium">{item.title}</h5>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generation Progress */}
      {generating && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
            </div>
            <div>
              <p className="text-sm font-semibold">Generating your strategy</p>
              <p className="text-xs text-muted-foreground">{progress}</p>
            </div>
          </div>

          <div className="space-y-2">
            {PROGRESS_STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300",
                    i + 1 < progressStep &&
                      "bg-emerald-500 text-white",
                    i + 1 === progressStep &&
                      "bg-primary text-primary-foreground",
                    i + 1 > progressStep && "bg-muted text-muted-foreground"
                  )}
                >
                  {i + 1 < progressStep ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : i + 1 === progressStep ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <span className="text-xs">{i + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-sm transition-colors",
                    i + 1 <= progressStep
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>

          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${(progressStep / PROGRESS_STEPS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Estimated time */}
      {!generating && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Strategy generation takes approximately 30-60 seconds
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleLaunch}
          disabled={generating}
          className={cn(
            "relative px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
            "hover:shadow-lg hover:shadow-primary/20",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "flex items-center gap-2"
          )}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating Strategy...
            </>
          ) : (
            <>
              <Rocket className="w-4 h-4" />
              Generate Strategy & Launch
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
