-- Per-item answers, with the reasoning behind them.
--
-- Until now a checklist item was a single boolean on a wide table:
-- client_viability.visual_first is true or false and that is the whole
-- record. Nobody can tell later WHY it was ticked, how many URLs were
-- actually counted, or what the person saw. The answer survives; the
-- evidence never existed.
--
-- Repeating the wide-column pattern for every checklist in phases 2-5
-- would mean a new column per question forever, and still no room for
-- reasoning. So answers move to one narrow table keyed by
-- (org, task, field), carrying the value AND the evidence for it.
--
-- The questions themselves are NOT here. They live in
-- src/lib/organic/task-fields.ts as prose — what to check, why it
-- matters, what good looks like — because that copy gets edited far more
-- often than the data model and belongs somewhere reviewable in a diff.

CREATE TABLE IF NOT EXISTS organic.task_answers (
  org_id      uuid  NOT NULL,
  task_id     text  NOT NULL,          -- e.g. 'P1.0.1'
  field_key   text  NOT NULL,          -- e.g. 'visual_first'

  -- One of these carries the answer, depending on the field's kind.
  -- Deliberately not a single jsonb blob: these get aggregated across
  -- stores on the method-intelligence screen, and querying a typed
  -- column is the difference between an index and a table scan.
  answer_bool   boolean,
  answer_text   text,
  answer_number numeric,

  -- The reasoning. This is the point of the table: an unexplained tick
  -- is an opinion, an explained one is a finding somebody else can check.
  evidence    text,

  answered_at timestamptz NOT NULL DEFAULT now(),
  answered_by uuid,

  PRIMARY KEY (org_id, task_id, field_key)
);

CREATE INDEX IF NOT EXISTS task_answers_task_idx
  ON organic.task_answers (task_id, field_key);
CREATE INDEX IF NOT EXISTS task_answers_org_idx
  ON organic.task_answers (org_id, task_id);

ALTER TABLE organic.task_answers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'organic' AND tablename = 'task_answers'
       AND policyname = 'task_answers_read_authenticated'
  ) THEN
    CREATE POLICY "task_answers_read_authenticated"
      ON organic.task_answers FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE organic.task_answers IS
  'One row per checklist item per store. Question text lives in code (task-fields.ts); this holds the answer and the evidence behind it.';
COMMENT ON COLUMN organic.task_answers.evidence IS
  'Why this answer. An unexplained tick is an opinion; an explained one is a finding.';
