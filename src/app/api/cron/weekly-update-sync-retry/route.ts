/**
 * Weekly Update Sync — second attempt. Runs Monday 12:30 UTC, half an hour
 * after the first (see vercel.json), and performs exactly the same run.
 *
 * WHY THIS HAS ITS OWN PATH
 * -------------------------
 * Purely because crons in vercel.json need a unique path. The logic lives once,
 * in the route next door; this only re-exports the same handlers.
 *
 * WHY A SECOND RUN IS SAFE
 * ------------------------
 * The sync is idempotent: a week row that already holds spend (and revenue) is
 * frozen and skipped, before the Pinterest call. So this run does nothing when
 * the first one succeeded (~5 seconds, not a single mutation), and finishes the
 * job when it was cut off halfway -- the 17-08-2026 scenario, where 24 stores
 * were left without figures. Late conversions cannot change figures that have
 * already gone out through this path either; that is the same freeze rule.
 */
export const maxDuration = 300;

export { GET, POST } from "../weekly-update-sync/route";
