-- P2.1.1's output needs to be identifiable, because phase 2 asks about the
-- seed keywords and nothing else.
--
-- Fit Cherries carries 185 keywords with source = MIGRATED, imported from the
-- main dashboard on 21-08-2026. Every phase-2 form that says "per keyword"
-- read *all* of them, so the grid form (P2.1.3) rendered 185 cards and refused
-- to save until every one of them had a text-overlay bucket, and the seed form
-- (P2.1.1) prefilled its box with 185 lines and then rejected the save as
-- "must be 5-10". A full day of market research was typed into forms that
-- could not accept it.
--
-- source is provenance and must keep saying where a term came from, so the
-- seed list is its own flag. A term that was migrated and is then chosen as a
-- seed keeps source = MIGRATED and gains is_seed.

ALTER TABLE organic.keywords
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

-- Backfill: every store that ran P2.1.1 before this column existed wrote its
-- seeds as MANUAL, and anything already gridded was self-evidently a seed.
UPDATE organic.keywords k
   SET is_seed = true
 WHERE k.is_seed = false
   AND (k.source::text = 'MANUAL'
        OR EXISTS (SELECT 1 FROM organic.grid_analyses g
                    WHERE g.org_id = k.org_id AND g.target_keyword = k.term));

CREATE INDEX IF NOT EXISTS keywords_org_seed_idx
  ON organic.keywords(org_id) WHERE is_seed;
