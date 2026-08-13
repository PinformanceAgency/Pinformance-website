-- Partial index for the ad snapshot rows the team_paid_activity RPC now
-- LAG-scans for ads_paused. Without it the RPC serialises through 500k+
-- ad snapshot rows and blows the pool query_timeout on the biggest advertisers.

CREATE INDEX IF NOT EXISTS idx_pes_ad_org_entity_date
    ON pinterest_entity_snapshots (org_id, entity_id, snapshot_date DESC)
    WHERE entity_type = 'ad';
