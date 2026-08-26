-- Retire two phase-1 access tasks, and make `active` mean something.
--
-- P1.1.2 (Arrange Pinterest access) and P1.1.5 (CMS access) come out of the
-- SOP. Both are handled outside this system now, and a task nobody performs
-- sits at TODO forever and drags the phase-1 percentage down with it.
--
-- Two things this migration has to get right.
--
-- 1 · THE PRECONDITIONS MUST GO WITH THEM.
--     P1.2.1 and P1.2.14 require P1.1.2; P1.3.8 and P1.3.14 require P1.1.5.
--     Deactivating a task without dropping the edges pointing at it leaves
--     four tasks BLOCKED permanently, waiting on something that can never
--     be completed because it is no longer on screen. All four also require
--     P1.0.4, so removing these edges leaves them properly gated behind the
--     viability verdict — they do not become free.
--
-- 2 · `active` WAS ONLY READ AT SEED TIME.
--     activate.ts filters on it when it materialises client_tasks; every
--     read after that joins task_definitions with no filter. So for a store
--     already activated, deactivating a definition changed nothing at all —
--     the task kept rendering and kept counting toward progress. The views
--     below now filter on it, and the application queries alongside this
--     migration do the same. That makes deactivation one reversible switch
--     that every surface honours, rather than a flag with no effect.
--
-- Deactivation, not deletion, throughout: a store that actually completed
-- these tasks did the work, and its client_tasks rows stay. They go quiet,
-- not missing. Setting active = true restores everything as it was.

-- ---------------------------------------------------------------------
-- 1 · Drop the edges, in both directions.
-- ---------------------------------------------------------------------
DELETE FROM organic.task_preconditions
 WHERE requires_task_id IN ('P1.1.2', 'P1.1.5')
    OR task_id         IN ('P1.1.2', 'P1.1.5');

-- ---------------------------------------------------------------------
-- 2 · Retire the two tasks.
-- ---------------------------------------------------------------------
UPDATE organic.task_definitions
   SET active = false
 WHERE id IN ('P1.1.2', 'P1.1.5');

-- ---------------------------------------------------------------------
-- 3 · Teach the progress views to respect it.
--
-- DROP first: CREATE OR REPLACE cannot change an existing view's column
-- list, and while these keep the same columns, dropping is what 058 did
-- and keeps the two definitions comparable.
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 2b · Remove the empty placeholders, keep everything that recorded work.
--
-- A retired task with a DONE row is a real record — somebody arranged that
-- Pinterest access — and it stays. A BLOCKED or TODO row with no notes, no
-- time and no answers recorded nothing; it is a placeholder the seeder
-- created, and leaving it behind means every ad-hoc "outstanding tasks"
-- count in the app has to remember to exclude it. There are a dozen such
-- counts and the next one written will not remember.
-- ---------------------------------------------------------------------
DELETE FROM organic.client_tasks ct
 USING organic.task_definitions td
 WHERE td.id = ct.task_id
   AND td.active = false
   AND ct.status NOT IN ('DONE'::organic.task_status, 'SKIPPED'::organic.task_status)
   AND ct.time_spent_min IS NULL
   AND COALESCE(ct.notes, '') = ''
   AND NOT EXISTS (
     SELECT 1 FROM organic.task_answers ta
      WHERE ta.org_id = ct.org_id AND ta.task_id = ct.task_id
   );

DROP VIEW IF EXISTS organic.client_progress;
CREATE VIEW organic.client_progress AS
 SELECT o.id AS org_id,
    o.name,
    td.phase,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)    AS done_tasks,
    count(*) FILTER (WHERE ct.status = 'SKIPPED'::organic.task_status) AS skipped_tasks,
    count(*) FILTER (WHERE ct.status = 'BLOCKED'::organic.task_status) AS blocked_tasks,
    count(*) FILTER (WHERE ct.status NOT IN (
      'DONE'::organic.task_status, 'SKIPPED'::organic.task_status
    )) AS outstanding_tasks,
    round(100.0 * count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)::numeric
          / NULLIF(count(*), 0)::numeric) AS pct_done
   FROM organizations o
     JOIN organic.client_tasks ct ON ct.org_id = o.id
     JOIN organic.task_definitions td ON td.id = ct.task_id
  WHERE ct.cycle IS NULL          -- cycle work is counted by client_cycle_progress
    AND td.active                 -- a retired task is not outstanding work
  GROUP BY o.id, o.name, td.phase;

CREATE OR REPLACE VIEW organic.client_cycle_progress AS
 SELECT ct.org_id,
    ct.cycle,
    td.phase,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)    AS done_tasks,
    count(*) FILTER (WHERE ct.status = 'SKIPPED'::organic.task_status) AS skipped_tasks,
    count(*) FILTER (WHERE ct.status = 'BLOCKED'::organic.task_status) AS blocked_tasks,
    round(100.0 * count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)::numeric
          / NULLIF(count(*), 0)::numeric) AS pct_done
   FROM organic.client_tasks ct
     JOIN organic.task_definitions td ON td.id = ct.task_id
  WHERE ct.cycle IS NOT NULL
    AND td.active
  GROUP BY ct.org_id, ct.cycle, td.phase;
