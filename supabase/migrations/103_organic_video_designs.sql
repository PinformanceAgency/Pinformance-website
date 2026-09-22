-- 103 — een design mag een video zijn, en dan draagt de pin een mp4.
--
-- De hele organic-waterval is beeld-vormig gebouwd: vier designs, vier
-- micro-crops per design, sharp knipt ze, en `publishDuePins` maakt er een
-- image-pin van. De methode zegt over video niets — geen enkele regel in
-- ORGANIC_TASK_SPEC.md of de build reference gaat erover — dus dit is een
-- bewuste uitbreiding en geen methoderegel. Vastgelegd, want precies dit
-- soort toevoeging is drie maanden later niet meer van de methode te
-- onderscheiden.
--
-- Wat de klant aanleverde is een grote partij mp4's, en video's presteren op
-- Pinterest goed. Besloten 22-09-2026 (Tristan): **alleen D4 — de CLICK-pin —
-- kan video zijn.** D1-D3 blijven beeld met hun crops, zodat de freshness-
-- ladder van de methode intact blijft en één cyclus één video meeneemt.
--
-- Twee keuzes in de kolommen die de rest van de app overeind houden:
--
--   * `asset_path` blijft bij een video-design een **afbeelding**: het
--     posterframe. Daardoor blijft elke bestaande lezer werken — de QC-panels,
--     de kalender, het klantrapport, `identicalDesignGroups`, en de
--     `image_path IS NOT NULL`-voorwaarde waar de publicatie-cron, de
--     stuck-check en `scripts/check-publish-calendar.ts` op filteren. Een
--     polymorfe `asset_path` had al die plekken stil laten renderen op een
--     mp4-URL in een <img>.
--
--   * de mp4 zelf staat in een eigen kolom, op designs én op pins. Op de pin,
--     omdat de cron daar leest en de vier pins van een design ieder hun eigen
--     bestand kúnnen dragen — vandaag zetten we er hetzelfde bestand op, maar
--     de kolom maakt vier verschillende video's later een uitbreiding in
--     plaats van een migratie.
--
-- De consequentie die op het scherm hoort te staan en er ook staat: de vier
-- pins van een video-design dragen hetzelfde bestand op vier boards, met
-- dezelfde titel en beschrijving. Bij beeld is de crop het enige verschil
-- tussen die vier; bij video valt dat verschil weg en dat is niet te
-- verbergen.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'organic' AND t.typname = 'media_kind'
  ) THEN
    CREATE TYPE organic.media_kind AS ENUM ('IMAGE', 'VIDEO');
  END IF;
END $$;

ALTER TABLE organic.designs
  ADD COLUMN IF NOT EXISTS media_type       organic.media_kind NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN IF NOT EXISTS video_path       text,
  ADD COLUMN IF NOT EXISTS video_duration_s numeric,
  ADD COLUMN IF NOT EXISTS video_bytes      bigint;

ALTER TABLE organic.pins
  ADD COLUMN IF NOT EXISTS video_path text;

COMMENT ON COLUMN organic.designs.media_type IS
  'IMAGE (de methode) of VIDEO. Bij VIDEO is asset_path het posterframe en video_path de mp4; micro-crops gelden dan niet.';
COMMENT ON COLUMN organic.designs.asset_path IS
  'De afbeelding van het design. Bij media_type = VIDEO is dit het posterframe (eerste seconden), nooit de mp4 — elke lezer in de app rendert dit in een <img>.';
COMMENT ON COLUMN organic.designs.video_path IS
  'Publieke URL van de mp4 in de pin-images bucket. Alleen gevuld bij media_type = VIDEO.';
COMMENT ON COLUMN organic.designs.video_duration_s IS
  'Duur in seconden, gemeten in de browser bij het uploaden. Pinterest weigert onder 4s en boven 15 minuten.';
COMMENT ON COLUMN organic.pins.video_path IS
  'De mp4 die deze pin publiceert. NULL = image-pin (image_path). Gevuld bij het uitdelen van de media over de zestien pins, net als image_path.';

-- Een mp4 op een design dat als beeld is bedoeld is geen halve toestand maar
-- een fout: `publishDuePins` zou dan een image-pin van het posterframe maken
-- en de video nooit versturen, zonder één foutmelding.
ALTER TABLE organic.designs
  DROP CONSTRAINT IF EXISTS designs_video_only_when_video;
ALTER TABLE organic.designs
  ADD CONSTRAINT designs_video_only_when_video
  CHECK (media_type = 'VIDEO' OR video_path IS NULL);

-- Onder de vier seconden weigert Pinterest de pin, en 15 minuten is de bovengrens.
-- Ondergrens hier op de duur zelf, niet op "is er een duur": een oudere rij of
-- een browser die de metadata niet gaf, mag geen migratie laten vallen.
ALTER TABLE organic.designs
  DROP CONSTRAINT IF EXISTS designs_video_duration_sane;
ALTER TABLE organic.designs
  ADD CONSTRAINT designs_video_duration_sane
  CHECK (video_duration_s IS NULL OR (video_duration_s > 0 AND video_duration_s <= 900));

-- De cron pakt een pin op `status = SCHEDULED AND image_path IS NOT NULL`.
-- Een video-pin heeft altijd een posterframe, dus die voorwaarde blijft
-- kloppen; wat erbij moet is dat een pin van een video-design ook echt zijn
-- mp4 heeft. Index zodat de join in de due-query goedkoop blijft.
CREATE INDEX IF NOT EXISTS designs_media_type_idx
  ON organic.designs (media_type)
  WHERE media_type = 'VIDEO';
