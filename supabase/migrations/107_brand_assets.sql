-- 107 — D. Het merk: logo's, fonts, richtlijnen en wat niet mag.
--
-- De aanleiding staat in de audit van deze store: `audit-research-links.ts`
-- meldt voor Fit Cherries **FLOW 2 BROKEN — "P1.1.6 not collected: no brand
-- book, so nothing constrains colour or tone"**. Dat is geen codefout maar een
-- leeg formulier, en het gevolg is dat elke gegenereerde pin een generiek font
-- en een willekeurig palet krijgt. De klacht "de creatives zijn te zwak" begint
-- hier.
--
-- `organic.brand_rules` had al de woordkant: positionering, tone of voice,
-- pijlers, verboden woorden, goedgekeurde CTA's en dominante kleuren. Wat
-- ontbrak is alles wat je kunt aanleveren en vasthouden:
--
--   logos              meerdere varianten (op licht, op donker, alleen beeld).
--                      Een array, want elk merk heeft er meer dan één en de
--                      vraag is altijd "welke hier".
--   fonts              naam plus optioneel het bestand. De naam alleen is al
--                      bruikbaar (Canva heeft het font vaak), het bestand is
--                      voor als dat niet zo is.
--   guidelines         een PDF of een link naar het merkboek.
--   content_drive_url  waar de klant zijn eigen beeldmateriaal neerzet. Dat is
--                      de bron voor de DIRECT-route, en hij stond nergens.
--   guidelines_strict  mag de ontwerper afwijken, ja of nee. Dit verandert wat
--                      een waarschuwing betekent: bij een strikt merk is
--                      "kleur wijkt af" een blokkade voor een mens, bij een los
--                      merk een opmerking.
--   brand_notes        de regels die nergens anders passen: "logo altijd
--                      rechtsonder", "nooit modellen jonger dan 25".
--   banned_topics      onderwerpen die de AI moet mijden in SEO en copy. Naast
--                      `banned_words`, want een woord verbieden is iets anders
--                      dan een onderwerp verbieden: "afvallen" kan in tien
--                      formuleringen langskomen.
--
-- `asset_locations` (jsonb) blijft staan en wordt niet hergebruikt. Het is een
-- vrije zak waar van alles in kan zitten; deze kolommen hebben een vorm die de
-- design brief en de prompts kunnen lezen zonder te raden.

ALTER TABLE organic.brand_rules
  ADD COLUMN IF NOT EXISTS logos             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fonts             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS guidelines_url    text,
  ADD COLUMN IF NOT EXISTS guidelines_path   text,
  ADD COLUMN IF NOT EXISTS content_drive_url text,
  ADD COLUMN IF NOT EXISTS guidelines_strict boolean,
  ADD COLUMN IF NOT EXISTS brand_notes       text,
  ADD COLUMN IF NOT EXISTS banned_topics     text[];

COMMENT ON COLUMN organic.brand_rules.logos IS
  'Array van {variant, url, filename}. Meerdere varianten per merk; de design brief noemt ze bij naam zodat de ontwerper kiest in plaats van zoekt.';
COMMENT ON COLUMN organic.brand_rules.fonts IS
  'Array van {name, url?, usage?}. De naam alleen is al bruikbaar — Canva heeft de meeste fonts — het bestand is voor als dat niet zo is.';
COMMENT ON COLUMN organic.brand_rules.guidelines_strict IS
  'Mag er van het merkboek worden afgeweken? Verandert wat een waarschuwing betekent: bij true is een kleurafwijking een blokkade voor een mens, bij false een opmerking. NULL = niet gevraagd.';
COMMENT ON COLUMN organic.brand_rules.banned_topics IS
  'Onderwerpen die de AI mijdt in keywords en copy. Naast banned_words: een woord verbieden is iets anders dan een onderwerp verbieden.';
COMMENT ON COLUMN organic.brand_rules.content_drive_url IS
  'Waar de klant zijn eigen beeldmateriaal neerzet. De bron voor de DIRECT-route, en tot 22-09-2026 stond die nergens vast.';

-- Een array van objecten, geen array van losse strings: een logo zonder URL of
-- een font zonder naam is een rij waar de brief niets mee kan, en die fout valt
-- pas op als er een pin mee ontworpen moet worden.
ALTER TABLE organic.brand_rules
  DROP CONSTRAINT IF EXISTS brand_rules_logos_shape;
ALTER TABLE organic.brand_rules
  ADD CONSTRAINT brand_rules_logos_shape
  CHECK (jsonb_typeof(logos) = 'array');

ALTER TABLE organic.brand_rules
  DROP CONSTRAINT IF EXISTS brand_rules_fonts_shape;
ALTER TABLE organic.brand_rules
  ADD CONSTRAINT brand_rules_fonts_shape
  CHECK (jsonb_typeof(fonts) = 'array');
