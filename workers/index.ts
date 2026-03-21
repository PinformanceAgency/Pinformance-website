import { Worker } from "bullmq";
import { connection } from "./queues";
import { processPostPin } from "./jobs/post-pin";
import { processGenerateStrategy } from "./jobs/generate-strategy";
import { processGeneratePinContent } from "./jobs/generate-pin-content";
import { processGenerateImage } from "./jobs/generate-image";
import { processPullAnalytics } from "./jobs/pull-analytics";
import { processRunFeedbackLoop } from "./jobs/run-feedback-loop";
import { processShopifySync } from "./jobs/shopify-sync";
import { processParseBrandDoc } from "./jobs/parse-brand-doc";
import { processRefreshPinterestToken } from "./jobs/refresh-pinterest-token";

const workers: Worker[] = [];

function createWorker(queueName: string, processor: (job: any) => Promise<any>) {
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: 3,
  });

  worker.on("completed", (job) => {
    console.log(`[${queueName}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
  });

  workers.push(worker);
  return worker;
}

// Register all workers
createWorker("pinterest-posting", processPostPin);
createWorker("content-generation", async (job) => {
  if (job.name === "generate-strategy") return processGenerateStrategy(job);
  if (job.name === "generate-pin-content") return processGeneratePinContent(job);
  throw new Error(`Unknown content-generation job: ${job.name}`);
});
createWorker("image-generation", processGenerateImage);
createWorker("analytics", async (job) => {
  if (job.name === "pull-analytics") return processPullAnalytics(job);
  if (job.name === "run-feedback-loop") return processRunFeedbackLoop(job);
  throw new Error(`Unknown analytics job: ${job.name}`);
});
createWorker("imports", async (job) => {
  if (job.name === "shopify-sync") return processShopifySync(job);
  if (job.name === "parse-brand-doc") return processParseBrandDoc(job);
  throw new Error(`Unknown imports job: ${job.name}`);
});
createWorker("maintenance", processRefreshPinterestToken);

console.log(`Pinformance workers started (${workers.length} workers)`);

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  // Connection config object, no cleanup needed
  console.log("Workers shut down cleanly");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
