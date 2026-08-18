-- Enable Row-Level Security on team_activity_cache.
--
-- This table was added in migration 035 without RLS, so anyone with the
-- project's anon key could read/write/delete it. Supabase flagged it as
-- "Table publicly accessible / rls_disabled_in_public" on 17 Aug 2026.
--
-- Contents: pre-computed team activity aggregates (weekly launched/paused/
-- boards/pins per store). No PII, but still not something we want the
-- anonymous role to touch.
--
-- Access model:
--   - service_role: full access (used by the /api/cron/refresh-team-activity
--     cron which upserts the single 'default' row via the pg pool with
--     DATABASE_URL — service_role bypasses RLS by default).
--   - authenticated users: SELECT only, via the /api/team-activity read path
--     that runs as the logged-in user. We don't grant write here; only the
--     cron should mutate this cache.
--   - anon: no access.

ALTER TABLE team_activity_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users may read the cache. It's shared data for the whole
-- team — every logged-in user sees the same rollup.
CREATE POLICY "team_activity_cache_read_authenticated"
  ON team_activity_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated or anon → those
-- operations are denied. Service_role bypasses RLS so the cron can still
-- upsert.
