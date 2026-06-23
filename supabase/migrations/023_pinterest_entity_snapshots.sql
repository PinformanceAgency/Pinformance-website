-- Daily snapshots of every campaign / ad group / ad in each connected org's
-- Pinterest ad account. We snapshot once per day; comparing today's row to
-- yesterday's row for the same entity gives us real change detection:
-- status flips (ACTIVE→PAUSED), budget/bid changes, name renames, and
-- disappearances (entity removed from the ad account).
--
-- Pinterest's `updated_time` field is too noisy (platform-side recalcs bump
-- it for thousands of entities at once), so we don't use it for attribution.
-- Snapshot-diffing is the only reliable signal for what a media buyer
-- actually changed in the last 24h.

CREATE TABLE IF NOT EXISTS pinterest_entity_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id   TEXT NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('campaign', 'ad_group', 'ad')),
  entity_id       TEXT NOT NULL,
  snapshot_date   DATE NOT NULL,
  -- Pinterest-side state at snapshot time. NULLs mean "Pinterest didn't return
  -- this field" — usually fine (a field not relevant to that entity type).
  name            TEXT,
  status          TEXT,
  parent_campaign_id   TEXT,
  parent_ad_group_id   TEXT,
  -- Monetary fields stored in their native units so we don't lose precision:
  --   campaign caps come back in dollars (account currency, decimal)
  --   ad-group budget/bid come back in micros (1e6 units of currency)
  daily_spend_cap_dollars      NUMERIC,
  lifetime_spend_cap_dollars   NUMERIC,
  budget_in_micro_currency     NUMERIC,
  bid_in_micro_currency        NUMERIC,
  -- Ad-only:
  pin_id          TEXT,
  creative_type   TEXT,
  -- Pinterest's own created_time (unix seconds) so we can show the original
  -- creation event even for entities snapshotted long after they were made.
  created_time    BIGINT,
  -- Raw payload as a safety net for fields we don't yet model.
  raw             JSONB,
  inserted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One snapshot per entity per day. Re-running the cron the same day is
  -- an idempotent upsert.
  UNIQUE (org_id, entity_id, snapshot_date)
);

-- The diff-engine reads (org_id, snapshot_date BETWEEN x AND y) ordered by
-- entity_id, so this index covers the hot path.
CREATE INDEX IF NOT EXISTS idx_pes_org_date
  ON pinterest_entity_snapshots (org_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_pes_entity
  ON pinterest_entity_snapshots (entity_id, snapshot_date DESC);
