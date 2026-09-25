-- 111: de linkverkorter-check kijkt naar de host, niet naar de hele URL
--
-- no_shortener was een ongeankerde regex: url !~* '(bit\.ly|tinyurl|t\.co|...)'.
-- "t.co" staat midden in josephviolet.com (violeT.COm), dus elke URL van
-- Joseph Violet werd geweigerd met "violates check constraint no_shortener".
-- In het scherm las dat als "ik heb een URL toegevoegd en hij komt niet in
-- Start new cycle", want de pool bleef leeg (25-09-2026). Hetzelfde gold voor
-- elk domein dat op een t eindigt vóór .com/.co.uk.
--
-- De check matcht nu alleen als de host zelf een verkorter is, zoals
-- upsertUrl() in phase4.ts het al deed (URL_SHORTENERS op de host).
-- Wat nu mag is een strikte deelverzameling van wat eerst mocht niet, dus
-- geen bestaande rij kan hierop stuklopen.

ALTER TABLE organic.urls DROP CONSTRAINT IF EXISTS no_shortener;
ALTER TABLE organic.urls ADD CONSTRAINT no_shortener CHECK (
  url !~* '^https?://(www\.)?(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|rebrand\.ly)(/|\?|#|:|$)'
);
