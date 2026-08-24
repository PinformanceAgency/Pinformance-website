-- Corrective migration for 055: the SEO strategy review INSERT collided
-- with an existing P5.3.1 "Check Pinterest Trends" row (ON CONFLICT DO
-- UPDATE overwrote guidance/sort_order/is_recurring but kept the name).
-- Restore P5.3.1 as a monthly "Check Pinterest Trends" task and move the
-- 6-month SEO strategy review to a fresh unused ID at P5.5.1.

-- Restore P5.3.1 to a reasonable "Check Pinterest Trends" guidance +
-- monthly sort_order. is_recurring stays true (it was set by 055 and is
-- correct for a monthly recurring task).
UPDATE organic.task_definitions
   SET guidance = 'Monthly check of Pinterest Trends for the client''s niche. Look for emerging searches that align with the taste graph, note any that jump into the top-10 for a parent interest, and feed those into the next keyword-bank refresh. Trends move faster than the 6-month SEO review, so this is the short-loop signal.',
       sort_order = 1130
 WHERE id = 'P5.3.1';

-- 6-month SEO review — fresh id at P5.5.1.
INSERT INTO organic.task_definitions
  (id, phase, step, name, description, task_type, sort_order, is_recurring, guidance, active)
VALUES
  ('P5.5.1', 5, '5', 'SEO strategy review (6-monthly)', NULL,
   'IN_DASHBOARD'::organic.task_type, 1300, true,
   'Every six months, review the full keyword bank, board architecture and competitor set. Retire under-performing keywords, add newly discovered ones (recompute against the shared volume cache), audit whether topic coverage still holds, refresh the competitor list against churn on Pinterest. Output is a written strategy delta the manager sends to the client.',
   true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  guidance = EXCLUDED.guidance,
  sort_order = EXCLUDED.sort_order,
  is_recurring = EXCLUDED.is_recurring;
