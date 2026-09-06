-- Typed-but-not-yet-saved form state, so no research can be lost again.
--
-- The phase-2 forms hold everything in React state until the one Save button
-- at the bottom succeeds. Anything that interrupts that -- a thrown render, a
-- refused save, a closed tab, a reload -- takes the lot. That is exactly how
-- Fit Cherries lost a day of market research on 06-09-2026.
--
-- One row per (org, task): the draft is the form's own state as JSON, written
-- while the operator types and deleted the moment the real save succeeds. It
-- is deliberately NOT the record -- grid_analyses and friends stay the source
-- of truth -- it only means the browser is never the only place the work
-- exists.

CREATE TABLE IF NOT EXISTS organic.form_drafts (
  org_id     uuid        NOT NULL,
  task_id    text        NOT NULL,
  payload    jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (org_id, task_id)
);

ALTER TABLE organic.form_drafts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='form_drafts' AND policyname='form_drafts_read_authenticated') THEN
    CREATE POLICY "form_drafts_read_authenticated" ON organic.form_drafts
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
