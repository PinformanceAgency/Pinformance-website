-- 116 — een video-design mag tot vier versies dragen, één per pin.
--
-- Een beeld-design levert vier verschillende pins op doordat sharp er vier
-- micro-crops van knipt (A = het origineel, B/C/D = 96% vanuit een hoek). Een
-- mp4 kan niet geknipt worden, dus droegen de vier pins van een video-design
-- tot nu toe hetzelfde bestand op vier boards. Sinds 01-10-2026 mag elk design
-- video zijn (een waterfall van vier video's), en dan heeft een cyclus nog maar
-- vier unieke bestanden voor zestien pins.
--
-- Deze tabel is de video-tegenhanger van de crop: per design een versie B, C
-- en D naast versie A. Een versie hoeft geen nieuwe opname te zijn — een
-- andere snede, een andere openingsseconde, een andere overlay telt ook.
-- Optioneel: een pin waarvan de versie ontbreekt, krijgt versie A, dus één
-- video per design blijft gewoon werken (4, 8, 12 of 16 unieke video's).
--
-- **Versie A blijft op `organic.designs`** (video_path, asset_path als poster).
-- Daar lezen de QC-panels, de kalender, het rapport en de publish-checks al
-- op; een tweede plek voor A zou betekenen dat die twee uit elkaar kunnen
-- lopen. Deze tabel houdt alleen B, C en D.

CREATE TABLE IF NOT EXISTS organic.design_video_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id        uuid NOT NULL REFERENCES organic.designs(id) ON DELETE CASCADE,
  variant          text NOT NULL CHECK (variant IN ('B', 'C', 'D')),
  video_path       text NOT NULL,
  poster_path      text NOT NULL,
  filename         text,
  video_duration_s numeric CHECK (video_duration_s IS NULL OR (video_duration_s > 0 AND video_duration_s <= 900)),
  video_bytes      bigint,
  width            integer,
  height           integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, variant)
);

COMMENT ON TABLE organic.design_video_variants IS
  'Versies B/C/D van een video-design, één per pin (copy_variant). Versie A staat op organic.designs. Ontbreekt een versie, dan krijgt die pin versie A.';

ALTER TABLE organic.design_video_variants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='design_video_variants' AND policyname='design_video_variants_read_authenticated') THEN
    CREATE POLICY "design_video_variants_read_authenticated" ON organic.design_video_variants
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
