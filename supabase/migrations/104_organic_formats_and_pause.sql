-- 104 — B. Welk sóórt pin een design is, en een pauzeknop die de planning
-- niet weggooit.
--
-- Twee dingen die de content engine mist en die elkaar nodig hebben.
--
-- 1. **Het format van een design is nergens vastgelegd.** `designs` weet of
--    het een SAVE- of een CLICK-pin is (de 80/20-split) en sinds 103 of het
--    beeld of video is, maar niet of het een lifestylefoto, een infographic
--    of een kale productfoto is. Dat is precies wat er te weinig aan de
--    creatives is (review 22-09-2026), en het is ook de kolom die fase 5
--    straks nodig heeft om te zeggen of infographics beter presteren dan
--    productfoto's. Zonder deze kolom is die vraag onbeantwoordbaar, hoeveel
--    analytics er ook binnenkomt.
--
--    **Één taxonomie, niet twee** (Tristan, 22-09-2026). `grid_analyses` legt
--    per keyword al vast wat pagina één van Pinterest laat zien, in vijf
--    vlaggen: fmt_simple_pins, fmt_infographics, fmt_video_916,
--    fmt_pure_aesthetic, fmt_text_heavy. Die vijf zijn hier de eerste vijf
--    waarden, zodat het niche-grid en onze eigen designs in dezelfde woorden
--    praten en `formatsFromGrid()` een mapping is en geen vertaling. FLATLAY
--    en COLLAGE komen uit de opdracht en hebben in het grid geen vlag; die
--    worden dus nooit uit een grid afgeleid, alleen met de hand gekozen.
--
-- 2. **Een store stilzetten kon alleen door de planning te slopen.** Wie
--    slechte creatives wil vervangen voordat ze uitgaan, had geen andere
--    uitweg dan pins cancellen — en dan is de spreiding over weken, de
--    boardrotatie en de datums weg. Nu staat er een datum op: de
--    publicatie-cron slaat een gepauzeerde store over en laat alles staan
--    waar het staat, en de pin gaat uit op zijn eigen datum zodra de pauze
--    eraf is (of later, want de cron neemt `scheduled_date <= CURRENT_DATE`
--    en verliest dus niets).
--
--    Twee niveaus, bewust beide. Per **store** is wat gevraagd werd en is de
--    grote schakelaar. Per **cyclus** is het geval dat zich hier echt
--    voordoet: Fit Cherries publiceert uit twee cycli tegelijk, en als de
--    creatives van één daarvan slecht zijn, moet de andere door kunnen.
--    Een pauze op store-niveau zet ook de goede stil.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'organic' AND t.typname = 'creative_format'
  ) THEN
    CREATE TYPE organic.creative_format AS ENUM (
      -- De vijf die het niche-grid ook kent, in die woorden:
      'PRODUCT_SIMPLE',   -- fmt_simple_pins      — het product, kaal
      'INFOGRAPHIC',      -- fmt_infographics
      'LIFESTYLE',        -- fmt_pure_aesthetic   — in gebruik, in een scène
      'TEXT_OVERLAY',     -- fmt_text_heavy
      'VIDEO',            -- fmt_video_916
      -- En twee die het grid niet meet, dus alleen met de hand:
      'FLATLAY',
      'COLLAGE',
      'OTHER'
    );
  END IF;
END $$;

ALTER TABLE organic.designs
  ADD COLUMN IF NOT EXISTS format organic.creative_format,
  -- Gemeten bij het uploaden, niet ingevuld door een mens: de QC-check op
  -- resolutie en verhouding is alleen iets waard als het getal van het
  -- bestand zelf komt.
  ADD COLUMN IF NOT EXISTS width  int,
  ADD COLUMN IF NOT EXISTS height int;

COMMENT ON COLUMN organic.designs.format IS
  'Wat voor soort creative dit is. Dezelfde taxonomie als de vijf fmt_-vlaggen van grid_analyses, plus FLATLAY/COLLAGE/OTHER die het grid niet meet. NULL = nog niet gekozen; de design brief stelt er een voor.';
COMMENT ON COLUMN organic.designs.width IS
  'Breedte in pixels van het aangeleverde bestand, gemeten bij het uploaden. NULL = niet gemeten (oudere designs).';
COMMENT ON COLUMN organic.designs.height IS
  'Hoogte in pixels, zie width.';

ALTER TABLE organic.designs
  DROP CONSTRAINT IF EXISTS designs_dimensions_sane;
ALTER TABLE organic.designs
  ADD CONSTRAINT designs_dimensions_sane
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));

-- ---------------------------------------------------------------- pauze ----

ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS publishing_paused_at     timestamptz,
  ADD COLUMN IF NOT EXISTS publishing_pause_reason  text;

ALTER TABLE organic.waterfalls
  ADD COLUMN IF NOT EXISTS paused_at    timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text;

COMMENT ON COLUMN organic.client_settings.publishing_paused_at IS
  'Gezet = deze store publiceert niets, ongeacht de datums op de pins. De planning blijft staan; de cron slaat de store over. NULL = normaal.';
COMMENT ON COLUMN organic.client_settings.publishing_pause_reason IS
  'Waarom de store stilstaat, in de woorden van wie hem stilzette. Staat op elk scherm dat de pauze meldt.';
COMMENT ON COLUMN organic.waterfalls.paused_at IS
  'Gezet = alleen deze cyclus staat stil. Bedoeld voor een store die uit twee cycli publiceert en waarvan er één slechte creatives heeft.';
COMMENT ON COLUMN organic.waterfalls.pause_reason IS
  'Waarom deze cyclus stilstaat.';

-- Een reden zonder pauze is een halve toestand die op elk scherm als een
-- pauze leest; een pauze zonder reden stuurt de volgende persoon op zoek.
ALTER TABLE organic.client_settings
  DROP CONSTRAINT IF EXISTS client_settings_pause_reason_pairs;
ALTER TABLE organic.client_settings
  ADD CONSTRAINT client_settings_pause_reason_pairs
  CHECK (publishing_pause_reason IS NULL OR publishing_paused_at IS NOT NULL);

ALTER TABLE organic.waterfalls
  DROP CONSTRAINT IF EXISTS waterfalls_pause_reason_pairs;
ALTER TABLE organic.waterfalls
  ADD CONSTRAINT waterfalls_pause_reason_pairs
  CHECK (pause_reason IS NULL OR paused_at IS NOT NULL);

-- De due-query filtert hierop bij elke run, elk kwartier.
CREATE INDEX IF NOT EXISTS client_settings_paused_idx
  ON organic.client_settings (org_id)
  WHERE publishing_paused_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS waterfalls_paused_idx
  ON organic.waterfalls (id)
  WHERE paused_at IS NOT NULL;
