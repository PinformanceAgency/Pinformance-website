import type { Job } from "bullmq";
import { runContentPipeline } from "../../src/lib/ai/pipelines/content-pipeline";

interface GeneratePinContentData {
  orgId: string;
  days?: number;
}

export async function processGeneratePinContent(job: Job<GeneratePinContentData>) {
  const { orgId, days } = job.data;
  console.log(`Generating pin content for org ${orgId}, ${days || 7} days`);
  const result = await runContentPipeline(orgId, days);
  return result;
}
