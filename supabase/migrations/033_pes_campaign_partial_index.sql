-- Partial index on campaign snapshots only. The full-table unique index
-- includes ads and ad_groups too (~970k extra rows), so the planner was
-- doing a Seq Scan of all 1.1M rows to compute team_paid_activity's DISTINCT
-- ON and LAG queries — 14s + 12s each pass. This partial index covers only
-- the ~140k campaign rows and gives us index-scan latency instead.

CREATE INDEX IF NOT EXISTS idx_pes_campaign_org_entity_date
    ON pinterest_entity_snapshots (org_id, entity_id, snapshot_date DESC)
    WHERE entity_type = 'campaign';
