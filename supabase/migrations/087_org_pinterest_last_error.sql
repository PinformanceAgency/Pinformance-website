-- 087 — remember why a store's pins are not going out.
--
-- WHY
-- ---
-- When post-pins fails on a store, the reason goes into the run's JSON
-- response and nowhere else. Nobody reads a cron's response body, so a store
-- can be blocked for weeks with every screen in the app showing it as merrily
-- "scheduled". petcura was: 40 pins queued, a live token, a live board, and
-- every create answered
--
--   403 {"code":29,"message":"Apps with Trial access may not create Pins in
--        production https://api.pinterest.com - use API Sandbox ... instead."}
--
-- Each store connects through its own Pinterest app, and a new app starts on
-- Trial access. Until Pinterest grants Standard access that app cannot create
-- pins in production at all — no amount of retrying changes it, and no screen
-- said so. On 27-08-2026 the cron had been retrying petcura three times per
-- pin, every fifteen minutes, since the store was onboarded.
--
-- These two columns make that visible and durable: the cron writes the reason
-- it stopped, and clears it the moment a pin posts. Read them on /integrations
-- and in any "why is nothing going out" investigation.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS pinterest_last_error    text,
  ADD COLUMN IF NOT EXISTS pinterest_last_error_at timestamptz;

COMMENT ON COLUMN public.organizations.pinterest_last_error IS
  'Last store-level reason post-pins could not publish (trial access, auth, '
  'permission). Cleared on the next successful post. NULL means nothing is '
  'known to be wrong — not that the store is posting.';
COMMENT ON COLUMN public.organizations.pinterest_last_error_at IS
  'When pinterest_last_error was recorded.';
