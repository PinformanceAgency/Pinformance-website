import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/ai/client";
import {
  feedbackAnalysisPrompts,
  type FeedbackAnalysisOutput,
} from "@/lib/ai/prompts/feedback-analysis";
import { subDays, format } from "date-fns";

export async function runFeedbackPipeline(orgId: string) {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

  // Load pins with analytics from last 7 days
  const { data: pins } = await supabase
    .from("pins")
    .select("*, pin_analytics(*)")
    .eq("org_id", orgId)
    .eq("status", "posted")
    .gte("posted_at", sevenDaysAgo);

  if (!pins?.length) {
    console.log(`No posted pins in last 7 days for org ${orgId}, skipping feedback`);
    return null;
  }

  const pinsWithAnalytics = pins.map((pin) => ({
    ...pin,
    analytics: pin.pin_analytics || [],
  }));

  // Load current keywords
  const { data: keywords } = await supabase
    .from("keywords")
    .select("*")
    .eq("org_id", orgId);

  // Run feedback analysis
  const prompts = feedbackAnalysisPrompts({
    pins: pinsWithAnalytics,
    currentKeywords: keywords || [],
  });

  const analysis = await generateJSON<FeedbackAnalysisOutput>(
    prompts.systemPrompt,
    prompts.userPrompt
  );

  // Update keyword scores
  for (const update of analysis.keyword_score_updates) {
    await supabase
      .from("keywords")
      .update({ performance_score: update.new_score })
      .eq("org_id", orgId)
      .eq("keyword", update.keyword);
  }

  // Save new feedback rules (prompt modifiers)
  if (analysis.prompt_modifiers.length) {
    const rules = analysis.prompt_modifiers.map((modifier, i) => ({
      org_id: orgId,
      rule_type: "prompt_modifier" as const,
      rule_text: modifier,
      priority: 50 + i,
      is_active: true,
      created_by: null,
    }));

    // Deactivate old AI-generated prompt modifiers
    await supabase
      .from("feedback_rules")
      .update({ is_active: false })
      .eq("org_id", orgId)
      .eq("rule_type", "prompt_modifier")
      .is("created_by", null);

    await supabase.from("feedback_rules").insert(rules);
  }

  // Log ai_task
  await supabase.from("ai_tasks").insert({
    org_id: orgId,
    task_type: "feedback_analysis",
    status: "completed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    input_summary: `${pinsWithAnalytics.length} pins analyzed`,
    output_summary: `${analysis.keyword_score_updates.length} keyword updates, ${analysis.prompt_modifiers.length} new modifiers, ${analysis.recommendations.length} recommendations`,
    metadata: {
      top_keywords: analysis.top_performing.keywords.slice(0, 10),
      top_styles: analysis.top_performing.visual_styles,
      recommendations: analysis.recommendations,
    },
  });

  return analysis;
}
