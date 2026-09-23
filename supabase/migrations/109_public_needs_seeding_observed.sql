-- 109 — De regel geldt voor wat wij bouwen, niet voor wat wij waarnemen.
--
-- `public_needs_seeding` zegt: een PUBLIC board heeft minstens 10 pins. Dat is
-- een regel van de methode over boards die WIJ maken — een board blijft
-- verborgen tot het geseed is, en `goPublicIfWarm()` zet hem pas op PUBLIC bij
-- tien. Die regel klopt en blijft.
--
-- Maar dezelfde CHECK stond ook in de weg bij het OPSCHRIJVEN van een board
-- dat al op het account staat. `adoptExistingBoards()` neemt privacy en
-- pin_count over van Pinterest — precies zoals het hoort, de privacy van een
-- board is een feit over het account en niet iets wat wij beslissen — en een
-- klant die zelf een leeg PUBLIC board heeft aangemaakt is daarmee niet
-- vast te leggen.
--
-- Gemeten op Morenzio, 23-09-2026: de klant had zes lege PUBLIC boards, en
-- "Height Increasing Shoes for Men" zat in onze bibliotheek met zijn echte
-- pinterest_board_id. Adopteren wilde `status = PUBLIC, pin_count = 0`
-- schrijven, de CHECK weigerde dat, en omdat adoptie de eerste stap is van
-- `createBoardsToday()` viel de hele knop om met
--
--     new row for relation "boards" violates check constraint "public_needs_seeding"
--
-- Die store kon dus geen enkel board meer aanmaken. Niet één rij fout, de hele
-- run — en de melding zegt niets over de klant die een leeg board publiek
-- heeft gezet.
--
-- De grens ligt nu waar hij hoort: zolang een board alleen op papier staat
-- (geen pinterest_board_id) mag het niet PUBLIC heten, want dan is die status
-- een bewering van ons. Zodra het op het account staat is de status een
-- waarneming, en een waarneming moet altijd opgeschreven kunnen worden.
--
-- De uitzondering voor legacy_board_id uit 095 gaat daarin op: een
-- geïmporteerd board heeft per definitie een pinterest_board_id. Hij blijft
-- expliciet staan omdat hij losstaand leesbaar is.

ALTER TABLE organic.boards DROP CONSTRAINT IF EXISTS public_needs_seeding;
ALTER TABLE organic.boards
  ADD CONSTRAINT public_needs_seeding
  CHECK (
    status <> 'PUBLIC'::organic.board_status
    OR pin_count >= 10
    OR pinterest_board_id IS NOT NULL
    OR legacy_board_id IS NOT NULL
  );

COMMENT ON CONSTRAINT public_needs_seeding ON organic.boards IS
  'Een board dat nog op papier staat mag niet PUBLIC heten. Zodra het op Pinterest staat is de status een waarneming van het account en wordt hij opgeschreven zoals hij is; de methode-regel (pas PUBLIC bij 10 pins) wordt afgedwongen door goPublicIfWarm(), die eerst Pinterest PATCHt.';
