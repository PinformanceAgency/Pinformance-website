-- Media Buying Hub — Task 1: per-store metadata.
--
-- One row per org (an "org" = a store in this codebase). Holds the human-curated
-- context that Pinterest can't tell us: which department this store belongs to,
-- which niche/country, who the responsible buyer is, and — critically — the
-- breakeven ROAS that the zone-engine (Task 2) needs to colour every store and
-- campaign red/orange/green.
--
-- Design notes:
--  - No CHECK constraints on department/niche/country/media_buyer: the allowed
--    values live in src/lib/media-buying/config.ts so adding an option is a
--    one-line app-side change, not a migration.
--  - zone_thresholds is a per-store override; NULL means "use the global default
--    from config". Task 2 reads this.
--  - configured_at is set the moment a store has both department AND
--    breakeven_roas filled in — those are the two fields the zone-engine
--    requires. Anything without them is treated as "unconfigured" and excluded
--    from calculations (spec §1.3).

CREATE TABLE IF NOT EXISTS store_settings (
  org_id           UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Cached copy of the Pinterest ad account id from organizations.settings,
  -- so hub queries can filter by ad account without joining through the JSON blob.
  ad_account_id    TEXT,
  department       TEXT,
  niche            TEXT,
  country          TEXT,
  media_buyer      TEXT,
  breakeven_roas   NUMERIC,
  -- Per-store override for zone thresholds. Shape:
  --   { "orange_ratio": 1.0, "green_ratio": 1.3 }
  -- where ratio = live_roas / breakeven_roas. NULL = use the global default
  -- from src/lib/media-buying/config.ts.
  zone_thresholds  JSONB,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,
  -- Timestamp of first time this store had the two required fields filled
  -- (department + breakeven_roas). Handy for filtering / analytics.
  configured_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keeps hub queries fast when filtering the world by department/media_buyer.
CREATE INDEX IF NOT EXISTS idx_store_settings_department ON store_settings (department);
CREATE INDEX IF NOT EXISTS idx_store_settings_media_buyer ON store_settings (media_buyer);
CREATE INDEX IF NOT EXISTS idx_store_settings_active ON store_settings (is_active);

-- Row-level security — matches the pattern in migration 002.
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON store_settings FOR SELECT
  USING (org_id = public.user_org_id() OR public.is_agency_admin());

-- Only agency admin can create/edit/delete store settings — this is agency-side
-- management data. Client roles are read-only for their own store.
CREATE POLICY "agency_manages_all" ON store_settings FOR ALL
  USING (public.is_agency_admin());

-- Auto-bump updated_at on any UPDATE.
CREATE OR REPLACE FUNCTION public.store_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  -- Mark configured_at the first time both required fields are non-null.
  IF NEW.configured_at IS NULL
     AND NEW.department IS NOT NULL
     AND NEW.breakeven_roas IS NOT NULL THEN
    NEW.configured_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_store_settings_touch_updated_at
  BEFORE UPDATE ON store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.store_settings_touch_updated_at();

-- Same on INSERT — a store created already-filled should get configured_at.
CREATE OR REPLACE FUNCTION public.store_settings_set_configured_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.configured_at IS NULL
     AND NEW.department IS NOT NULL
     AND NEW.breakeven_roas IS NOT NULL THEN
    NEW.configured_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_store_settings_set_configured_at
  BEFORE INSERT ON store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.store_settings_set_configured_at();
