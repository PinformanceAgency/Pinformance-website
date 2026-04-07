"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrg } from "@/hooks/use-org";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Save, Check, FileText, Sparkles, Image, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/settings", label: "General" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/prompts", label: "Prompts" },
  { href: "/settings/images", label: "Images" },
];

interface CustomPrompts {
  pin_content: string;
  image_generation: string;
  template_preference: string;
}

interface FeedbackRule {
  id: string;
  rule_type: string;
  rule_text: string;
  priority: number;
  is_active: boolean;
}

const DEFAULT_PROMPTS: CustomPrompts = {
  pin_content: "",
  image_generation: "",
  template_preference: "",
};

const PROMPT_SECTIONS = [
  {
    key: "pin_content" as const,
    title: "Pin Content Prompt",
    icon: FileText,
    description:
      "This prompt generates the pin title, description, keywords, alt text, and text overlay. It uses Pinterest SEO best practices, seasonal context, and your brand voice.",
    staticRules: [
      "Title: max 100 chars, primary keyword in first 40 characters",
      "Description: max 500 chars, brand name first, 3-5 natural keywords",
      "No hashtags — strong keywords in natural sentences instead",
      "Text overlay: 3-8 words, benefit-driven hook",
      "Visual style selection: lifestyle, flat_lay, closeup, model, infographic",
      "Seasonal targeting: content aimed 45-90 days ahead",
    ],
    placeholder:
      "Add custom instructions for pin content generation...\n\nExamples:\n- Always mention 'perfect for beginners' in descriptions\n- Focus on relaxation and stress-relief benefits\n- Use warm, encouraging tone",
  },
  {
    key: "image_generation" as const,
    title: "Image Generation Prompt",
    icon: Image,
    description:
      "This prompt creates detailed instructions for generating pin images. It controls the visual style, text overlay placement, and brand consistency.",
    staticRules: [
      "Always photorealistic — DSLR-quality product photography",
      "2:3 vertical format (1000x1500px) for Pinterest",
      "Text overlay: bold, readable on mobile, in top or bottom third",
      "Brand colors and logo subtly integrated",
      "Product is the hero — clearly visible and well-lit",
    ],
    placeholder:
      "Add custom instructions for image generation...\n\nExamples:\n- Use natural lighting, avoid studio setups\n- Include watercolor art supplies as props\n- Warm color palette with earth tones",
  },
  {
    key: "template_preference" as const,
    title: "Template & Creative Style",
    icon: Palette,
    description:
      "Controls which pin creative templates are used and how. Available templates: hero (full-bleed + CTA), editorial (text + image split), tips (numbered list), stat (big number), review (testimonial card), lifestyle (minimal overlay), benefits (checkmark list).",
    staticRules: [
      "Templates auto-selected based on content type and visual style",
      "Hero: product launches, premium positioning",
      "Editorial: feature lists, educational content",
      "Tips: how-to content, numbered lists (30% more saves)",
      "Stat: price callouts, percentages, data points",
      "Review: customer testimonials",
      "Lifestyle: aspirational, minimal text",
      "Benefits: checkmark feature lists",
    ],
    placeholder:
      "Add template preferences...\n\nExamples:\n- Prefer 'editorial' and 'tips' templates over 'hero'\n- Always include a CTA on every pin\n- Use brand green (#2D5016) as accent color",
  },
];

export default function PromptsPage() {
  const pathname = usePathname();
  const { org, loading } = useOrg();
  const [brandVoice, setBrandVoice] = useState("");
  const [customPrompts, setCustomPrompts] = useState<CustomPrompts>(DEFAULT_PROMPTS);
  const [feedbackRules, setFeedbackRules] = useState<FeedbackRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!org) return;
    loadData();
  }, [org]);

  async function loadData() {
    const supabase = createClient();

    // Load brand profile
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("org_id", org!.id)
      .single();

    if (profile) {
      setBrandVoice(profile.brand_voice || "");
      const sd = profile.structured_data as Record<string, unknown> | null;
      if (sd?.custom_prompts) {
        setCustomPrompts({ ...DEFAULT_PROMPTS, ...(sd.custom_prompts as CustomPrompts) });
      }
    }

    // Load feedback rules
    const { data: rules } = await supabase
      .from("feedback_rules")
      .select("id, rule_type, rule_text, priority, is_active")
      .eq("org_id", org!.id)
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (rules) setFeedbackRules(rules);
  }

  async function handleSave() {
    if (!org) return;
    setSaving(true);

    const supabase = createClient();

    // Get current structured_data
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("structured_data")
      .eq("org_id", org.id)
      .single();

    const currentData = (profile?.structured_data as Record<string, unknown>) || {};

    await supabase
      .from("brand_profiles")
      .update({
        brand_voice: brandVoice,
        structured_data: { ...currentData, custom_prompts: customPrompts },
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", org.id);

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) {
    return <div className="h-96 bg-muted animate-pulse rounded-xl" />;
  }

  const rulesByType = {
    style_guide: feedbackRules.filter((r) => r.rule_type === "style_guide"),
    keyword_boost: feedbackRules.filter((r) => r.rule_type === "keyword_boost"),
    prompt_modifier: feedbackRules.filter((r) => r.rule_type === "prompt_modifier"),
    keyword_block: feedbackRules.filter((r) => r.rule_type === "keyword_block"),
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Fine-tune the AI prompts used to generate your pin content and images
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

      {/* Brand Voice */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Brand Voice
        </h2>
        <p className="text-sm text-muted-foreground">
          Describes the tone and style of all generated pin content. This is injected into every content generation prompt.
        </p>
        <textarea
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
          placeholder="e.g. Encouraging, warm, accessible. Speaks to creative beginners and gift-givers."
        />
      </div>

      {/* Prompt Sections */}
      {PROMPT_SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.key} className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Icon className="w-4 h-4" /> {section.title}
            </h2>
            <p className="text-sm text-muted-foreground">{section.description}</p>

            {/* Static rules (read-only) */}
            <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Base Rules (automatic)
              </p>
              {section.staticRules.map((rule, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-muted-foreground/60 mt-0.5">&#8226;</span>
                  {rule}
                </p>
              ))}
            </div>

            {/* Custom additions */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Custom Additions
              </label>
              <textarea
                value={customPrompts[section.key]}
                onChange={(e) =>
                  setCustomPrompts({ ...customPrompts, [section.key]: e.target.value })
                }
                rows={4}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                placeholder={section.placeholder}
              />
            </div>
          </div>
        );
      })}

      {/* Active Feedback Rules (read-only reference) */}
      {feedbackRules.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Active AI Rules
          </h2>
          <p className="text-sm text-muted-foreground">
            These rules are automatically generated from pin performance data and applied to every prompt.
            Manage them in the AI Rules admin panel.
          </p>

          {Object.entries(rulesByType).map(([type, rules]) =>
            rules.length > 0 ? (
              <div key={type} className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {type.replace("_", " ")}
                </p>
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start gap-2 text-sm bg-muted/30 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                      P{rule.priority}
                    </span>
                    <span className="text-muted-foreground">{rule.rule_text}</span>
                  </div>
                ))}
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className={cn(
          "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all",
          saved
            ? "bg-green-600 text-white"
            : "bg-primary text-primary-foreground hover:opacity-90"
        )}
      >
        {saved ? (
          <>
            <Check className="w-4 h-4" /> Saved
          </>
        ) : saving ? (
          "Saving..."
        ) : (
          <>
            <Save className="w-4 h-4" /> Save Prompt Settings
          </>
        )}
      </button>
    </div>
  );
}
