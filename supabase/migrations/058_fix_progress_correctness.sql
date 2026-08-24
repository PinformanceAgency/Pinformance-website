-- STAGE 0 · CORRECTNESS
--
-- "A wrong number is worse than no number." Three defects in the progress
-- rollup, all of which put a false figure in front of a manager.
--
-- DEFECT 1 · client_progress counts cycle-scoped tasks in the phase rollup.
--   The view joins client_tasks with no filter on `cycle`. Phase 4 tasks are
--   instantiated once per URL cycle, so a store running three cycles shows
--   3 × 22 = 66 phase-4 tasks instead of 22. The phase-4 percentage mixes
--   template progress with per-cycle progress and means nothing.
--   Fix: the phase rollup covers one-time tasks only (cycle IS NULL).
--   Cycle progress gets its own view.
--
-- DEFECT 2 · SKIPPED is invisible.
--   A task skipped with a valid reason is resolved work, but the view counts
--   only DONE. The manager sees "44/47" forever with no indication that the
--   three outstanding were deliberately skipped rather than forgotten.
--   Fix: expose skipped_tasks and outstanding_tasks separately. pct_done
--   stays DONE-only — inflating it with skips would be the same dishonesty
--   in the other direction.
--
-- DEFECT 3 · the client list and the client detail computed different numbers.
--   List: SUM(done) / SUM(total) across all five phases — mixing one-time
--   onboarding with recurring cycles into a single meaningless average.
--   Detail: per-phase pct_done straight from the view.
--   Fix is in application code (queries.ts); this migration gives both
--   surfaces one honest source.

-- ---------------------------------------------------------------------
-- Phase rollup — one-time tasks only.
-- DROP first: CREATE OR REPLACE cannot insert columns into an existing
-- view's column list, and skipped_tasks/outstanding_tasks land mid-list.
-- Verified no other view depends on client_progress.
-- ---------------------------------------------------------------------
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
  GROUP BY o.id, o.name, td.phase;

-- ---------------------------------------------------------------------
-- Cycle progress — one row per (org, cycle), for the phase-4/5 surfaces.
-- ---------------------------------------------------------------------
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
  GROUP BY ct.org_id, ct.cycle, td.phase;
