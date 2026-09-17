/**
 * Recompute the Team Activity cache from here, without the cron.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx scripts/refresh-team-activity.ts
 *
 * The cron (`/api/cron/refresh-team-activity`, every 6h) is the normal route
 * and this changes nothing it does not — same computation, same single-row
 * upsert on team_activity_cache. It exists because the cache is the only
 * thing the page and /api/agent/team-activity ever read, so when it is stale
 * there has to be a way to fill it that does not depend on the cron secret
 * or on waiting six hours to find out whether a fix worked.
 *
 * It prints the wall clock. That number is the point: the cron dies at 300s,
 * and this is where you find out how much room is left before it does.
 */
import "dotenv/config";
import {
  computeTeamActivity,
  writeCachedTeamActivity,
} from "../src/lib/media-buying/team-activity";

async function main() {
  const started = Date.now();
  const data = await computeTeamActivity();
  const computed = Date.now() - started;
  await writeCachedTeamActivity(data);
  console.log(
    `✓ ${data.stores.length} stores, ${data.weeks.length} weeks, ${data.buyers.length} buyers`
  );
  console.log(
    `  computed in ${(computed / 1000).toFixed(1)}s, written in ${((Date.now() - started - computed) / 1000).toFixed(1)}s`
  );
  console.log(`  budget is 300s — the cron dies at that, silently.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ Refresh failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
