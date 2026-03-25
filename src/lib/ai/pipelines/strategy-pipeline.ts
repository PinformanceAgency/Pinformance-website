import { createAdminClient } from "@/lib/supabase/admin";
import { generateJSON } from "@/lib/ai/client";
import {
  keywordStrategyPrompts,
  type KeywordStrategyOutput,
} from "@/lib/ai/prompts/keyword-strategy";
import {
  boardPlanPrompts,
  type BoardPlanOutput,
} from "@/lib/ai/prompts/board-plan";

export async function runStrategyPipeline(orgId: string, apiKey?: string) {
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  // Load brand profile
  const { data: brandProfile } = await supabase
    .from("brand_profiles")
    .select("*")
    .eq("org_id", orgId)
    .single();

  if (!brandProfile) throw new Error(`No brand profile found for org ${orgId}`);

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();

  if (!org) throw new Error(`Organization ${orgId} not found`);

  // Load products
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "active")
    .limit(100);

  // Load competitors
  const { data: competitors } = await supabase
    .from("competitors")
    .select("*")
    .eq("org_id", orgId);

  const brand = {
    name: org.name,
    website: brandProfile.raw_data?.website || "",
    industry: brandProfile.raw_data?.industry || "",
    description: brandProfile.raw_data?.description || "",
    target_audience: brandProfile.structured_data?.target_audience || brandProfile.target_audience || "",
  };

  // Step 1: Generate keyword strategy
  const kwPrompts = keywordStrategyPrompts({
    brand,
    products: products || [],
    competitors: competitors || [],
  });

  const keywordStrategy = await generateJSON<KeywordStrategyOutput>(
    kwPrompts.systemPrompt,
    kwPrompts.userPrompt,
    undefined,
    apiKey
  );

  // Step 2: Generate board plan
  const existingBoards = await supabase
    .from("boards")
    .select("name")
    .eq("org_id", orgId);

  const bpPrompts = boardPlanPrompts({
    brand,
    keywordStrategy,
    existingBoards: existingBoards.data?.map((b) => b.name),
  });

  const boardPlan = await generateJSON<BoardPlanOutput>(
    bpPrompts.systemPrompt,
    bpPrompts.userPrompt,
    undefined,
    apiKey
  );

  // Step 3: Save keywords to DB
  const allKeywords = [
    ...keywordStrategy.primary_keywords.map((k) => ({
      org_id: orgId,
      keyword: k.keyword,
      relevance_score: 90,
      category: "primary",
      source: "ai_generated" as const,
    })),
    ...keywordStrategy.secondary_keywords.map((k) => ({
      org_id: orgId,
      keyword: k.keyword,
      relevance_score: 70,
      category: k.category,
      source: "ai_generated" as const,
    })),
    ...keywordStrategy.long_tail_keywords.map((k) => ({
      org_id: orgId,
      keyword: k.keyword,
      relevance_score: 50,
      category: k.category,
      source: "ai_generated" as const,
    })),
  ];

  await supabase.from("keywords").upsert(allKeywords, {
    onConflict: "org_id,keyword",
  });

  // Step 4: Save boards to DB
  const boardRows = boardPlan.boards.map((b, i) => ({
    org_id: orgId,
    name: b.name,
    description: b.description,
    category: b.category,
    keywords: b.target_keywords,
    status: "draft" as const,
    sort_order: i,
  }));

  await supabase.from("boards").upsert(boardRows, {
    onConflict: "org_id,name",
  });

  // Step 5: Log ai_task
  await supabase.from("ai_tasks").insert({
    org_id: orgId,
    task_type: "strategy_generation",
    status: "completed",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    input_summary: `${products?.length || 0} products, ${competitors?.length || 0} competitors`,
    output_summary: `${allKeywords.length} keywords, ${boardPlan.boards.length} boards`,
    metadata: {
      keyword_counts: {
        primary: keywordStrategy.primary_keywords.length,
        secondary: keywordStrategy.secondary_keywords.length,
        long_tail: keywordStrategy.long_tail_keywords.length,
      },
      board_count: boardPlan.boards.length,
      categories: keywordStrategy.categories.map((c) => c.name),
    },
  });

  return { keywordStrategy, boardPlan };
}
