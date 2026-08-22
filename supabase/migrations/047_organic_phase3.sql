-- Phase 3 organic workflow — profile fields on client_settings, harvest-
-- source tracking on candidate pool, unique constraint on volume queue so
-- the same term isn't queued twice. Keyword and cache tables already exist.

-- 1. Pinterest profile fields on client_settings. P3.2.1 / P3.2.2 write here.
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS bio          text;

-- 2. Harvest tracking on keywords: which of the four sources found this term
--    (search bar / bubbles / interest taxonomy / competitor annotations),
--    plus the autocomplete rank when it was a search-bar hit (rank is our
--    free volume proxy per the SOP).
--    Rather than add columns to keywords, we use the pre-existing `source`
--    enum (SEARCH_BAR, PINCLICKS, ANNOTATION, ...). But we do need per-term
--    autocomplete rank, and a way to tell client-supplied "generic yes/no"
--    outcome. Add the minimal columns.
ALTER TABLE organic.keywords
  ADD COLUMN IF NOT EXISTS autocomplete_rank integer,
  ADD COLUMN IF NOT EXISTS generic_applies_to_all boolean,
  ADD COLUMN IF NOT EXISTS client_aligned boolean;

-- 3. Volume lookup queue — uniqueness so re-runs of the deduper don't queue
--    the same term twice for the same org.
CREATE UNIQUE INDEX IF NOT EXISTS volume_lookup_queue_org_term_uniq
  ON organic.volume_lookup_queue (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), term);

-- 4. Board planning fields — planned_creation_date is already on boards.
--    Nothing to add there. Coverage is entirely computed by the existing
--    organic.topic_coverage view.

-- 5. Idempotency for topics — one row per (org, name).
CREATE UNIQUE INDEX IF NOT EXISTS topics_org_name_uniq
  ON organic.topics (org_id, name);

-- 6. Idempotency for boards — one row per (org, name).
CREATE UNIQUE INDEX IF NOT EXISTS boards_org_name_uniq
  ON organic.boards (org_id, name);
