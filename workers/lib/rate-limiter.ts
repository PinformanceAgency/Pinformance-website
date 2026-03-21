import { PINTEREST_LIMITS, POSTING_INTERVAL_MS } from "../../src/lib/constants";

// Simple in-memory rate limiter for Pinterest posting
// Tracks posts per org per day and per minute
const postLog: Map<string, number[]> = new Map();

export async function checkRateLimit(orgId: string): Promise<boolean> {
  const now = Date.now();
  const timestamps = postLog.get(orgId) || [];

  // Clean old timestamps (older than 24h)
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recentTimestamps = timestamps.filter((t) => t > dayAgo);

  // Check daily limit
  if (recentTimestamps.length >= PINTEREST_LIMITS.MAX_PINS_PER_DAY) {
    return false;
  }

  // Check per-minute limit
  const minuteAgo = now - 60 * 1000;
  const lastMinute = recentTimestamps.filter((t) => t > minuteAgo);
  if (lastMinute.length >= PINTEREST_LIMITS.MAX_PINS_PER_MINUTE) {
    return false;
  }

  // Check minimum interval between posts
  const lastPost = recentTimestamps[recentTimestamps.length - 1];
  if (lastPost && now - lastPost < POSTING_INTERVAL_MS) {
    return false;
  }

  return true;
}

export async function recordPost(orgId: string): Promise<void> {
  const timestamps = postLog.get(orgId) || [];
  timestamps.push(Date.now());

  // Keep only last 24h
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  postLog.set(
    orgId,
    timestamps.filter((t) => t > dayAgo)
  );
}

export function getPostCount(orgId: string): number {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const timestamps = postLog.get(orgId) || [];
  return timestamps.filter((t) => t > dayAgo).length;
}
