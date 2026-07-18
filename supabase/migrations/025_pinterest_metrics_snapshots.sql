-- Media Buying Hub — Task 5.1: daily paid-metrics snapshots.
--
-- The historical fact table every hub feature reads from: zones (Task 2),
-- benchmarks (Task 4), week-over-week + zone-movers (Task 5), and the
-- exception engine (Task 6). One row per (org, entity, snapshot_date).
--
-- `entity_type = 'account'` rolls up the whole ad account for the day — that's
-- the row zones + benchmarks aggregate against. Campaign/ad_group/ad rows are
-- there for drill-downs (top/bottom, naming explorer, movers).
--
-- Idempotent: re-running today overwrites today's row via UNIQUE.

CREATE TABLE IF NOT EXISTS pinterest_metrics_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id     TEXT NOT NULL,
  entity_type       TEXT NOT NULL CHECK (entity_type IN ('account','campaign','ad_group','ad')),
  entity_id         TEXT NOT NULL,
  snapshot_date     DATE NOT NULL,
  -- Denormalized so each row is self-describing.
  entity_name       TEXT,
  currency          TEXT,
  spend             NUMERIC NOT NULL DEFAULT 0,
  revenue           NUMERIC NOT NULL DEFAULT 0,
  conversions       INTEGER NOT NULL DEFAULT 0,
  impressions       INTEGER NOT NULL DEFAULT 0,
  clicks            INTEGER NOT NULL DEFAULT 0,
  -- Derived-on-write so hub queries never have to divide by zero at read time.
  roas              NUMERIC,
  cpm               NUMERIC,
  cpc               NUMERIC,
  ctr               NUMERIC,
  cpa               NUMERIC,
  raw               JSONB,
  inserted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, entity_type, entity_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_pms_org_date
  ON pinterest_metrics_snapshots (org_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pms_type_date
  ON pinterest_metrics_snapshots (entity_type, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pms_entity
  ON pinterest_metrics_snapshots (entity_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_pms_org_type_date
  ON pinterest_metrics_snapshots (org_id, entity_type, snapshot_date DESC);

ALTER TABLE pinterest_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON pinterest_metrics_snapshots FOR SELECT
  USING (org_id = public.user_org_id() OR public.is_agency_admin());

CREATE POLICY "agency_manages_all" ON pinterest_metrics_snapshots FOR ALL
  USING (public.is_agency_admin());
