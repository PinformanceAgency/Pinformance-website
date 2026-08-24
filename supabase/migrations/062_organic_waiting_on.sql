-- STAGE 4 · "waiting on client" needs somewhere to live.
--
-- Brief 3.2 singles this out: in most agencies waiting on the client is
-- the largest single cause of delay and nobody measures it. We did not
-- measure it either — organic.client_tasks has a BLOCKED status, but the
-- reason behind it is recomputed at read time from SOP preconditions
-- ("P1.1 is not done yet"). That answers which task is in the way; it
-- cannot answer who we are waiting on.
--
-- These two columns are set by a manager, deliberately. Nothing infers
-- them: an inferred "waiting on client" is worse than an absent one,
-- because it would be quoted back to a client in a QBR.
--
-- waiting_since is separate from client_tasks.started_at so the duration
-- reported is how long we have been stuck, not how long the task has been
-- open — a task can be picked up, worked, and only later become blocked.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                  WHERE n.nspname = 'organic' AND t.typname = 'waiting_on') THEN
    CREATE TYPE organic.waiting_on AS ENUM (
      'CLIENT',     -- answers, approvals, brand decisions
      'ACCESS',     -- Pinterest, GA4, Shopify, ad account credentials
      'ASSETS',     -- photography, product shots, copy from the brand
      'INTERNAL',   -- us: capacity, a decision we owe, a dependency we own
      'THIRD_PARTY' -- a tool, an API, an external supplier
    );
  END IF;
END $$;

ALTER TABLE organic.client_tasks
  ADD COLUMN IF NOT EXISTS waiting_on    organic.waiting_on,
  ADD COLUMN IF NOT EXISTS waiting_since date,
  ADD COLUMN IF NOT EXISTS waiting_note  text;

-- A cause without a date gives a count but no ageing, which is the half
-- of the number that actually drives a conversation. Keep them together.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_tasks_waiting_needs_date') THEN
    ALTER TABLE organic.client_tasks
      ADD CONSTRAINT client_tasks_waiting_needs_date
      CHECK (waiting_on IS NULL OR waiting_since IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS client_tasks_waiting_idx
  ON organic.client_tasks (waiting_on, waiting_since)
  WHERE waiting_on IS NOT NULL;

COMMENT ON COLUMN organic.client_tasks.waiting_on IS
  'Who the task is blocked on. Set by a manager — never inferred.';
COMMENT ON COLUMN organic.client_tasks.waiting_since IS
  'When it became blocked. Not started_at: a task can be worked and only later stall.';
