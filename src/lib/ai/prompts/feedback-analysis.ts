import type { Pin, PinAnalytics, Keyword } from "@/lib/types";

interface FeedbackAnalysisInput {
  pins: (Pin & { analytics: PinAnalytics[] })[];
  currentKeywords: Keyword[];
  currentStrategy?: {
    top_visual_styles: string[];
    top_posting_times: number[];
  };
}

export interface FeedbackAnalysisOutput {
  top_performing: {
    keywords: string[];
    visual_styles: string[];
    posting_times: number[];
    content_types: string[];
  };
  underperforming: {
    keywords: string[];
    visual_styles: string[];
  };
  recommendations: string[];
  keyword_score_updates: { keyword: string; new_score: number }[];
  prompt_modifiers: string[];
}

export function feedbackAnalysisPrompts(input: FeedbackAnalysisInput) {
  const systemPrompt = `You are a Pinterest analytics expert. Analyze pin performance data to identify patterns and optimize future content.

Analysis framework:
- Compare engagement rates (saves + clicks / impressions) across different variables
- Identify keyword, visual style, and timing patterns in top vs bottom performers
- Top 20% by engagement rate = top performing, bottom 20% = underperforming
- Weight outbound clicks 3x (they drive revenue), saves 2x, impressions 1x
- Consider posting time patterns (hour of day)
- Score keywords 0-100 based on their associated pin performance
- Generate specific, actionable prompt modifiers that will improve future AI-generated content
- Prompt modifiers should be concrete instructions (e.g. "Use warm lighting in lifestyle shots" not "Make better images")

Output valid JSON:
{
  "top_performing": {
    "keywords": string[],
    "visual_styles": string[],
    "posting_times": number[],
    "content_types": string[]
  },
  "underperforming": {
    "keywords": string[],
    "visual_styles": string[]
  },
  "recommendations": string[],
  "keyword_score_updates": [{ "keyword": string, "new_score": number }],
  "prompt_modifiers": string[]
}`;

  const pinData = input.pins.map((pin) => {
    const totalAnalytics = pin.analytics.reduce(
      (acc, a) => ({
        impressions: acc.impressions + a.impressions,
        saves: acc.saves + a.saves,
        clicks: acc.clicks + a.pin_clicks,
        outbound: acc.outbound + a.outbound_clicks,
      }),
      { impressions: 0, saves: 0, clicks: 0, outbound: 0 }
    );

    return {
      title: pin.title,
      keywords: pin.keywords,
      status: pin.status,
      posted_at: pin.posted_at,
      visual_style: pin.generation_prompt?.includes("lifestyle")
        ? "lifestyle"
        : pin.generation_prompt?.includes("flat_lay")
          ? "flat_lay"
          : "unknown",
      ...totalAnalytics,
    };
  });

  const userPrompt = `Analyze this Pinterest performance data from the last 7 days:

Pins analyzed: ${pinData.length}

Pin performance data:
${JSON.stringify(pinData, null, 2)}

Current keyword scores (top 20):
${input.currentKeywords
  .sort((a, b) => (b.performance_score || 0) - (a.performance_score || 0))
  .slice(0, 20)
  .map((k) => `- "${k.keyword}": score ${k.performance_score || "unscored"}`)
  .join("\n")}

${input.currentStrategy ? `Current strategy focus:\n- Top visual styles: ${input.currentStrategy.top_visual_styles.join(", ")}\n- Top posting times: ${input.currentStrategy.top_posting_times.join(", ")}` : ""}

Identify what's working, what's not, and provide specific recommendations to improve.`;

  return { systemPrompt, userPrompt };
}
