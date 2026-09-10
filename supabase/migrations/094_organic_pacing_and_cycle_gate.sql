-- 094 — Pacing en de cycle-poort, na module 4 (Pinning Strategy & Systems,
--       13-08-2026) naast de bestaande bouw te hebben gelegd.
--
-- Vier besluiten van Tristan, 10-09-2026:
--
--   1. Het dagplafond gaat van 20 naar 5 pins per dag PER STORE. De training
--      leert 1-5/dag voor een nieuw account en 2-10/dag voor een gevestigd
--      account; 5 is genoeg en houdt beide klassen in de veilige helft.
--      150 pins per maand per store is de bovengrens die daaruit volgt.
--
--   2. De accountklasse blijft afgeleid, maar een handmatige keuze wint
--      voortaan. recompute_account_classes() draaide zonder WHERE en
--      overschreef bij elke intake-opslag de klasse van ELKE store in de
--      tabel -- ook eentje die iemand bewust had gezet. De grens gaat
--      bovendien van een jaar naar zes maanden: ouder dan zes maanden is
--      gevestigd. De inactiviteitsregel blijft (>6 maanden stil = nieuw),
--      want die kost niets en beschermt tegen een oud maar dood account.
--
--   3. Boards per URL: de methode zegt 4-5, de poort eiste er 5. Vier is
--      genoeg om de poort te openen.
--
--   4. En de poort moet te omzeilen zijn. Een store met één product haalt
--      vier boards nooit, en die mag niet voor altijd buiten fase 4 staan.
--      De omzeiling vraagt een reden en is zichtbaar; de cooldown wordt er
--      NIET mee overruled -- dat is de regel die voorkomt dat onze eigen
--      pins tegen elkaar in concurreren, en die is niet aan de voorraad
--      URLs gerelateerd.

-- ── 1. Dagplafond 20 → 5 ────────────────────────────────────────────────
UPDATE organic.client_settings SET daily_pin_target = 5 WHERE daily_pin_target > 5;

ALTER TABLE organic.client_settings
  DROP CONSTRAINT IF EXISTS client_settings_daily_pin_target_check;
ALTER TABLE organic.client_settings
  ADD CONSTRAINT client_settings_daily_pin_target_check
  CHECK (daily_pin_target >= 1 AND daily_pin_target <= 5);

CREATE OR REPLACE FUNCTION organic.check_daily_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_org uuid;
  v_target int;
  v_count int;
  v_effective int;
BEGIN
  SELECT w.org_id INTO v_org FROM organic.waterfalls w WHERE w.id = new.waterfall_id;
  SELECT daily_pin_target INTO v_target FROM organic.client_settings WHERE org_id = v_org;
  -- Platform-level hard ceiling wins over any per-client target.
  v_effective := LEAST(COALESCE(v_target, 1), 5);
  SELECT count(*) INTO v_count
    FROM organic.pins p
    JOIN organic.waterfalls w2 ON w2.id = p.waterfall_id
   WHERE w2.org_id = v_org
     AND p.scheduled_date = new.scheduled_date
     AND p.id IS DISTINCT FROM new.id
     AND p.status <> 'CANCELLED';
  IF v_count >= v_effective THEN
    RAISE EXCEPTION 'Dagplafond bereikt: % pins op % (effective cap %, per-client target %)',
      v_count, new.scheduled_date, v_effective, v_target;
  END IF;
  RETURN new;
END;
$function$;

-- ── 2. Accountklasse: afgeleid, tenzij iemand hem zelf zet ──────────────
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS account_class_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organic.client_settings.account_class_manual IS
  'Iemand heeft de klasse zelf gekozen; recompute_account_classes() laat die met rust.';

CREATE OR REPLACE FUNCTION organic.recompute_account_classes()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE organic.client_settings SET
    account_class = CASE
      WHEN account_created_date IS NULL THEN 'NEW'::organic.account_class
      WHEN account_created_date > current_date - interval '6 months' THEN 'NEW'::organic.account_class
      WHEN last_activity_date   < current_date - interval '6 months' THEN 'NEW'::organic.account_class
      ELSE 'ESTABLISHED'::organic.account_class
    END,
    spacing_hours = CASE
      WHEN account_created_date IS NULL THEN 48
      WHEN account_created_date > current_date - interval '6 months' THEN 48
      WHEN last_activity_date   < current_date - interval '6 months' THEN 48
      ELSE 24
    END,
    updated_at = now()
  WHERE NOT account_class_manual;
END;
$function$;

-- ── 3. De opbouw: wanneer mag een store omhoog ──────────────────────────
-- Kolom bestond al en werd door niets gelezen. Twee weken op één stand is
-- de stap; de datum wordt opnieuw gezet zodra het doel verandert.
UPDATE organic.client_settings
   SET scale_up_eligible_date = COALESCE(onboarded_date, current_date) + interval '14 days'
 WHERE scale_up_eligible_date IS NULL;

COMMENT ON COLUMN organic.client_settings.scale_up_eligible_date IS
  'Vanaf deze datum mag daily_pin_target een stap omhoog (max 5). Wordt op +14 dagen gezet zodra het doel wijzigt.';

-- ── 4. De poort: vier boards, en een zichtbare omzeiling ────────────────
ALTER TABLE organic.urls
  ADD COLUMN IF NOT EXISTS gate_override_reason text,
  ADD COLUMN IF NOT EXISTS gate_override_at     timestamptz;

COMMENT ON COLUMN organic.urls.gate_override_reason IS
  'Waarom deze URL een cycle in mocht zonder de poort te halen. Verplicht bij een omzeiling; blijft zichtbaar op de cycle.';

CREATE OR REPLACE VIEW organic.urls_selectable AS
  SELECT u.id,
         u.org_id,
         u.topic_id,
         u.url,
         u.type,
         u.funnel_stage,
         u.name,
         u.reason,
         u.reason_note,
         u.is_seasonal,
         u.peak_window_start,
         u.peak_window_end,
         u.last_waterfall_end,
         u.cooldown_until,
         u.created_at,
         (u.cooldown_until IS NULL OR u.cooldown_until <= CURRENT_DATE) AS cooldown_clear,
         COALESCE(ub.board_count, 0::bigint) AS assigned_boards,
         COALESCE(tc.is_covered, false) AS topic_covered,
         -- De cooldown geldt altijd. Topic-dekking en het aantal boards zijn
         -- te omzeilen met een reden: een store met één product haalt ze
         -- nooit, en die mag niet permanent buiten fase 4 staan.
         (u.cooldown_until IS NULL OR u.cooldown_until <= CURRENT_DATE)
           AND (
             u.gate_override_at IS NOT NULL
             OR (COALESCE(tc.is_covered, false) AND COALESCE(ub.board_count, 0::bigint) >= 4)
           ) AS is_selectable
    FROM organic.urls u
    LEFT JOIN ( SELECT url_boards.url_id, count(*) AS board_count
                  FROM organic.url_boards
                 GROUP BY url_boards.url_id) ub ON ub.url_id = u.id
    LEFT JOIN organic.topic_coverage tc ON tc.topic_id = u.topic_id;
