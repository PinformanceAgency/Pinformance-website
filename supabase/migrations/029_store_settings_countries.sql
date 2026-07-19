-- Media Buying Hub — allow a store to run in multiple countries.
--
-- Some stores serve more than one market (e.g. NL + BE, or US + CA). The
-- singular `country` column stays for backwards compatibility with older
-- rows and code paths; going forward the source of truth is `countries`
-- as a TEXT[] and `country` mirrors countries[0] on writes.
--
-- Existing rows with a `country` value get a one-element `countries` array
-- so filters + benchmarks keep working without a code deploy.

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS countries TEXT[];

UPDATE store_settings
   SET countries = ARRAY[country]
 WHERE country IS NOT NULL
   AND (countries IS NULL OR array_length(countries, 1) IS NULL);

-- GIN index so "which stores run in NL?" (countries @> ARRAY['NL']) is fast
-- even as the fleet grows.
CREATE INDEX IF NOT EXISTS idx_store_settings_countries
  ON store_settings USING GIN (countries);
