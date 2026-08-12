-- Cache table for the Team Activity page. A cron refreshes it every 6h.
-- API reads instantly — no on-demand aggregation.

CREATE TABLE IF NOT EXISTS team_activity_cache (
  id           text PRIMARY KEY,       -- fixed single row: 'default'
  data         jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
