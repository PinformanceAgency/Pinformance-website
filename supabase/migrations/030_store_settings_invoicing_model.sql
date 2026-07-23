-- Media Buying Hub — split the invoicing model per store so the zone engine
-- can flip its scale-gate from "weekly revenue floor" (revenue-fee brands) to
-- "weekly spend floor derived from a monthly minimum" (spend-fee brands).
--
-- Two models:
--   revenue_fee → agency invoices as % of revenue. Existing behaviour: green
--                 requires ROAS ≥ invoice ROAS AND weekly revenue ≥ 5k floor.
--   spend_fee   → agency invoices as % of spend. Green requires ROAS ≥ invoice
--                 ROAS AND weekly spend ≥ (min_monthly_spend / 4.33).
--
-- Everything defaults to revenue_fee so existing rows keep their current
-- classification without a code deploy.

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS invoicing_model   TEXT   NOT NULL DEFAULT 'revenue_fee',
  ADD COLUMN IF NOT EXISTS min_monthly_spend NUMERIC;

ALTER TABLE store_settings
  ADD CONSTRAINT store_settings_invoicing_model_check
  CHECK (invoicing_model IN ('revenue_fee', 'spend_fee'));
