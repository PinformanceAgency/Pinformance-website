-- 100 — the language every AI surface writes in, chosen per store.
--
-- May Cosmetics, 16-09-2026: within ONE cycle, D1 and D2 came back in Dutch
-- and D3 and D4 in English. Nothing was wrong with either — nothing in any
-- prompt ever said which language to use, so the model inferred it from
-- whatever context happened to dominate that call (the brand book, the
-- keyword, the intake text). That is not a setting anybody can see and it is
-- not stable across four calls, which is exactly how one cycle ends up
-- bilingual.
--
-- So it becomes a store-level fact, read by every generated surface: pin
-- title, description and tagline, board descriptions, the profile display
-- name and bio, and the design brief.
--
-- NULL is kept as a real state rather than defaulted to 'en' in place. A
-- store nobody has set writes English — deterministic, which is the whole
-- point — but every surface that uses the fallback SAYS it is a fallback
-- (the design brief lists it under gaps, the settings screen and the cycle
-- card name it). Stamping 'en' on 47 rows here would make the guess
-- indistinguishable from a decision, and the stores that need Dutch are
-- precisely the ones where that reads as correct until a client sees it.
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS primary_language text,
  ADD COLUMN IF NOT EXISTS market_country   text;

COMMENT ON COLUMN organic.client_settings.primary_language IS
  'ISO-639-1 code every AI-generated surface writes in (nl, en, de ...). NULL = not chosen; the app falls back to English and says so.';
COMMENT ON COLUMN organic.client_settings.market_country IS
  'ISO-3166-1 alpha-2 of the market the copy addresses (NL, BE, DE ...). Spelling, currency and seasonal references follow it. NULL = not chosen.';

-- Two letters, lower/upper as the standard writes them, so a typo in the
-- settings form cannot reach a prompt as "Dutch (nederlands)".
ALTER TABLE organic.client_settings
  DROP CONSTRAINT IF EXISTS client_settings_primary_language_chk;
ALTER TABLE organic.client_settings
  ADD CONSTRAINT client_settings_primary_language_chk
  CHECK (primary_language IS NULL OR primary_language ~ '^[a-z]{2}$');

ALTER TABLE organic.client_settings
  DROP CONSTRAINT IF EXISTS client_settings_market_country_chk;
ALTER TABLE organic.client_settings
  ADD CONSTRAINT client_settings_market_country_chk
  CHECK (market_country IS NULL OR market_country ~ '^[A-Z]{2}$');
