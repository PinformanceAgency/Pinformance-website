-- Which store paid for a volume lookup.
--
-- keyword_volume_cache.looked_up_by is a FK to users — it records the
-- person, not the store. Three queries in internal-analytics.ts compared
-- it against an org id, which can never match: the cache-contribution
-- panel reported 0 looked up and 0 reused for every store, and read as
-- "this store has never contributed" rather than "we do not record it".
--
-- The metric is worth having. A term is cached once and every later store
-- in an overlapping niche gets it free, so knowing who funds the shared
-- bank is a real answer about the book. It just needs the column.

ALTER TABLE organic.keyword_volume_cache
  ADD COLUMN IF NOT EXISTS looked_up_for_org uuid;

CREATE INDEX IF NOT EXISTS keyword_volume_cache_org_idx
  ON organic.keyword_volume_cache (looked_up_for_org)
  WHERE looked_up_for_org IS NOT NULL;

COMMENT ON COLUMN organic.keyword_volume_cache.looked_up_for_org IS
  'The store whose research paid for this lookup. Distinct from looked_up_by, which is the person. NULL for rows cached before this column existed — those are genuinely unattributed, not unattributed-to-zero.';
