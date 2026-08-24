-- STAGE 3d · cost per store.
--
-- Brief 2.5 asks for hours from time_spent_min measured against the
-- retainer. The hours are already recorded on client_tasks; the retainer
-- had nowhere to live, so margin per store could not be computed at all —
-- which is also what blocks the owner test in part 7 ("which stores make
-- money, which lose money").
--
-- Deliberately nullable. A store with no retainer recorded is not a store
-- on zero, and the difference has to survive into the UI: an unknown
-- retainer renders as "not recorded", never as a €0 margin that would put
-- a healthy account at the top of the loss-making list.
--
-- Currency is stored per store rather than assumed. It follows the same
-- rule as the paid side of this codebase: amounts are never converted,
-- they stay in the currency they were agreed in.

ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS monthly_retainer numeric,
  ADD COLUMN IF NOT EXISTS retainer_currency text NOT NULL DEFAULT 'EUR',
  -- What an hour of delivery costs us. Used for margin; nullable for the
  -- same reason as the retainer.
  ADD COLUMN IF NOT EXISTS hourly_cost numeric;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_settings_retainer_nonneg'
  ) THEN
    ALTER TABLE organic.client_settings
      ADD CONSTRAINT client_settings_retainer_nonneg
      CHECK (monthly_retainer IS NULL OR monthly_retainer >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_settings_hourly_cost_nonneg'
  ) THEN
    ALTER TABLE organic.client_settings
      ADD CONSTRAINT client_settings_hourly_cost_nonneg
      CHECK (hourly_cost IS NULL OR hourly_cost >= 0);
  END IF;
END $$;

COMMENT ON COLUMN organic.client_settings.monthly_retainer IS
  'Agreed monthly fee in retainer_currency. NULL means not recorded — never treat as zero.';
COMMENT ON COLUMN organic.client_settings.hourly_cost IS
  'Internal cost of one delivery hour, for margin. NULL means not recorded.';
