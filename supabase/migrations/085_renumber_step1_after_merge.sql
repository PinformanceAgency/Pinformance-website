-- 085 — sluit het gat dat 084 in stap 1 achterliet: P1.1.9/10/11 → 8/9/10.
--
-- WHY THIS OVERRULES 084
-- ----------------------
-- Migration 084 merged P1.1.8 into P1.1.7 and deliberately left a hole at 8,
-- on the argument that ids appear in prose and renumbering breaks references.
-- That argument loses to the plainer one: a numbered SOP that runs 7, 9, 10, 11
-- is not a numbered SOP. The team reads these numbers off a checklist and out
-- loud on calls, and "there is no eight" is a thing somebody has to be told
-- every time. Decided 27-08-2026.
--
-- So the references get fixed instead of avoided. There are fewer than the
-- earlier caution assumed: no task_answers, no assets and no guidance text
-- mentions P1.1.9-P1.1.11 (checked before writing this), which leaves the
-- definitions, the per-store task rows, the preconditions and six places in
-- the application code — all changed in the same commit as this file.
--
-- READ THIS BEFORE TRUSTING AN OLD MIGRATION
-- ------------------------------------------
-- P1.1.8 now means "Request Google keyword list". In migrations 057, 069 and
-- 084 it means "Other social content", which no longer exists. Those files are
-- history and are not rewritten; this note is the warning that the id in them
-- does not point where it looks like it points.
--
-- HOW
-- ---
-- The FKs on client_tasks and task_preconditions are ON UPDATE NO ACTION and
-- not deferrable, so renaming a definition in place fails the moment the
-- statement ends. Each rename is therefore insert-new, repoint-children,
-- delete-old — no DDL, and run-migration.ts wraps the file in one transaction.
--
-- Ascending order matters: 9 → 8 only works once 8 is free, 10 → 9 once 9 is,
-- and so on.
--
-- Idempotent: each rename is skipped when the source id is already gone.

-- 1. The retired shell of the old P1.1.8 goes, freeing the id.
--    It has no client_tasks, answers, assets or preconditions left — 084
--    removed them.
DELETE FROM organic.task_definitions WHERE id = 'P1.1.8' AND active = false;

-- 2. Rename 9 → 8, 10 → 9, 11 → 10.
DO $$
DECLARE
  pair  text[];
  pairs text[][] := ARRAY[
    ARRAY['P1.1.9',  'P1.1.8'],
    ARRAY['P1.1.10', 'P1.1.9'],
    ARRAY['P1.1.11', 'P1.1.10']
  ];
  old_id text;
  new_id text;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    old_id := pair[1];
    new_id := pair[2];

    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM organic.task_definitions WHERE id = old_id);
    IF EXISTS (SELECT 1 FROM organic.task_definitions WHERE id = new_id) THEN
      RAISE EXCEPTION 'cannot rename % to %: % already exists', old_id, new_id, new_id;
    END IF;

    INSERT INTO organic.task_definitions
      (id, phase, step, name, description, task_type, sort_order, is_recurring,
       external_tool, external_url, guidance, active, expected_output)
    SELECT new_id, phase, step, name, description, task_type, sort_order, is_recurring,
           external_tool, external_url, guidance, active, expected_output
      FROM organic.task_definitions WHERE id = old_id;

    UPDATE organic.client_tasks       SET task_id          = new_id WHERE task_id          = old_id;
    UPDATE organic.task_answers       SET task_id          = new_id WHERE task_id          = old_id;
    UPDATE organic.assets             SET linked_task_id   = new_id WHERE linked_task_id   = old_id;
    UPDATE organic.task_preconditions SET task_id          = new_id WHERE task_id          = old_id;
    UPDATE organic.task_preconditions SET requires_task_id = new_id WHERE requires_task_id = old_id;

    DELETE FROM organic.task_definitions WHERE id = old_id;
  END LOOP;
END $$;

-- 3. The note 084 carried over names an id that now belongs to another task.
--    Rewritten to name the task instead, which cannot go stale.
UPDATE organic.client_tasks
   SET notes = replace(
         notes,
         '--- carried over from P1.1.8 (Other social content) ---',
         '--- carried over from the retired "Other social content" task ---')
 WHERE notes LIKE '%carried over from P1.1.8 (Other social content)%';
