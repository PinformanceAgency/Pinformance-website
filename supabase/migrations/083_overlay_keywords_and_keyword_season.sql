-- P4.1.8 and P4.1.2 — two things the schema could not express.
--
-- 1. Overlay keywords (P4.1.8).
--    The task asks the manager to pick three to five long-tail terms that
--    become the text-overlay hook on the click pin. There was nowhere to
--    record that choice, so generateDesignBrief took "every assigned
--    keyword that is not primary, first five" and the task was a decision
--    with no effect. `is_overlay` on url_keywords makes it real, and the
--    brief falls back to the old behaviour when nothing has been marked —
--    so a store that never touches the task behaves exactly as before.
--
-- 2. Seasonality on the keyword (P4.1.2).
--    Peak windows lived on organic.urls, which meant filling the same
--    "wool scarves peak in November" fact in again for every URL that uses
--    the term. The keyword is where it belongs: one entry per term, and a
--    URL inherits it from its primary keyword. The URL columns stay — a
--    URL can be seasonal for a reason that has nothing to do with its
--    keyword (a dated campaign, a launch), and that is a different fact.

ALTER TABLE organic.url_keywords
  ADD COLUMN IF NOT EXISTS is_overlay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organic.url_keywords.is_overlay IS
  'P4.1.8 — this term is a text-overlay hook for the click pin. When no row '
  'is marked, generateDesignBrief falls back to the first five non-primary '
  'keywords, which is what it did before the column existed.';

-- The primary keyword is never an overlay hook: the overlay is a
-- descriptive long-tail phrase somebody reads on an image, and the primary
-- keyword already opens the title.
ALTER TABLE organic.url_keywords
  DROP CONSTRAINT IF EXISTS url_keywords_overlay_not_primary;
ALTER TABLE organic.url_keywords
  ADD CONSTRAINT url_keywords_overlay_not_primary
  CHECK (NOT (is_overlay AND is_primary));

ALTER TABLE organic.keywords
  ADD COLUMN IF NOT EXISTS peak_window_start date,
  ADD COLUMN IF NOT EXISTS peak_window_end   date;

COMMENT ON COLUMN organic.keywords.peak_window_start IS
  'P4.1.2 — when demand for this term peaks. Set once per term rather than '
  'once per URL. A URL with no peak window of its own inherits this from '
  'its primary keyword.';

-- Publishing must start six to ten weeks ahead of the peak (build
-- reference section 2, the HARD RULES table). Storing the window rather
-- than a single date lets a term peak across a range, which most do.
ALTER TABLE organic.keywords
  DROP CONSTRAINT IF EXISTS keywords_peak_window_ordered;
ALTER TABLE organic.keywords
  ADD CONSTRAINT keywords_peak_window_ordered
  CHECK (
    peak_window_start IS NULL
    OR peak_window_end IS NULL
    OR peak_window_end >= peak_window_start
  );

CREATE INDEX IF NOT EXISTS keywords_peak_window_idx
  ON organic.keywords (org_id, peak_window_start)
  WHERE peak_window_start IS NOT NULL;
