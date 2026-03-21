import type { Job } from "bullmq";
import { runFeedbackPipeline } from "../../src/lib/ai/pipelines/feedback-pipeline";

interface RunFeedbackLoopData {
  orgId: string;
}

export async function processRunFeedbackLoop(job: Job<RunFeedbackLoopData>) {
  const { orgId } = job.data;
  console.log(`Running feedback loop for org ${orgId}`);
  const result = await runFeedbackPipeline(orgId);

  if (!result) {
    return { skipped: true, reason: "No posted pins in last 7 days" };
  }

  return {
    keywordUpdates: result.keyword_score_updates.length,
    newModifiers: result.prompt_modifiers.length,
    recommendations: result.recommendations.length,
  };
}
