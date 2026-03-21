import { Queue, type ConnectionOptions } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const parsed = new URL(redisUrl);

export const connection: ConnectionOptions = {
  host: parsed.hostname,
  port: parseInt(parsed.port || "6379"),
  password: parsed.password || undefined,
  maxRetriesPerRequest: null,
};

export const pinterestPostingQueue = new Queue("pinterest-posting", { connection });
export const contentGenerationQueue = new Queue("content-generation", { connection });
export const imageGenerationQueue = new Queue("image-generation", { connection });
export const analyticsQueue = new Queue("analytics", { connection });
export const importsQueue = new Queue("imports", { connection });
export const scrapingQueue = new Queue("scraping", { connection });
export const maintenanceQueue = new Queue("maintenance", { connection });
