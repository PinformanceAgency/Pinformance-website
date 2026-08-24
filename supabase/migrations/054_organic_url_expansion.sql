-- Three changes from the SOP author on 2026-08-24:
--
-- 1. The 60-day URL cooldown becomes configurable per client, not a
--    hard rule. It is a catalogue-management comfort rule, not a
--    platform constraint. Default 60, floor 30 (below → warn in UI,
--    no DB CHECK).
--
-- 2. Track proposed URL-expansion pages so the "your catalogue is too
--    small for your frequency" fallback becomes actionable: system
--    proposes pages, manager sends brief to client, client builds,
--    the new URL flows back into the pool.
--
-- 3. Viability check (P1.0.3) compares required URLs (from Phase 2
--    frequency × Phase 3 cooldown) against existing + realistically
--    buildable — updated in application code, no schema change here.

-- Configurable cooldown per client.
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS url_cooldown_days integer NOT NULL DEFAULT 60;

-- Trigger reads the per-client value now.
CREATE OR REPLACE FUNCTION organic.set_url_cooldown()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cooldown_days integer;
BEGIN
  IF new.status = 'COMPLETED' AND old.status <> 'COMPLETED' THEN
    SELECT COALESCE(url_cooldown_days, 60) INTO v_cooldown_days
      FROM organic.client_settings
     WHERE org_id = new.org_id;
    UPDATE organic.urls SET
      last_waterfall_end = COALESCE(new.end_date, current_date),
      cooldown_until     = COALESCE(new.end_date, current_date)
                             + (COALESCE(v_cooldown_days, 60) || ' days')::interval
     WHERE id = new.url_id;
  END IF;
  RETURN new;
END;
$$;

-- URL-expansion proposals — brief the client can build against.
CREATE TABLE IF NOT EXISTS organic.url_expansion_proposals (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      uuid NOT NULL,
  proposed_title              text NOT NULL,
  page_type                   text NOT NULL,
  supporting_keywords         text[] NOT NULL,
  supporting_keywords_volume  integer,
  brief                       text NOT NULL,
  status                      text NOT NULL DEFAULT 'PROPOSED',
  built_url                   text,
  built_url_id                uuid REFERENCES organic.urls(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  sent_to_client_at           timestamptz,
  built_at                    timestamptz,
  notes                       text
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='url_expansion_page_type_valid') THEN
    ALTER TABLE organic.url_expansion_proposals
      ADD CONSTRAINT url_expansion_page_type_valid
      CHECK (page_type IN (
        'COLOR_CATEGORY','PRODUCT_TYPE','LENGTH_STYLE','MATERIAL',
        'SEASONAL_EDIT','BEST_OF','REVIEWS_UGC','CURATED_SELECTION'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='url_expansion_status_valid') THEN
    ALTER TABLE organic.url_expansion_proposals
      ADD CONSTRAINT url_expansion_status_valid
      CHECK (status IN ('PROPOSED','SENT_TO_CLIENT','BUILDING','BUILT','REJECTED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS url_expansion_org_idx    ON organic.url_expansion_proposals(org_id);
CREATE INDEX IF NOT EXISTS url_expansion_status_idx ON organic.url_expansion_proposals(status);

ALTER TABLE organic.url_expansion_proposals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='url_expansion_proposals' AND policyname='url_expansion_read_authenticated') THEN
    CREATE POLICY "url_expansion_read_authenticated" ON organic.url_expansion_proposals
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
