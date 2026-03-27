import type { Pin, PinAnalytics, FeedbackRule } from "@/lib/types";

interface PinWithAnalytics {
  id: string;
  title: string;
  keywords: string[];
  generation_prompt: string | null;
  board_id: string;
  board_name?: string;
  board_category?: string;
  visual_style: string;
  content_pillar?: string;
  posted_at: string | null;
  total_impressions: number;
  total_saves: number;
  total_clicks: number;
  total_outbound_clicks: number;
  save_rate: number;
  engagement_rate: number;
}

interface PromptOptimizerInput {
  top_pins: PinWithAnalytics[];
  bottom_pins: PinWithAnalytics[];
  current_feedback_rules: FeedbackRule[];
  brand_profile: {
    name: string;
    brand_voice?: string;
    structured_data?: Record<string, unknown>;
  };
  all_pins_count: number;
}

export interface PromptOptimizerOutput {
  insights: string[];
  new_rules: {
    type: "prompt_modifier" | "keyword_boost" | "keyword_block" | "style_guide";
    text: string;
    priority: number;
  }[];
  recommended_content_mix: {
    lifestyle: number;
    flat_lay: number;
    infographic: number;
    closeup: number;
    model?: number;
  };
  recommended_posting_hours: number[];
  keyword_performance: {
    keyword: string;
    score: number;
    trend: "up" | "down" | "stable";
  }[];
}

export function promptOptimizerPrompts(input: PromptOptimizerInput) {
  const currentRulesSummary = input.current_feedback_rules
    .filter((r) => r.is_active)
    .map((r) => `[${r.rule_type}] ${r.rule_text} (priority: ${r.priority})`)
    .join("\n");

  const systemPrompt = `You are an expert Pinterest marketing analyst and prompt engineer. Your job is to analyze pin performance data and generate specific, actionable optimization rules that will improve AI-generated pin content.

You will receive:
1. Top-performing pins (top 20% by save_rate + engagement_rate)
2. Bottom-performing pins (bottom 20%)
3. Current active feedback rules
4. Brand profile context

Your analysis should:
- Compare visual styles, keywords, posting times, and content patterns between top and bottom performers
- Weight outbound clicks 3x (revenue), saves 2x (distribution), pin clicks 1.5x, impressions 1x
- Identify statistically meaningful patterns (not just random variation)
- Generate concrete, specific rules — not vague suggestions
- For keyword_boost: only boost keywords that appear in top performers AND have sufficient data (3+ pins)
- For keyword_block: only block keywords that consistently underperform across 3+ pins
- For prompt_modifier: write instructions that directly modify AI content generation behavior
- For style_guide: write specific visual/aesthetic instructions for image generation
- Assign priority 60-100 (higher = more important, 100 = critical optimization)
- Recommend content mix as percentages summing to 100
- Recommend posting hours based on when top performers were posted (in 24h format)
- Score keywords 0-10 based on their associated pin performance

Output valid JSON matching this schema:
{
  "insights": string[],
  "new_rules": [
    { "type": "prompt_modifier" | "keyword_boost" | "keyword_block" | "style_guide", "text": string, "priority": number }
  ],
  "recommended_content_mix": { "lifestyle": number, "flat_lay": number, "infographic": number, "closeup": number, "model": number },
  "recommended_posting_hours": number[],
  "keyword_performance": [
    { "keyword": string, "score": number, "trend": "up" | "down" | "stable" }
  ]
}`;

  const userPrompt = `Analyze Pinterest pin performance data and generate optimization rules.

BRAND: ${input.brand_profile.name}
${input.brand_profile.brand_voice ? `Brand Voice: ${input.brand_profile.brand_voice}` : ""}
Total pins analyzed: ${input.all_pins_count}

TOP PERFORMING PINS (top 20%, ${input.top_pins.length} pins):
${JSON.stringify(
  input.top_pins.map((p) => ({
    title: p.title,
    keywords: p.keywords,
    visual_style: p.visual_style,
    board: p.board_name || p.board_id,
    category: p.board_category || "uncategorized",
    content_pillar: p.content_pillar || "general",
    posted_hour: p.posted_at ? new Date(p.posted_at).getUTCHours() : null,
    impressions: p.total_impressions,
    saves: p.total_saves,
    clicks: p.total_clicks,
    outbound_clicks: p.total_outbound_clicks,
    save_rate: p.save_rate.toFixed(2),
    engagement_rate: p.engagement_rate.toFixed(2),
  })),
  null,
  2
)}

BOTTOM PERFORMING PINS (bottom 20%, ${input.bottom_pins.length} pins):
${JSON.stringify(
  input.bottom_pins.map((p) => ({
    title: p.title,
    keywords: p.keywords,
    visual_style: p.visual_style,
    board: p.board_name || p.board_id,
    category: p.board_category || "uncategorized",
    content_pillar: p.content_pillar || "general",
    posted_hour: p.posted_at ? new Date(p.posted_at).getUTCHours() : null,
    impressions: p.total_impressions,
    saves: p.total_saves,
    clicks: p.total_clicks,
    outbound_clicks: p.total_outbound_clicks,
    save_rate: p.save_rate.toFixed(2),
    engagement_rate: p.engagement_rate.toFixed(2),
  })),
  null,
  2
)}

CURRENT ACTIVE RULES:
${currentRulesSummary || "No active rules yet."}

Generate optimization rules based on patterns you identify. Be specific and actionable. Reference actual data from the pins above.`;

  return { systemPrompt, userPrompt };
}

/**
 * Infer visual style from a pin's generation prompt or metadata.
 */
export function inferVisualStyle(pin: Pick<Pin, "generation_prompt">): string {
  const prompt = (pin.generation_prompt || "").toLowerCase();
  if (prompt.includes("lifestyle")) return "lifestyle";
  if (prompt.includes("flat_lay") || prompt.includes("flat lay")) return "flat_lay";
  if (prompt.includes("infographic")) return "infographic";
  if (prompt.includes("closeup") || prompt.includes("close-up") || prompt.includes("close up")) return "closeup";
  if (prompt.includes("model")) return "model";
  return "unknown";
}

/**
 * Aggregate per-row analytics into totals for a pin.
 */
export function aggregatePinAnalytics(analyticsRows: PinAnalytics[]): {
  total_impressions: number;
  total_saves: number;
  total_clicks: number;
  total_outbound_clicks: number;
  save_rate: number;
  engagement_rate: number;
} {
  const totals = analyticsRows.reduce(
    (acc, row) => ({
      impressions: acc.impressions + row.impressions,
      saves: acc.saves + row.saves,
      clicks: acc.clicks + row.pin_clicks,
      outbound: acc.outbound + row.outbound_clicks,
    }),
    { impressions: 0, saves: 0, clicks: 0, outbound: 0 }
  );

  const save_rate = totals.impressions > 0 ? (totals.saves / totals.impressions) * 100 : 0;
  const engagement_rate =
    totals.impressions > 0
      ? ((totals.saves + totals.clicks + totals.outbound) / totals.impressions) * 100
      : 0;

  return {
    total_impressions: totals.impressions,
    total_saves: totals.saves,
    total_clicks: totals.clicks,
    total_outbound_clicks: totals.outbound,
    save_rate,
    engagement_rate,
  };
}
