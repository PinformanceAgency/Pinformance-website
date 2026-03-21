"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Globe, Loader2, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  INDUSTRIES,
  BRAND_VOICE_OPTIONS,
  REVENUE_RANGES,
} from "@/lib/constants";
import type { Organization } from "@/lib/types";

const DEFAULT_COLORS = ["#000000", "#FFFFFF", "#E60023", "", ""];

export function BrandInfoStep({
  org,
  onNext,
}: {
  org: Organization;
  onNext: () => void;
}) {
  const [name, setName] = useState(org.name || "");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [brandVoice, setBrandVoice] = useState<string[]>([]);
  const [usp, setUsp] = useState("");
  const [colors, setColors] = useState<string[]>(DEFAULT_COLORS);
  const [revenueRange, setRevenueRange] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleVoice(voice: string) {
    setBrandVoice((prev) =>
      prev.includes(voice)
        ? prev.filter((v) => v !== voice)
        : prev.length < 4
          ? [...prev, voice]
          : prev
    );
  }

  function updateColor(index: number, value: string) {
    const updated = [...colors];
    updated[index] = value;
    setColors(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const supabase = createClient();

    await supabase.from("organizations").update({ name }).eq("id", org.id);

    await supabase.from("brand_profiles").upsert(
      {
        org_id: org.id,
        raw_data: {
          website,
          industry,
          target_audience: targetAudience,
          brand_voice: brandVoice,
          usp,
          colors: colors.filter(Boolean),
          revenue_range: revenueRange,
        },
      },
      { onConflict: "org_id" }
    );

    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Brand Identity Section */}
      <section className="space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Brand Identity
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Brand Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              placeholder="Your brand name"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Website URL <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                placeholder="https://yourbrand.com"
                required
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Industry / Niche <span className="text-destructive">*</span>
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none"
              required
            >
              <option value="">Select your industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind.value} value={ind.value}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Monthly Revenue Range
            </label>
            <select
              value={revenueRange}
              onChange={(e) => setRevenueRange(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none"
            >
              <option value="">Select range</option>
              {REVENUE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Audience & Positioning */}
      <section className="space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Audience & Positioning
          </h3>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Target Audience
          </label>
          <textarea
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="Describe your ideal customer: demographics, interests, pain points..."
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            This helps us tailor pin content and targeting for maximum engagement.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">
            Unique Selling Points
          </label>
          <textarea
            value={usp}
            onChange={(e) => setUsp(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[80px] resize-none"
            placeholder="What makes your brand unique? What do customers love most?"
          />
        </div>
      </section>

      {/* Brand Voice */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Brand Voice & Tone
          </h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Select up to 4 words that best describe your brand&apos;s voice. This shapes the copy on your pins.
        </p>

        <div className="flex flex-wrap gap-2">
          {BRAND_VOICE_OPTIONS.map((voice) => {
            const selected = brandVoice.includes(voice);
            return (
              <button
                key={voice}
                type="button"
                onClick={() => toggleVoice(voice)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all duration-200",
                  selected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
              >
                {voice}
              </button>
            );
          })}
        </div>

        {brandVoice.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Selected:</span>
            {brandVoice.map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full"
              >
                {v}
                <button type="button" onClick={() => toggleVoice(v)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Color Palette */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Color Palette
          </h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Add your brand colors (3-5). We&apos;ll use these when generating pin designs.
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          {colors.map((color, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <label
                className={cn(
                  "relative w-12 h-12 rounded-xl border-2 cursor-pointer transition-all duration-200 overflow-hidden group",
                  color
                    ? "border-border hover:border-primary/40"
                    : "border-dashed border-border/60 hover:border-primary/40"
                )}
              >
                {color ? (
                  <div
                    className="w-full h-full"
                    style={{ backgroundColor: color }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted/30">
                    <Plus className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <input
                  type="color"
                  value={color || "#000000"}
                  onChange={(e) => updateColor(i, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <input
                type="text"
                value={color}
                onChange={(e) => updateColor(i, e.target.value)}
                className="w-20 text-center text-xs px-1.5 py-1 border border-input rounded-lg bg-background font-mono focus:outline-none focus:ring-1 focus:ring-primary/20"
                placeholder="#000000"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !name || !website || !industry}
          className={cn(
            "relative px-8 py-3 rounded-xl text-sm font-semibold transition-all duration-200",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "shadow-sm hover:shadow-md"
          )}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </span>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </form>
  );
}
