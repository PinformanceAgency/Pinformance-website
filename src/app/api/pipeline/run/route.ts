import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runStrategyPipeline } from "@/lib/ai/pipelines/strategy-pipeline";
import { runContentPipeline } from "@/lib/ai/pipelines/content-pipeline";
import { runFeedbackPipeline } from "@/lib/ai/pipelines/feedback-pipeline";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { pipeline, options } = body;

  try {
    switch (pipeline) {
      case "strategy": {
        const result = await runStrategyPipeline(profile.org_id);
        return NextResponse.json({
          success: true,
          pipeline: "strategy",
          result: {
            keywords: result.keywordStrategy.primary_keywords.length +
              result.keywordStrategy.secondary_keywords.length +
              result.keywordStrategy.long_tail_keywords.length,
            boards: result.boardPlan.boards.length,
          },
        });
      }

      case "content": {
        const days = options?.days || 7;
        const result = await runContentPipeline(profile.org_id, days);
        return NextResponse.json({
          success: true,
          pipeline: "content",
          result,
        });
      }

      case "feedback": {
        const result = await runFeedbackPipeline(profile.org_id);
        return NextResponse.json({
          success: true,
          pipeline: "feedback",
          result: result
            ? {
                keyword_updates: result.keyword_score_updates.length,
                recommendations: result.recommendations.length,
                prompt_modifiers: result.prompt_modifiers.length,
              }
            : { message: "No data to analyze yet" },
        });
      }

      default:
        return NextResponse.json({ error: "Invalid pipeline" }, { status: 400 });
    }
  } catch (err) {
    console.error(`Pipeline ${pipeline} error:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipeline failed" },
      { status: 500 }
    );
  }
}
