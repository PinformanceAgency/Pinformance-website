-- 105 — C. Omzet die uit elkaar wordt gehouden, winnaars die terugkomen, en
-- trends die meegaan naar de volgende ronde.
--
-- Drie dingen, en de eerste is de belangrijkste omdat hij een fout voorkomt die
-- niet meer te herstellen is als hij eenmaal in een rapport staat.
--
-- 1. **Omzet heeft drie bakken, niet één.** `monthly_kpis.revenue` was één
--    getal. Pinterest's Conversion Insights kent drie soorten en ze betekenen
--    niet hetzelfde:
--
--      organic conversion   — de pin was de laatste klik, er stond geen
--                             advertentie tussen. Dit is organic omzet.
--      paid-assisted        — organic hielp, maar er is ook op een advertentie
--                             geklikt of die is gezien. NOOIT bij organic
--                             optellen: dan claimt organic omzet die de paid
--                             kant ook claimt, en de som van beide rapporten
--                             is groter dan de webshop.
--      paid-unassisted      — alleen paid. Staat hier alleen zodat de drie
--                             bakken bij elkaar de Pinterest-omzet vormen en
--                             je kunt zien of het klopt.
--
--    Alleen de eerste telt als organic omzet, en de UI zegt dat naast het
--    getal. `revenue` blijft staan (additief, niets weggooien) en blijft
--    leesbaar voor wat er al in stond.
--
-- 2. **Het attributievenster hoort bij het getal.** Pinterest laat je kiezen
--    tussen 1, 7, 30 of 60 dagen klik en 1 of 7 dagen view. Twee maanden met
--    verschillende vensters naast elkaar leggen is geen vergelijking, en op een
--    scherm is dat verschil onzichtbaar. Dus staat het per invoer opgeslagen en
--    waarschuwt het rapport als het tussen maanden verschilt.
--
-- 3. **Waar een cijfer vandaan komt.** API, met de hand, of uit een CSV. Een
--    getal dat iemand typte en een getal dat Pinterest gaf moeten niet op
--    elkaar lijken, want de nachtelijke pull mag het eerste nooit overschrijven
--    (de COALESCE in analytics-pull.ts doet dat al; deze kolom maakt het
--    leesbaar).
--
-- Plus de feedback-lus die fase 5 aan fase 4 vast moet knopen:
--
-- 4. **Een winnaar is een pin die iemand aanwees**, niet een pin die deze week
--    bovenaan staat. `winning_combinations` (de view) rangschikt op cijfers;
--    dat is een ranglijst en geen besluit. P5.2.1 vraagt om een besluit, en de
--    design brief van volgende maand hoort dat besluit te lezen.
--
-- 5. **Stijgende zoektermen uit Pinterest Trends** kunnen nergens heen. Ze
--    komen uit een tool die wij niet via de API kunnen lezen, dus ze worden
--    getypt — per maand, met de richting, zodat de volgende contentronde ze
--    meeneemt in plaats van dat ze in een Slack-bericht blijven hangen.

ALTER TABLE organic.monthly_kpis
  ADD COLUMN IF NOT EXISTS revenue_organic          numeric,
  ADD COLUMN IF NOT EXISTS revenue_paid_assisted    numeric,
  ADD COLUMN IF NOT EXISTS revenue_paid_unassisted  numeric,
  ADD COLUMN IF NOT EXISTS conversion_window_click  int,
  ADD COLUMN IF NOT EXISTS conversion_window_view   int,
  ADD COLUMN IF NOT EXISTS figures_source           text,
  ADD COLUMN IF NOT EXISTS figures_entered_by       uuid,
  ADD COLUMN IF NOT EXISTS figures_entered_at       timestamptz,
  ADD COLUMN IF NOT EXISTS figures_note             text;

COMMENT ON COLUMN organic.monthly_kpis.revenue_organic IS
  'Omzet waarbij de organic pin de laatste klik was, zonder advertentie ertussen. Dit is de enige bak die als organic omzet telt.';
COMMENT ON COLUMN organic.monthly_kpis.revenue_paid_assisted IS
  'Omzet waar organic aan meehielp maar paid ook bij betrokken was. Apart tonen, NOOIT bij organic optellen — anders claimen twee rapporten dezelfde omzet.';
COMMENT ON COLUMN organic.monthly_kpis.revenue_paid_unassisted IS
  'Alleen paid. Staat hier zodat de drie bakken samen de Pinterest-omzet vormen en de optelling controleerbaar is.';
COMMENT ON COLUMN organic.monthly_kpis.conversion_window_click IS
  'Attributievenster voor kliks in dagen (1, 7, 30 of 60). Twee maanden met verschillende vensters zijn niet vergelijkbaar.';
COMMENT ON COLUMN organic.monthly_kpis.conversion_window_view IS
  'Attributievenster voor views in dagen (1 of 7).';
COMMENT ON COLUMN organic.monthly_kpis.figures_source IS
  'API, MANUAL of CSV — waar de conversie- en omzetcijfers van deze maand vandaan komen. De API kan ze niet geven, dus in de praktijk MANUAL of CSV.';

ALTER TABLE organic.monthly_kpis
  DROP CONSTRAINT IF EXISTS monthly_kpis_figures_source_chk;
ALTER TABLE organic.monthly_kpis
  ADD CONSTRAINT monthly_kpis_figures_source_chk
  CHECK (figures_source IS NULL OR figures_source IN ('API', 'MANUAL', 'CSV'));

-- De vensters die Pinterest aanbiedt. Een 14 hier is een typefout die verder
-- nooit meer opvalt, en hij maakt elke vergelijking eromheen ongeldig.
ALTER TABLE organic.monthly_kpis
  DROP CONSTRAINT IF EXISTS monthly_kpis_window_chk;
ALTER TABLE organic.monthly_kpis
  ADD CONSTRAINT monthly_kpis_window_chk
  CHECK ((conversion_window_click IS NULL OR conversion_window_click IN (1, 7, 30, 60))
     AND (conversion_window_view  IS NULL OR conversion_window_view  IN (1, 7)));

-- Negatieve omzet bestaat niet in deze bakken (een creditering hoort in de
-- boekhouding, niet in een maandrapportage over bereik).
ALTER TABLE organic.monthly_kpis
  DROP CONSTRAINT IF EXISTS monthly_kpis_revenue_nonneg;
ALTER TABLE organic.monthly_kpis
  ADD CONSTRAINT monthly_kpis_revenue_nonneg
  CHECK (COALESCE(revenue_organic, 0) >= 0
     AND COALESCE(revenue_paid_assisted, 0) >= 0
     AND COALESCE(revenue_paid_unassisted, 0) >= 0);

-- ------------------------------------------------------------- winnaars ----

ALTER TABLE organic.pins
  ADD COLUMN IF NOT EXISTS is_winner        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS winner_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_note      text;

COMMENT ON COLUMN organic.pins.is_winner IS
  'Aangewezen door een mens in P5.2.1, niet berekend. De design brief van de volgende ronde leest dit, naast de concurrentie-referenties.';
COMMENT ON COLUMN organic.pins.winner_note IS
  'Waarom deze pin werkte, in de woorden van wie hem aanwees. Dat is wat de volgende brief kan hergebruiken; een vinkje zonder reden kan dat niet.';

ALTER TABLE organic.pins
  DROP CONSTRAINT IF EXISTS pins_winner_needs_date;
ALTER TABLE organic.pins
  ADD CONSTRAINT pins_winner_needs_date
  CHECK (is_winner = false OR winner_marked_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS pins_winner_idx
  ON organic.pins (design_id)
  WHERE is_winner;

-- --------------------------------------------------------------- trends ----

CREATE TABLE IF NOT EXISTS organic.trend_inputs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- De maand waarin dit is opgemerkt, als eerste van de maand. Een trend is
  -- geen eeuwige waarheid: "stijgt" van drie maanden terug is geschiedenis.
  month       date NOT NULL,
  term        text NOT NULL,
  direction   text NOT NULL DEFAULT 'RISING',
  note        text,
  -- Gebruikt in een cyclus? Dan is de lus rond. Null = nog niet.
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trend_inputs_direction_chk CHECK (direction IN ('RISING', 'FALLING', 'SEASONAL_PEAK')),
  CONSTRAINT trend_inputs_term_chk CHECK (btrim(term) <> '')
);

-- Eén keer per term per maand per store; tweemaal invoeren is een vergissing
-- en geen tweede signaal.
CREATE UNIQUE INDEX IF NOT EXISTS trend_inputs_uniq
  ON organic.trend_inputs (org_id, month, lower(btrim(term)));

CREATE INDEX IF NOT EXISTS trend_inputs_org_month_idx
  ON organic.trend_inputs (org_id, month DESC);

COMMENT ON TABLE organic.trend_inputs IS
  'Stijgende zoektermen uit Pinterest Trends, met de hand ingevoerd — die tool is niet via de API te lezen. Per maand, zodat de volgende contentronde ze meeneemt.';
