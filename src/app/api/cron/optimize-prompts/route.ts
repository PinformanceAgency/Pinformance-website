import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/ai/client";
import { decrypt } from "@/lib/encryption";
import {
  promptOptimizerPrompts,
  inferVisualStyle,
  aggregatePinAnalytics,
  type PromptOptimizerOutput,
} from "@/lib/ai/prompts/prompt-optimizer";
import { subDays, format } from "date-fns";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== (process.env.CRON_SECRET || process.env.CRON_SET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");

  // Get all orgs that have posted pins
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, anthropic_api_key_encrypted");

  if (!orgs?.length) {
    return NextResponse.json({ message: "No orgs to process", optimized: 0 });
  }

  const results: { org_id: string; insights: number; rules: number }[] = [];
  const errors: { org_id: string; error: string }[] = [];

  for (const org of orgs) {
    try {
      const startedAt = new Date().toISOString();

      // Resolve per-org API key
      let apiKey: string | undefined;
      if (org.anthropic_api_key_encrypted) {
        try {
          apiKey = decrypt(org.anthropic_api_key_encrypted);
        } catch {
          // Fall back to global key
        }
      }

      // Pull pins with analytics from last 14 days
      const { data: pins } = await admin
        .from("pins")
        .select("*, pin_analytics(*), boards!inner(name, category)")
        .eq("org_id", org.id)
        .eq("status", "posted")
        .gte("posted_at", fourteenDaysAgo);

      if (!pins?.length || pins.length < 5) {
        // Need at least 5 pins to derive meaningful patterns
        continue;
      }

      // Aggregate analytics per pin and compute composite score
      const pinsWithScores = pins
        .map((pin) => {
          const analytics = aggregatePinAnalytics(pin.pin_analytics || []);
          const visual_style = inferVisualStyle(pin);

          // Composite score: outbound 3x, saves 2x, clicks 1.5x, impressions 1x
          // Normalize by impressions to get rate-based score
          const compositeScore =
            analytics.total_impressions > 0
              ? (analytics.total_outbound_clicks * 3 +
                  analytics.total_saves * 2 +
                  analytics.total_clicks * 1.5) /
                analytics.total_impressions
              : 0;

          const board = pin.boards as unknown as { name: string; category: string | null } | null;

          return {
            id: pin.id,
            title: pin.title,
            keywords: pin.keywords || [],
            generation_prompt: pin.generation_prompt,
            board_id: pin.board_id,
            board_name: board?.name,
            board_category: board?.category || undefined,
            visual_style,
            content_pillar: board?.category || undefined,
            posted_at: pin.posted_at,
            ...analytics,
            compositeScore,
          };
        })
        .filter((p) => p.total_impressions > 0); // Only score pins with data

      if (pinsWithScores.length < 5) continue;

      // Sort by composite score (save_rate + engagement_rate as tiebreaker)
      pinsWithScores.sort(
        (a, b) =>
          b.compositeScore - a.compositeScore ||
          b.save_rate + b.engagement_rate - (a.save_rate + a.engagement_rate)
      );

      // Top 20% and bottom 20%
      const topCount = Math.max(1, Math.ceil(pinsWithScores.length * 0.2));
      const bottomCount = Math.max(1, Math.ceil(pinsWithScores.length * 0.2));
      const topPins = pinsWithScores.slice(0, topCount);
      const bottomPins = pinsWithScores.slice(-bottomCount);

      // Load current feedback rules
      const { data: currentRules } = await admin
        .from("feedback_rules")
        .select("*")
        .eq("org_id", org.id)
        .eq("is_active", true);

      // Load brand profile
      const { data: brandProfile } = await admin
        .from("brand_profiles")
        .select("*")
        .eq("org_id", org.id)
        .single();

      // Generate optimization via AI
      const prompts = promptOptimizerPrompts({
        top_pins: topPins,
        bottom_pins: bottomPins,
        current_feedback_rules: currentRules || [],
        brand_profile: {
          name: org.name,
          brand_voice: brandProfile?.structured_data?.brand_voice || brandProfile?.brand_voice,
          structured_data: brandProfile?.structured_data,
        },
        all_pins_count: pinsWithScores.length,
      });

      const optimization = await generateJSON<PromptOptimizerOutput>(
        prompts.systemPrompt,
        prompts.userPrompt,
        undefined,
        apiKey
      );

      // Deactivate old AI-generated rules (ones without created_by)
      await admin
        .from("feedback_rules")
        .update({ is_active: false })
        .eq("org_id", org.id)
        .is("created_by", null);

      // Insert new rules
      if (optimization.new_rules.length > 0) {
        const ruleRows = optimization.new_rules.map((rule) => ({
          org_id: org.id,
          rule_type: rule.type,
          rule_text: rule.text,
          priority: rule.priority,
          is_active: true,
          created_by: null, // AI-generated
        }));

        await admin.from("feedback_rules").insert(ruleRows);
      }

      // Update keyword performance scores
      for (const kwPerf of optimization.keyword_performance) {
        // Normalize score from 0-10 to 0-1 range for consistency with existing scores
        const normalizedScore = kwPerf.score / 10;
        await admin
          .from("keywords")
          .update({ performance_score: normalizedScore })
          .eq("org_id", org.id)
          .eq("keyword", kwPerf.keyword);
      }

      // Update brand_profiles.structured_data with learned preferences
      if (brandProfile) {
        const existingData = brandProfile.structured_data || {};
        const updatedData = {
          ...existingData,
          learned_preferences: {
            last_optimized_at: new Date().toISOString(),
            recommended_content_mix: optimization.recommended_content_mix,
            recommended_posting_hours: optimization.recommended_posting_hours,
            top_insights: optimization.insights.slice(0, 5),
            active_rules_count: optimization.new_rules.length,
          },
        };

        await admin
          .from("brand_profiles")
          .update({ structured_data: updatedData })
          .eq("org_id", org.id);
      }

      // Log ai_task
      await admin.from("ai_tasks").insert({
        org_id: org.id,
        task_type: "prompt_optimization",
        status: "completed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        input_summary: `${pinsWithScores.length} pins (14d), top ${topPins.length}, bottom ${bottomPins.length}`,
        output_summary: `${optimization.insights.length} insights, ${optimization.new_rules.length} rules, ${optimization.keyword_performance.length} keyword scores`,
        metadata: {
          insights: optimization.insights,
          rules_created: optimization.new_rules.length,
          recommended_content_mix: optimization.recommended_content_mix,
          recommended_posting_hours: optimization.recommended_posting_hours,
          keyword_performance: optimization.keyword_performance.slice(0, 20),
          top_pin_ids: topPins.map((p) => p.id),
          bottom_pin_ids: bottomPins.map((p) => p.id),
        },
      });

      results.push({
        org_id: org.id,
        insights: optimization.insights.length,
        rules: optimization.new_rules.length,
      });
    } catch (err) {
      errors.push({
        org_id: org.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    optimized: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}
