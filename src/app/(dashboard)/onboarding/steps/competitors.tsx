"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  X,
  Loader2,
  Users,
  TrendingUp,
  Search,
  BarChart3,
  Eye,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Organization } from "@/lib/types";

export function CompetitorsStep({
  org,
  onNext,
  onBack,
}: {
  org: Organization;
  onNext: () => void;
  onBack: () => void;
}) {
  const [competitors, setCompetitors] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  function addField() {
    if (competitors.length < 5) setCompetitors([...competitors, ""]);
  }

  function removeField(index: number) {
    setCompetitors(competitors.filter((_, i) => i !== index));
  }

  function updateField(index: number, value: string) {
    const updated = [...competitors];
    updated[index] = value;
    setCompetitors(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validCompetitors = competitors.filter((c) => c.trim());
    if (validCompetitors.length === 0) {
      onNext();
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const inserts = validCompetitors.map((username) => ({
      org_id: org.id,
      pinterest_username: username
        .replace(/^@/, "")
        .replace(/.*pinterest\.com\//, "")
        .replace(/\/$/, ""),
      scrape_status: "pending" as const,
    }));

    await supabase.from("competitors").insert(inserts);

    // Trigger scraping
    await fetch("/api/competitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: org.id }),
    });

    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Why Competitors Matter */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/20 border border-purple-100 dark:border-purple-900/50 rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200">
              Why competitor analysis matters
            </h4>
            <p className="text-xs text-purple-700 dark:text-purple-400 mt-1 leading-relaxed">
              We analyze their top-performing pins, posting frequency, keyword
              strategy, and content style to find gaps and opportunities for your
              brand.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Search, label: "Keyword gaps" },
            { icon: BarChart3, label: "Content strategy" },
            { icon: TrendingUp, label: "Growth tactics" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-1.5 p-3 bg-white/60 dark:bg-white/5 rounded-lg"
            >
              <item.icon className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-medium text-purple-800 dark:text-purple-300 text-center">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* What we&apos;ll analyze */}
      <div className="bg-muted/30 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Eye className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">What we&apos;ll analyze</h4>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            "Board structure & categories",
            "Top-performing pin designs",
            "Posting frequency & timing",
            "Keyword & hashtag strategy",
            "Content mix (static/video/carousel)",
            "Engagement patterns",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 text-xs text-muted-foreground py-1"
            >
              <div className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Competitor inputs */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Pinterest competitor profiles
        </label>
        {competitors.map((value, index) => (
          <div key={index} className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              value={value}
              onChange={(e) => updateField(index, e.target.value)}
              className="flex-1 px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder={
                index === 0
                  ? "e.g. pinterest.com/competitor or @competitor"
                  : "Pinterest username or profile URL"
              }
            />
            {competitors.length > 1 && (
              <button
                type="button"
                onClick={() => removeField(index)}
                className="p-2 hover:bg-muted rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        ))}
      </div>

      {competitors.length < 5 && (
        <button
          type="button"
          onClick={addField}
          className="flex items-center gap-2 text-sm text-primary font-medium hover:text-primary/80 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add another competitor
          <span className="text-xs text-muted-foreground font-normal">
            ({competitors.length}/5)
          </span>
        </button>
      )}

      {/* Suggested Competitors (placeholder) */}
      <div className="bg-muted/20 border border-dashed border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-medium text-muted-foreground">
            Suggested competitors
          </h4>
        </div>
        <p className="text-xs text-muted-foreground">
          We&apos;ll suggest relevant competitors based on your industry and
          products after you complete onboarding.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "px-8 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50",
            "shadow-sm hover:shadow-md",
            "flex items-center gap-2"
          )}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {competitors.some((c) => c.trim()) ? "Continue" : "Skip for now"}
        </button>
      </div>
    </form>
  );
}
