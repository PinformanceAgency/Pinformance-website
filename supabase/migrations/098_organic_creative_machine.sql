-- 098 — Johanne's "Pinterest Creative Machine", in het dashboard. PROEF.
--
-- Module 3 (11-08-2026) en de zip die ze deelde (pinterest-creative-machine,
-- Drive): een merk-brief plus 3-10 merkbeelden wordt een BRAND_STYLE_LOCK;
-- per campagne worden 1-5 Pinterest-inspiraties daardoorheen gefilterd, en
-- uit 1-3 productfoto's komt een bibliotheek van scenario's. Elk scenario
-- wordt een prompt die je met de productfoto in Google Flow plakt.
--
-- Haar app bewaarde alles in localStorage -- één browser, één persoon. Hier
-- staat het per store in de database, zodat het team er samen aan werkt.
-- Verder is de logica haar logica; de prompts staan letterlijk in
-- src/lib/organic/creative-machine.ts.
--
-- Een test (Tristan, 11-09-2026): bevalt het niet, dan gaat het er weer
-- uit. Verwijderen = deze twee tabellen droppen, de bestanden onder
-- creative-machine / creative/ weghalen en de link in OrganicSidebar.

CREATE TABLE IF NOT EXISTS organic.creative_brands (
  org_id        uuid        PRIMARY KEY,
  brief         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  brand_images  text[]      NOT NULL DEFAULT '{}',
  style_lock    jsonb,
  conflicts     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organic.creative_campaigns (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL,
  name               text        NOT NULL,
  inspiration_images text[]      NOT NULL DEFAULT '{}',
  insights           jsonb,
  config             jsonb       NOT NULL DEFAULT '{"total":40,"fullHuman":14,"partialHuman":14,"productOnly":12,"directives":""}'::jsonb,
  product_images     text[]      NOT NULL DEFAULT '{}',
  scenarios          text[]      NOT NULL DEFAULT '{}',
  used_scenarios     text[]      NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_campaigns_org ON organic.creative_campaigns (org_id, created_at);

ALTER TABLE organic.creative_brands    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic.creative_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='creative_brands' AND policyname='creative_brands_read_authenticated') THEN
    CREATE POLICY "creative_brands_read_authenticated" ON organic.creative_brands
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='creative_campaigns' AND policyname='creative_campaigns_read_authenticated') THEN
    CREATE POLICY "creative_campaigns_read_authenticated" ON organic.creative_campaigns
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
