-- Phase 2 organic workflow — extra columns + two new tables.
--
-- Existing tables already cover most of what phase 2 needs. This migration
-- fills the gaps that the operator UI depends on and adds two receiving
-- tables for artefacts that don't fit anywhere existing:
--   - organic.competitor_pins        — parsed PinInspector CSV rows
--   - organic.market_analysis_items  — approvable Steal List / Board Gap /
--                                      content angle items from the AI draft

-- 1. Grid analysis — the "% text overlay" bucket the operator picks.
--    Schema already has 5 format booleans + look_and_feel + 3 hex columns.
ALTER TABLE organic.grid_analyses
  ADD COLUMN IF NOT EXISTS text_overlay_bucket text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='grid_analyses_overlay_bucket_valid') THEN
    ALTER TABLE organic.grid_analyses
      ADD CONSTRAINT grid_analyses_overlay_bucket_valid
      CHECK (text_overlay_bucket IS NULL OR text_overlay_bucket IN
        ('NONE','MINIMAL','HALF','MOST','ALL'));
  END IF;
END $$;

-- 2. Competitors — human name + niche fit rating.
ALTER TABLE organic.competitors
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS niche_fit text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='competitors_niche_fit_valid') THEN
    ALTER TABLE organic.competitors
      ADD CONSTRAINT competitors_niche_fit_valid
      CHECK (niche_fit IS NULL OR niche_fit IN ('STRONG','PARTIAL','WEAK'));
  END IF;
END $$;

-- 3. P2.4.2 output — URLs per month the client needs to sustain the pin target.
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS urls_per_month integer;

-- 4. Competitor pins parsed from PinInspector CSV. Only what we actually use.
CREATE TABLE IF NOT EXISTS organic.competitor_pins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  competitor_id uuid REFERENCES organic.competitors(id) ON DELETE CASCADE,
  pin_url       text,
  title         text,
  description   text,
  board_name    text,
  saves         integer,
  outbound_clicks integer,
  impressions   integer,
  raw           jsonb,
  imported_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS competitor_pins_org_idx  ON organic.competitor_pins(org_id);
CREATE INDEX IF NOT EXISTS competitor_pins_comp_idx ON organic.competitor_pins(competitor_id);
ALTER TABLE organic.competitor_pins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='competitor_pins' AND policyname='competitor_pins_read_authenticated') THEN
    CREATE POLICY "competitor_pins_read_authenticated" ON organic.competitor_pins
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 5. AI market-analysis output — Steal List / Board Gap / Content Angles.
--    Individually approvable/rejectable, reject reason preserved.
CREATE TABLE IF NOT EXISTS organic.market_analysis_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  kind          text NOT NULL,
  title         text NOT NULL,
  detail        text,
  status        text NOT NULL DEFAULT 'PENDING',
  reject_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mai_kind_valid') THEN
    ALTER TABLE organic.market_analysis_items
      ADD CONSTRAINT mai_kind_valid CHECK (kind IN ('STEAL_LIST','BOARD_GAP','CONTENT_ANGLE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mai_status_valid') THEN
    ALTER TABLE organic.market_analysis_items
      ADD CONSTRAINT mai_status_valid CHECK (status IN ('PENDING','APPROVED','REJECTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mai_reject_reason_required') THEN
    ALTER TABLE organic.market_analysis_items
      ADD CONSTRAINT mai_reject_reason_required
      CHECK (status <> 'REJECTED' OR reject_reason IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS market_analysis_items_org_idx ON organic.market_analysis_items(org_id);
ALTER TABLE organic.market_analysis_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='market_analysis_items' AND policyname='mai_read_authenticated') THEN
    CREATE POLICY "mai_read_authenticated" ON organic.market_analysis_items
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 6. Idempotent unique constraint on grid_analyses (org_id, target_keyword) so
--    the "one row per keyword" upsert has something to conflict on.
CREATE UNIQUE INDEX IF NOT EXISTS grid_analyses_org_keyword_uniq
  ON organic.grid_analyses (org_id, target_keyword);

-- 7. Ditto for keywords (org_id, term, source) so we can seed idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS keywords_org_term_uniq
  ON organic.keywords (org_id, term);

-- 8. Unique on competitor profile per org.
CREATE UNIQUE INDEX IF NOT EXISTS competitors_org_profile_uniq
  ON organic.competitors (org_id, profile_url);
