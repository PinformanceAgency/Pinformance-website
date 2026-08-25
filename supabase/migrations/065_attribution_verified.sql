-- When was this store's attribution window last checked against Pinterest?
--
-- store_settings.attribution_setting is a hand-kept copy of a setting that
-- lives in Campaign Manager, and Pinterest does not expose it through the
-- API — the ad account object carries only id, name, owner, country,
-- currency and timestamps, and sending no window makes the API default to
-- 30/1 rather than use the account's own.
--
-- That makes a wrong window invisible to every automated check: the
-- dashboard and the API both use the stored value, so they agree with each
-- other while disagreeing with the platform. Icon Amsterdam sat at 30/1
-- for months while its account was configured 1/1, and nothing could have
-- caught it.
--
-- So the check becomes "has a person confirmed this recently", which is
-- answerable. verify-metrics reports stores that have never been confirmed
-- or whose confirmation has gone stale.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS attribution_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS attribution_verified_by text;

COMMENT ON COLUMN public.store_settings.attribution_verified_at IS
  'Last time attribution_setting was read off Campaign Manager and confirmed. NULL means never — the window is an assumption, not a fact.';
