-- The last two tasks with neither a control nor a stated output.
--
-- Found by a coverage sweep across all 119 active tasks rather than by
-- reading screens: both are EXTERNAL, both sat between the tasks that do
-- have forms, and neither said what it hands back — so a manager reaching
-- them had guidance and nowhere for the result to go.
--
-- P2.1.2 is the looking; P2.1.3 is the recording. That is a real pairing
-- and not a defect, but the task has to say so, otherwise it reads as a
-- form that failed to load.

UPDATE organic.task_definitions SET expected_output =
  'Nothing here — the next task (P2.1.3) is the form this feeds. Look at the first fifteen to twenty organic pins per seed keyword, incognito so personalisation does not colour it, then record what you saw there.'
 WHERE id = 'P2.1.2';

UPDATE organic.task_definitions SET expected_output =
  'The profile photo and cover, live on the account. Check the cover on desktop AND mobile before calling it done — the crop differs and a cover that works on one is regularly unreadable on the other.'
 WHERE id = 'P3.2.3';
