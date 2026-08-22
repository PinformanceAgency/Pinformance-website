-- Phase 1 organic workflow: viability gate + skip metadata + settings domain.
--
-- The viability verdict (P1.0.4) is the entry gate for phase 1 — every
-- subsequent task in steps 1, 2 and 3 must wait until P1.0.4 is DONE.
-- Existing per-task preconditions (P1.2.1 → P1.1.2 etc) are preserved and
-- AND-combined with the new gate.
--
-- Skip flow: any task can be set to SKIPPED, but only with a reason picked
-- from a fixed list and an optional free-text note. A SKIPPED status does
-- NOT satisfy the DONE-only precondition check in src/lib/organic/status.ts
-- (that check compares strictly against 'DONE').

-- 1. Domain lives on client_settings — needed as early as P1.0.3 (sitemap
--    count), well before the intake form fills client_intake.
ALTER TABLE organic.client_settings
  ADD COLUMN IF NOT EXISTS domain text;

-- 2. Skip metadata on client_tasks.
ALTER TABLE organic.client_tasks
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS skip_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_tasks_skip_reason_valid'
  ) THEN
    ALTER TABLE organic.client_tasks
      ADD CONSTRAINT client_tasks_skip_reason_valid
      CHECK (skip_reason IS NULL OR skip_reason IN
        ('NOT_APPLICABLE','CLIENT_REFUSED','ALREADY_DONE','BLOCKED_EXTERNAL','OTHER'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'client_tasks_skip_reason_required'
  ) THEN
    ALTER TABLE organic.client_tasks
      ADD CONSTRAINT client_tasks_skip_reason_required
      CHECK (status <> 'SKIPPED' OR skip_reason IS NOT NULL);
  END IF;
END $$;

-- 3. Idempotency for task_preconditions inserts. COALESCE'd so (task_id,
--    task_id, NULL) and (task_id, NULL, check) both hash uniquely.
CREATE UNIQUE INDEX IF NOT EXISTS task_preconditions_uniq_idx
  ON organic.task_preconditions
     (task_id, COALESCE(requires_task_id, ''), COALESCE(requires_check, ''));

-- 4. The gate: every task in P1.1.*, P1.2.*, P1.3.* requires P1.0.4 DONE.
--    Skip rows that already exist (idempotent).
INSERT INTO organic.task_preconditions (task_id, requires_task_id)
SELECT td.id, 'P1.0.4'
  FROM organic.task_definitions td
 WHERE (td.id LIKE 'P1.1.%' OR td.id LIKE 'P1.2.%' OR td.id LIKE 'P1.3.%')
   AND NOT EXISTS (
     SELECT 1 FROM organic.task_preconditions p
      WHERE p.task_id = td.id AND p.requires_task_id = 'P1.0.4'
   );
