-- 108 — wie de pin echt heeft gepind, en één rij per pin.
--
-- Gemeten op Fit Cherries, 22-09-2026:
--
--     10.840 rijen · 1.896 unieke pin-URL's · 1.399 verschillende pinners
--     743 rijen waarvan de pinner één van onze tien concurrenten is
--
-- De grootste "pinners" in die export zijn poshmark (445), cosabella (405),
-- mercarius (368), preview_ae_com (300) en zalando (261). Dat is geen dubbele
-- import: het zijn **keyword-exports**. PinClicks geeft de pins die voor een
-- zoekterm bovenaan staan, en dat zijn de pins van wie dan ook — niet die van
-- het account waar de operator het bestand naast legde. De importer koppelde
-- elk bestand aan één concurrent, dus staat 93% van de rijen onder een
-- concurrent die hem nooit heeft gepind, en staat dezelfde populaire pin onder
-- tien concurrenten omdat hij in tien exports voorkwam.
--
-- Wat daar fout aan is, is het **label** en niet de data. Die 1.896 pins zijn
-- echte niche-research: welke pins het in deze niche doen, op welke boards ze
-- staan, met hoeveel saves. Precies wat `loadAccountBrief()` eruit haalt (de
-- drukste boards) en waar P2.2.1 over redeneert. Weggooien zou research
-- weggooien. Maar "10.840 pins van tien concurrenten" is een getal waar
-- vervolgens beleid op wordt gemaakt, en dat is niet waar.
--
-- Dus: de echte pinner komt uit `raw` in een eigen kolom, en elke pin staat nog
-- één keer. Vanaf nu is de vraag "is deze pin van een concurrent" een join en
-- geen aanname.
--
-- De unieke index verhuist van (competitor_id, pin_url) naar (org_id, pin_url).
-- Dezelfde pin twee keer in één store is één pin, welk bestand hem ook
-- aandroeg; met de oude index kon hij tien keer landen. Het ontdubbelen zelf
-- doet `scripts/fix-competitor-pin-owners.ts`, met een dry run, want het
-- verwijdert rijen en dat hoort niet ongezien in een migratie te gebeuren.

ALTER TABLE organic.competitor_pins
  ADD COLUMN IF NOT EXISTS pinner_username text,
  ADD COLUMN IF NOT EXISTS pinner_name     text;

COMMENT ON COLUMN organic.competitor_pins.pinner_username IS
  'Wie de pin werkelijk heeft gepind, uit de export (raw->>''pinner username''). De competitor_id zegt alleen naast welk bestand hij lag: bij een keyword-export is dat 93% van de tijd iemand anders.';
COMMENT ON COLUMN organic.competitor_pins.pinner_name IS
  'De weergavenaam van diezelfde pinner, voor de schermen.';

-- Sneller filteren op "van een van onze concurrenten", wat de bibliotheek en de
-- design brief nu per store doen.
CREATE INDEX IF NOT EXISTS competitor_pins_pinner_idx
  ON organic.competitor_pins (org_id, lower(pinner_username));

COMMENT ON COLUMN organic.competitor_pins.competitor_id IS
  'Het concurrent-record waar dit bestand bij is ingelezen. NIET per definitie de eigenaar van de pin — zie pinner_username. Blijft staan omdat het vertelt uit welke export een rij komt.';
