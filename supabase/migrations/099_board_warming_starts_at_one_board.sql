-- 099 — board warming starts when the FIRST board exists, not when the last does.
--
-- P3.3.6 (choose the seed pins) waited on P3.3.5 (create the boards) being
-- DONE, and P3.3.5 only closes when the whole creation queue is empty. Boards
-- are created three a day — module 4, enforced by check_board_pace() — so a
-- store with 29 designed boards could not begin warming a single one for ten
-- days, and a store with 15 for five. Measured 15-09-2026 on Roha Home (14
-- left) and The Longevity store (26 left).
--
-- Nothing in the method says that. Module 2 warms a board as soon as it
-- exists: create it hidden, save ten to fifteen of the client's own pins onto
-- it, then make it public. That is a per-board loop, and the SOP's numbering
-- is the order the steps are *started* in, never a bar across the store.
--
-- The pace is untouched: the boards keep appearing three a day, the seeding
-- cron keeps saving ten a day, and P3.3.5 still holds at IN_PROGRESS while the
-- queue has anything in it — which is the flag that says the architecture is
-- not finished yet. What changes is only that the rest of the store no longer
-- waits for it.
--
-- 'boards_exist' is a requires_check rather than a task dependency because it
-- asks about the STORE ("is there anything on the account to warm"), which is
-- what that mechanism is for, and because it re-answers itself as the boards
-- appear instead of waiting for somebody to close a task.

DELETE FROM organic.task_preconditions
 WHERE task_id = 'P3.3.6' AND requires_task_id = 'P3.3.5';

INSERT INTO organic.task_preconditions (task_id, requires_task_id, requires_check)
SELECT 'P3.3.6', NULL, 'boards_exist'
 WHERE NOT EXISTS (
   SELECT 1 FROM organic.task_preconditions
    WHERE task_id = 'P3.3.6' AND requires_check = 'boards_exist'
 );

-- P3.3.7 keeps waiting on P3.3.6: you cannot save a seed pin nobody has
-- chosen, and that one IS an order-of-work dependency inside the same loop.

-- Say it on the task, so the person reading it knows the architecture is
-- still being built out underneath them.
UPDATE organic.task_definitions
   SET guidance = COALESCE(guidance || E'\n\n', '') ||
       'This opens as soon as the first board exists on Pinterest — you do not wait for all of them. ' ||
       'Boards keep being created three a day in the background, and each new one can be warmed the day it appears. ' ||
       'The boards library shows how many are still to come.'
 WHERE id = 'P3.3.6'
   AND (guidance IS NULL OR guidance NOT LIKE '%as soon as the first board exists%');
