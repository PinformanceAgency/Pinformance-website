-- 042_fx_rates.sql
--
-- Daily ECB reference rates, used to express the EUR zone thresholds in each
-- store's own currency.
--
-- Amounts are NEVER converted: spend and revenue stay in the currency of the
-- Pinterest ad account, both in the dashboard and on the Monday board. Only
-- the THRESHOLD travels — a €20,000 monthly target becomes CHF 18,780 for a
-- Swiss account. Without this, every non-EUR store was measured against the
-- wrong number: a USD store had to clear $20,000 (≈ €17,300, far too lenient)
-- and a GBP store £20,000 (≈ €23,400, far too strict).
--
-- `per_eur` = units of `currency` for one EUR, i.e. exactly how the ECB
-- publishes it. EUR itself is stored as 1 so lookups need no special case.

CREATE TABLE IF NOT EXISTS fx_rates (
  rate_date   date        NOT NULL,
  currency    text        NOT NULL,
  per_eur     numeric     NOT NULL CHECK (per_eur > 0),
  source      text        NOT NULL DEFAULT 'ecb',
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_date, currency)
);

-- The hot query is "newest rate for this currency", so index that direction.
CREATE INDEX IF NOT EXISTS fx_rates_currency_date_idx
  ON fx_rates (currency, rate_date DESC);

-- Reference data, not org data: everyone signed in may read it, only the
-- service role writes it (the cron uses the admin client, which bypasses RLS).
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read" ON fx_rates;
CREATE POLICY "authenticated_read" ON fx_rates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed with the ECB rates of 2026-08-14 so the thresholds are already correct
-- on deploy, before the cron has run for the first time. Also the safety net
-- if the ECB feed is ever unreachable for a long stretch: the code falls back
-- to the newest row it can find rather than to a rate of 1.
INSERT INTO fx_rates (rate_date, currency, per_eur, source) VALUES
  ('2026-08-14', 'EUR', 1.0000, 'seed'),
  ('2026-08-14', 'USD', 1.1567, 'seed'),
  ('2026-08-14', 'CHF', 0.9390, 'seed'),
  ('2026-08-14', 'GBP', 0.8545, 'seed')
ON CONFLICT (rate_date, currency) DO NOTHING;
