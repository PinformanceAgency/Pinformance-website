-- History of every AI proposal + what the human approved on top of it.
-- Lets us measure how much editing each AI_DRAFT surface needs and lets
-- the manager see the original proposal even after they edit.
--
-- kind: DISPLAY_NAME | BIO | BOARD_DESCRIPTION | MARKET_ANALYSIS
-- target_id: for BOARD_DESCRIPTION → boards.id; NULL for org-scoped drafts

CREATE TABLE IF NOT EXISTS organic.ai_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  kind            text NOT NULL,
  target_id       uuid,
  generated_text  text NOT NULL,
  approved_text   text,
  prompt_version  text,
  model_version   text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  approved_at     timestamptz,
  approved_by     uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_drafts_kind_valid') THEN
    ALTER TABLE organic.ai_drafts
      ADD CONSTRAINT ai_drafts_kind_valid
      CHECK (kind IN ('DISPLAY_NAME','BIO','BOARD_DESCRIPTION','MARKET_ANALYSIS'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_drafts_org_idx    ON organic.ai_drafts(org_id);
CREATE INDEX IF NOT EXISTS ai_drafts_target_idx ON organic.ai_drafts(target_id);

ALTER TABLE organic.ai_drafts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='ai_drafts' AND policyname='ai_drafts_read_authenticated') THEN
    CREATE POLICY "ai_drafts_read_authenticated" ON organic.ai_drafts
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
