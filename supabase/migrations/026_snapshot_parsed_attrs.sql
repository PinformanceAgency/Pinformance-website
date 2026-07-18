-- Media Buying Hub — Task 2: persist naming-convention attributes on
-- pinterest_entity_snapshots so the naming-explorer + zone views can filter
-- across all stores without re-parsing thousands of names per request.
--
-- The parser lives in src/lib/pinterest/naming-conventions.ts (source of
-- truth). The snapshot-pinterest cron fills these columns going forward;
-- scripts/backfill-parsed-snapshots.ts fills them for pre-existing rows.

ALTER TABLE pinterest_entity_snapshots
  ADD COLUMN IF NOT EXISTS parsed_country            TEXT,
  ADD COLUMN IF NOT EXISTS parsed_funnel             TEXT,
  ADD COLUMN IF NOT EXISTS parsed_performance_plus   TEXT,
  ADD COLUMN IF NOT EXISTS parsed_strategy           TEXT,
  ADD COLUMN IF NOT EXISTS parsed_strategy_category  TEXT,
  ADD COLUMN IF NOT EXISTS parsed_catalog            TEXT,
  ADD COLUMN IF NOT EXISTS parsed_objective          TEXT;

CREATE INDEX IF NOT EXISTS idx_pes_parsed_country
  ON pinterest_entity_snapshots (parsed_country);
CREATE INDEX IF NOT EXISTS idx_pes_parsed_funnel
  ON pinterest_entity_snapshots (parsed_funnel);
CREATE INDEX IF NOT EXISTS idx_pes_parsed_perfplus
  ON pinterest_entity_snapshots (parsed_performance_plus);
