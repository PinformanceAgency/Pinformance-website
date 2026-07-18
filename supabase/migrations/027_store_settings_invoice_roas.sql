-- Media Buying Hub — refine zone logic per head of media buying:
--   red   = ROAS < BER (below breakeven — losing money)
--   orange = above BER but not yet green (profitable, sub-scale, or under InvoiceROAS)
--   green  = ROAS ≥ InvoiceROAS AND weekly revenue ≥ €5k (winning at scale)
--
-- Adds two fields per store:
--   invoice_roas         — the ROAS at which the store is "green"; typically
--                          higher than BER because BER only covers ad cost
--                          while invoice ROAS covers COGS/fees/etc.
--   attribution_setting  — which Pinterest attribution window this store's
--                          numbers are measured against, e.g. "30/1", "7/1".
--                          Feeds through to the daily metrics snapshot cron
--                          so numbers in the hub match Campaign Manager for
--                          each store's actual reporting setup.

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS invoice_roas          NUMERIC,
  ADD COLUMN IF NOT EXISTS attribution_setting   TEXT;
