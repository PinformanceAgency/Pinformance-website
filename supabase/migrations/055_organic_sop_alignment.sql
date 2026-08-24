-- Sixteen SOP-alignment deviations, ONE migration for everything DB-level.
-- App-level items (validators, prompts, UI copy) live in the code changes
-- shipped alongside this migration.
--
-- What this migration touches:
--   4  hard cap 20 pins/day/client on check_daily_volume trigger
--   8  extend baseline_kpis with conversion metrics + period tag
--   9  three-period baseline support (period tag on baseline_kpis)
--   3  guidance update for P4.2.4 + P4.2.5 (AI-modified bypass)
--   7  guidance update for P4.2.7 (sans-serif + safe zones)
--   11 new P1.3.15 social claimed check
--   12 new P1.3.16 re-optimise existing top pins
--   13 new P1.3.17 Verified Merchant check
--   14 new P5.3.1 SEO strategy review (recurring, 6-monthly)
--   15 new P5.4.1 Organic-to-Paid audience handover

-- ============================================================
-- 4 · Hard cap 20 pins/day/client regardless of account class
-- ============================================================
CREATE OR REPLACE FUNCTION organic.check_daily_volume()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org uuid;
  v_target int;
  v_count int;
  v_effective int;
BEGIN
  SELECT w.org_id INTO v_org FROM organic.waterfalls w WHERE w.id = new.waterfall_id;
  SELECT daily_pin_target INTO v_target FROM organic.client_settings WHERE org_id = v_org;
  -- Platform-level hard ceiling wins over any per-client target.
  v_effective := LEAST(COALESCE(v_target, 1), 20);
  SELECT count(*) INTO v_count
    FROM organic.pins p
    JOIN organic.waterfalls w2 ON w2.id = p.waterfall_id
   WHERE w2.org_id = v_org
     AND p.scheduled_date = new.scheduled_date
     AND p.id IS DISTINCT FROM new.id
     AND p.status <> 'CANCELLED';
  IF v_count >= v_effective THEN
    RAISE EXCEPTION 'Dagplafond bereikt: % pins op % (effective cap %, per-client target %)',
      v_count, new.scheduled_date, v_effective, v_target;
  END IF;
  RETURN new;
END;
$$;

-- ============================================================
-- 8 + 9 · Baseline: conversion metrics + 3-period support
-- ============================================================
-- Add period tag so one org can carry three rows (last_30d, month_-1, month_-2)
ALTER TABLE organic.baseline_kpis
  ADD COLUMN IF NOT EXISTS period text NOT NULL DEFAULT 'last_30d';

-- Drop the (org_id) PK and rebuild as (org_id, period).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='baseline_kpis_pkey' AND conrelid='organic.baseline_kpis'::regclass) THEN
    ALTER TABLE organic.baseline_kpis DROP CONSTRAINT baseline_kpis_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='baseline_kpis_org_period_pkey' AND conrelid='organic.baseline_kpis'::regclass) THEN
    ALTER TABLE organic.baseline_kpis ADD CONSTRAINT baseline_kpis_org_period_pkey PRIMARY KEY (org_id, period);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='baseline_kpis_period_valid') THEN
    ALTER TABLE organic.baseline_kpis ADD CONSTRAINT baseline_kpis_period_valid
      CHECK (period IN ('last_30d','month_-1','month_-2'));
  END IF;
END $$;

-- Conversion metrics (Pinterest Conversion Insights).
ALTER TABLE organic.baseline_kpis
  ADD COLUMN IF NOT EXISTS page_visits    integer,
  ADD COLUMN IF NOT EXISTS add_to_cart    integer,
  ADD COLUMN IF NOT EXISTS checkouts      integer,
  ADD COLUMN IF NOT EXISTS conversions    integer,
  ADD COLUMN IF NOT EXISTS revenue        numeric,
  -- 10 · Your Pins vs Other Pins split
  ADD COLUMN IF NOT EXISTS other_impressions integer,
  ADD COLUMN IF NOT EXISTS other_saves       integer;

-- ============================================================
-- 11 · P1.3.15 Social claimed check
-- 12 · P1.3.16 Re-optimise existing top pins
-- 13 · P1.3.17 Verified Merchant status check
-- 14 · P5.3.1 SEO strategy review (recurring 6-monthly)
-- 15 · P5.4.1 Organic-to-Paid audience handover (recurring)
-- ============================================================
INSERT INTO organic.task_definitions (id, phase, step, name, description, task_type, sort_order, is_recurring, guidance, active)
VALUES
 ('P1.3.15', 1, '3', 'Social claimed check', NULL, 'IN_DASHBOARD'::organic.task_type,
  315, false,
  'Confirm Shopify and Instagram are connected under Settings → Claimed accounts. Instagram auto-publish MUST be OFF: Pinterest re-posts otherwise get flagged as spam. Shopify claim unlocks catalog + rich pins; without it product pins never carry price.',
  true),
 ('P1.3.16', 1, '3', 'Re-optimise existing top pins', NULL, 'IN_DASHBOARD'::organic.task_type,
  316, false,
  'For pins with impressions but no destination URL, add the correct link — those are the highest ROI edits. Then fix any pins with generic titles/descriptions on high-impression board pages. Cap yourself at 10 to 20 edits per day. Hard platform limit: 150 pin edits per day per account. Above that Pinterest rate-limits the whole account.',
  true),
 ('P1.3.17', 1, '3', 'Verified Merchant status', NULL, 'IN_DASHBOARD'::organic.task_type,
  317, false,
  'Verified Merchant is a Pinterest badge that unlocks product tagging, catalog boosts and shop tab prominence. Requires: business account, claimed domain, active shopping catalog, no policy violations, and passing a Pinterest review. Apply from Settings → Verified Merchant. Track status per client; some verticals require additional review.',
  true),
 ('P5.3.1', 5, '3', 'SEO strategy review', NULL, 'IN_DASHBOARD'::organic.task_type,
  530, true,
  'Every six months, review the full keyword bank, board architecture and competitor set. Retire under-performing keywords, add newly discovered ones (recompute against the shared volume cache), audit whether topic coverage still holds, refresh the competitor list against churn on Pinterest. Output is a written strategy delta the manager sends to the client.',
  true),
 ('P5.4.1', 5, '4', 'Organic-to-Paid audience handover', NULL, 'IN_DASHBOARD'::organic.task_type,
  540, true,
  'Export three engagement audiences (pin engagers 30d / 60d / 90d) and three site-visitor audiences (30d / 60d / 90d) from Pinterest Audience Insights. Hand them to the paid team as retargeting seeds. Never mix organic and paid data inside a single pin — always recreate winners as new assets in Ads Manager.',
  true)
ON CONFLICT (id) DO UPDATE SET
  guidance = EXCLUDED.guidance,
  sort_order = EXCLUDED.sort_order,
  task_type = EXCLUDED.task_type,
  is_recurring = EXCLUDED.is_recurring,
  active = EXCLUDED.active;

-- ============================================================
-- 3 · Guidance update for P4.2.4 + P4.2.5 — AI-modified bypass
-- 7 · Guidance update for P4.2.7 — sans-serif + safe zones
-- ============================================================
UPDATE organic.task_definitions
   SET guidance = trim(both E'\n ' from COALESCE(guidance, '')) || E'\n\nAI-MODIFIED BYPASS: apply a 1% transparent frame around every AI-generated image before export — this strips the C2PA metadata that Pinterest reads to auto-flag AI content. NEVER enable the "Mark as AI-Modified" toggle in the Pin Builder either; both signals suppress distribution.'
 WHERE id IN ('P4.2.4', 'P4.2.5');

UPDATE organic.task_definitions
   SET guidance = trim(both E'\n ' from COALESCE(guidance, '')) || E'\n\nQC ADDITIONS: sans-serif fonts only — Pinterest OCR fails on cursive and script, which drops the pin''s topical signal. Respect the safe zones in the top-left and top-right corners of the pin canvas: Pinterest overlays Save / More buttons there and any content behind them is invisible on mobile.'
 WHERE id = 'P4.2.7';

-- Seed cycle instances for existing activated orgs so the newly-added
-- non-recurring P1.3.* tasks show up in their onboarding lists.
INSERT INTO organic.client_tasks (org_id, task_id, status)
SELECT cs.org_id, td.id, 'BLOCKED'::organic.task_status
  FROM organic.client_settings cs
  CROSS JOIN organic.task_definitions td
 WHERE td.id IN ('P1.3.15','P1.3.16','P1.3.17')
   AND NOT EXISTS (
     SELECT 1 FROM organic.client_tasks ct
      WHERE ct.org_id = cs.org_id AND ct.task_id = td.id
   );
