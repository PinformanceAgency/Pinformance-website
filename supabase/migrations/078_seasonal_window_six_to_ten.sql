-- The seasonal window is 6 to 10 weeks, per the build reference's section 2.
--
-- The phase-4 prose in the same document says 8 to 12. Section 2 is headed
-- "HARD RULES — NUMERIC REFERENCE" and wins. The code query and the task
-- copy were both on 8-12, so the two now agree on 6-10.
--
-- The direction of the disagreement matters: publishing late is named as
-- the single most common failure in the method, so an earlier window is the
-- safe side of a contradiction to land on.

UPDATE organic.task_definitions
   SET guidance = 'URLs whose peak falls six to ten weeks out. Publishing late is the most common failure there is — earlier is recoverable, late is not.',
       expected_output = 'Nothing to hand back. URLs whose peak falls six to ten weeks out surface automatically; set the peak window on the URL if one is missing here.'
 WHERE id = 'P4.1.2';
