import type { Job } from "bullmq";
import { runStrategyPipeline } from "../../src/lib/ai/pipelines/strategy-pipeline";

interface GenerateStrategyData {
  orgId: string;
}

export async function processGenerateStrategy(job: Job<GenerateStrategyData>) {
  const { orgId } = job.data;
  console.log(`Generating strategy for org ${orgId}`);
  const result = await runStrategyPipeline(orgId);
  return {
    keywords: result.keywordStrategy.primary_keywords.length +
      result.keywordStrategy.secondary_keywords.length +
      result.keywordStrategy.long_tail_keywords.length,
    boards: result.boardPlan.boards.length,
  };
}
