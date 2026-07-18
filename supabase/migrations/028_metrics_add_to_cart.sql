-- Media Buying Hub — track add-to-cart events + value on daily snapshots.
--
-- The head of media buying wants ATC CPA visible in benchmarks alongside
-- the existing checkout CPA. Also stores add_to_cart_value (in dollars)
-- so ATC ROAS can be surfaced without another migration later.
--
-- Both columns default to 0 rather than NULL so existing snapshot rows
-- treat "unknown" as "zero" — consistent with how spend/revenue are stored.
-- The snapshot cron re-runs daily and will populate real values on next run;
-- a one-off `?days=30` backfill on rollout fills the last month of history.

ALTER TABLE pinterest_metrics_snapshots
  ADD COLUMN IF NOT EXISTS add_to_carts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_to_cart_value  NUMERIC NOT NULL DEFAULT 0;
