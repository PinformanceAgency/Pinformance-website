-- Distinguish boards the buyer / AI created via the dashboard from boards we
-- pulled in from Pinterest during initial account sync. Without this the
-- Team Activity "Boards" column counts the onboarding import as "new work
-- this week" — Candela shows 3 new boards on the day the store was added
-- to the dashboard, even though those boards existed on Pinterest for
-- months already.

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS source text
    DEFAULT 'ai_generated'
    CHECK (source IN ('ai_generated', 'imported', 'user_created'));

-- Backfill: boards whose names match known Pinterest system boards, or the
-- Shopify catalog board, are imports — the AI didn't create them.
UPDATE boards
   SET source = 'imported'
 WHERE source = 'ai_generated'
   AND name IN (
     'Ad-only Pins',
     'Performance+ creative backgrounds',
     'Products',
     'Advertentiepins'
   );

CREATE INDEX IF NOT EXISTS idx_boards_org_source_created
    ON boards (org_id, source, created_at DESC);
