-- The guidance on the two viability tasks still described the old question set.
--
-- 066 cut P1.0.1 from six good-fit signals to three and P1.0.2 from six red
-- flags to two, but the guidance line rendered above each form still listed
-- all twelve by name — including "high AOV" and "low-effort dropshipping",
-- which the form no longer asks about. Someone reading the guidance and then
-- the form sees a checklist that is missing half its items and reasonably
-- concludes the form is broken.
--
-- Guidance is copy, and copy that contradicts the thing it sits above is
-- worse than no copy: it is the sentence that gets believed.

UPDATE organic.task_definitions
   SET guidance = 'Three signals: more than 5 products or ideas, enough URL volume, existing visual assets. All three is a strong fit, two is workable if the red-flag check is clean.'
 WHERE id = 'P1.0.1';

UPDATE organic.task_definitions
   SET guidance = 'Two signals that hold you back: a single landing page, and a restricted or sensitive niche. One is survivable with the mitigation written down, both together is a decline.'
 WHERE id = 'P1.0.2';
