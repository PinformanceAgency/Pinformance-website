-- Progress broken out by every status, not just the three that were needed.
--
-- client_progress exposed done / skipped / blocked / outstanding. That was
-- enough for a bar, but "outstanding" collapses TODO, IN_PROGRESS and REVIEW
-- into one number — and those are three different situations. Work in review
-- is waiting on a person; work in progress is not waiting on anybody; work
-- still on TODO has not started. A phase with 14 outstanding tasks reads very
-- differently when 12 of them are sitting in review.
--
-- The five statuses a person can set (TODO, IN_PROGRESS, REVIEW, DONE,
-- SKIPPED) plus BLOCKED, which is computed from preconditions and cannot be
-- chosen, now each get a column. outstanding_tasks and pct_done stay exactly
-- as they were: other surfaces read them and this migration is not the place
-- to change what they mean.
--
-- The six counts partition the table — every client_tasks row has exactly one
-- status — so they sum to total_tasks and can be charted without overlap.

DROP VIEW IF EXISTS organic.client_progress;
CREATE VIEW organic.client_progress AS
 SELECT o.id AS org_id,
    o.name,
    td.phase,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)        AS done_tasks,
    count(*) FILTER (WHERE ct.status = 'SKIPPED'::organic.task_status)     AS skipped_tasks,
    count(*) FILTER (WHERE ct.status = 'BLOCKED'::organic.task_status)     AS blocked_tasks,
    count(*) FILTER (WHERE ct.status = 'TODO'::organic.task_status)        AS todo_tasks,
    count(*) FILTER (WHERE ct.status = 'IN_PROGRESS'::organic.task_status) AS in_progress_tasks,
    count(*) FILTER (WHERE ct.status = 'REVIEW'::organic.task_status)      AS review_tasks,
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

DROP VIEW IF EXISTS organic.client_cycle_progress;
CREATE VIEW organic.client_cycle_progress AS
 SELECT ct.org_id,
    ct.cycle,
    td.phase,
    count(*) AS total_tasks,
    count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)        AS done_tasks,
    count(*) FILTER (WHERE ct.status = 'SKIPPED'::organic.task_status)     AS skipped_tasks,
    count(*) FILTER (WHERE ct.status = 'BLOCKED'::organic.task_status)     AS blocked_tasks,
    count(*) FILTER (WHERE ct.status = 'TODO'::organic.task_status)        AS todo_tasks,
    count(*) FILTER (WHERE ct.status = 'IN_PROGRESS'::organic.task_status) AS in_progress_tasks,
    count(*) FILTER (WHERE ct.status = 'REVIEW'::organic.task_status)      AS review_tasks,
    round(100.0 * count(*) FILTER (WHERE ct.status = 'DONE'::organic.task_status)::numeric
          / NULLIF(count(*), 0)::numeric) AS pct_done
   FROM organic.client_tasks ct
     JOIN organic.task_definitions td ON td.id = ct.task_id
  WHERE ct.cycle IS NOT NULL
    AND td.active
  GROUP BY ct.org_id, ct.cycle, td.phase;

-- ---------------------------------------------------------------------
-- What a task is expected to hand back.
--
-- Most tasks produce a thing: a returned questionnaire, a brand book, a
-- granted access, an export. The app never said so, so every task carried
-- the same three generic questions asking people to narrate the work
-- instead of attach the result. This column is where the task states what
-- it wants back, next to the box that takes it.
--
-- Nullable on purpose: tasks with a real form of their own (the viability
-- gate, most of phases 2 and 3) already capture their output as structured
-- data and have nothing to attach.
-- ---------------------------------------------------------------------
ALTER TABLE organic.task_definitions
  ADD COLUMN IF NOT EXISTS expected_output text;
