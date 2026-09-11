-- 097 — Board warming zoals Johanne het leert, met een plan dat bewaard wordt.
--
-- Module 2 (06-08-2026, 1:05–1:14): een nieuw board blijft geheim, wordt
-- "gewarmd" met 10 tot 15 pins van de klant zelf -- eerst pins die al op het
-- account staan, anders via de Pinterest-widget vanaf de eigen website -- en
-- gaat pas daarna publiek. Nooit content van een concurrent. Module 4 (1:21)
-- voegt toe: ook op een geheim board moet elke pin bij het board passen.
--
-- P3.3.6 berekende een voorstel en gooide het weg: er was geen tabel voor.
-- P3.3.7 kreeg daardoor nooit iets mee en viel om met "r is not iterable".
-- Deze tabel is het plan: welke eigen pin op welk board, waarom, en wat er
-- van geworden is.
--
--   PROPOSED  voorgesteld door het systeem, nog niet bekeken
--   APPROVED  door een mens gekozen (P3.3.6: "Human: chooses 10–15 own pins")
--   REMOVED   door een mens weggehaald -- blijft staan zodat een nieuw
--             voorstel dezelfde pin niet opnieuw aandraagt
--   SAVED     staat op het board (POST /pins/{id}/save)
--   FAILED    kon niet (pin bestaat niet meer, geweigerd); error zegt waarom
--
-- De cron (organic-seed-boards) zet alleen APPROVED rijen op Pinterest, en
-- nooit meer dan tien per store per dag (Tristan, 11-09-2026).

CREATE TABLE IF NOT EXISTS organic.seed_plan (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid        NOT NULL,
  board_id         uuid        NOT NULL REFERENCES organic.boards(id) ON DELETE CASCADE,
  pinterest_pin_id text        NOT NULL,
  pin_title        text,
  pin_image_url    text,
  pin_link         text,
  rank             smallint    NOT NULL,
  reason           text,
  status           text        NOT NULL DEFAULT 'PROPOSED'
                   CHECK (status IN ('PROPOSED','APPROVED','REMOVED','SAVED','FAILED')),
  saved_pin_id     text,
  saved_at         timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (board_id, pinterest_pin_id)
);

CREATE INDEX IF NOT EXISTS seed_plan_org_status ON organic.seed_plan (org_id, status);
CREATE INDEX IF NOT EXISTS seed_plan_org_saved  ON organic.seed_plan (org_id, saved_at) WHERE saved_at IS NOT NULL;

ALTER TABLE organic.seed_plan ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='seed_plan' AND policyname='seed_plan_read_authenticated') THEN
    CREATE POLICY "seed_plan_read_authenticated" ON organic.seed_plan
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- En de trigger die een board "publiek" maakte zonder het Pinterest te
-- vertellen. auto_publish_board() zette status op PUBLIC zodra pin_count de
-- tien haalde -- alleen in deze tabel. Op Pinterest bleef het board verborgen
-- terwijl elk scherm PUBLIC zei. Bij Fit Cherries op 11-09-2026 zichtbaar aan
-- "Products": een verborgen catalogusboard met 191.632 pins, dat hier PUBLIC
-- werd op het moment dat zijn pin_count werd bijgewerkt.
--
-- Publiek gaan gebeurt nu in de code, op Pinterest eerst (PATCH /boards/{id})
-- en daarna hier: de seeding-cron doet het per board zodra het tien pins
-- heeft, en P3.3.8 is de handmatige ronde. De status in deze tabel volgt wat
-- Pinterest zegt; hij loopt er niet meer op vooruit.
DROP TRIGGER IF EXISTS trg_org_auto_publish ON organic.boards;
DROP FUNCTION IF EXISTS organic.auto_publish_board();
