-- 106 — RLS op organic.trend_inputs, zoals elke organic-tabel die er sinds 091
-- bij is gekomen.
--
-- Nagelaten in 105. Het organic-schema is niet via PostgREST bereikbaar, dus de
-- anon-key kan er hoe dan ook niet bij — maar dat is een eigenschap van de
-- configuratie en niet van de tabel, en `form_drafts` (091), `seed_plan` (097)
-- en `monthly_kpis` staan allemaal aan. Een tabel die als enige uit de rij valt,
-- valt over een jaar niemand meer op.
--
-- Dezelfde vorm als 097: lezen mag voor authenticated, schrijven gaat via
-- service_role (dat RLS overslaat) omdat alle organic-writes door `organicPool()`
-- met de service-credentials gaan.

ALTER TABLE organic.trend_inputs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='trend_inputs' AND policyname='trend_inputs_read_authenticated') THEN
    CREATE POLICY "trend_inputs_read_authenticated" ON organic.trend_inputs
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
