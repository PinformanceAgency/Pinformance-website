-- 095 — Een board dat de klant al heeft, mag opgeschreven worden zoals het is.
--
-- `public_needs_seeding` zegt: een PUBLIC board heeft minstens 10 pins. Dat
-- is een regel van de methode over boards die wij bouwen -- een board blijft
-- verborgen tot het geseed is -- en die regel klopt.
--
-- Alleen gold hij ook voor boards die uit het hoofddashboard zijn
-- geïmporteerd (origin MIGRATED, legacy_board_id gevuld). Die bestaan al op
-- het account van de klant, met de privacy die de klant ze heeft gegeven, en
-- die kunnen we daardoor niet opschrijven zoals ze zijn. Gevolg bij Fit
-- Cherries op 10-09-2026: 28 boards mét hun echte pinterest_board_id stonden
-- op status PLANNED -- "ontworpen, nog niet aangemaakt" -- waardoor de
-- aanmaakplanner ze in de rij zette en "create boards today" een tweede
-- "On-Sale (NL & BE)" op het account van de klant zou hebben gezet.
--
-- De regel blijft dus staan voor alles wat de methode zelf aanmaakt, en geldt
-- niet voor wat er al was.

ALTER TABLE organic.boards DROP CONSTRAINT IF EXISTS public_needs_seeding;
ALTER TABLE organic.boards
  ADD CONSTRAINT public_needs_seeding
  CHECK (
    status <> 'PUBLIC'::organic.board_status
    OR pin_count >= 10
    OR legacy_board_id IS NOT NULL
  );

COMMENT ON CONSTRAINT public_needs_seeding ON organic.boards IS
  'Een board dat de methode bouwt gaat pas PUBLIC na 10 pins. Geldt niet voor geimporteerde boards: die bestaan al op het account van de klant en worden opgeschreven zoals ze zijn.';
