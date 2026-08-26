-- The three phase-5 tasks with no stated output.
--
-- Same reasoning as 074 for phase 4: an AUTO task still needs a line, because
-- "the system does it" is not "there is nothing to check", and the moment
-- somebody opens the task is the moment the output looked wrong.

UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — the pull is automatic. What matters is that the filters were right: Organic, Claimed Domain, Your Pins, real-time off. A number that looks wrong is usually a filter, not the maths.'
 WHERE id = 'P5.1.1';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — winners are computed from published pins and their performance. Read them: the click winners tell you which layout to reuse, the save winners which photography to replicate.'
 WHERE id = 'P5.2.1';
UPDATE organic.task_definitions SET expected_output =
  'A forward-looking note for the client: what is rising on Pinterest now, and what that says about the next sixty to ninety days. This is what turns the report from a record of last month into advice.'
 WHERE id = 'P5.3.3';
