-- 084 — P1.1.8 folds into P1.1.7: one question about the visual material.
--
-- WHY
-- ---
-- "Connect content drive" (P1.1.7) and "Other social content" (P1.1.8) asked
-- the same thing in two goes: where does the client's imagery live and is any
-- of it usable. In practice that is one conversation and one folder — the
-- client who sends a drive link sends the Instagram export with it. Two tasks
-- meant waiting on the same client twice, and two places where half the answer
-- could sit unfinished.
--
-- WHAT HAPPENS
-- ------------
-- P1.1.7 now covers both sources. P1.1.8 goes to active = false and its
-- client_tasks rows are removed; the definition row itself stays so migrations
-- 057 and 069 still point at something and the history stays readable.
--
-- The id is NOT reused and P1.1.9-P1.1.11 are NOT renumbered. Renumbering an
-- SOP whose ids appear in guidance prose, preconditions, the research record
-- and CLAUDE.md buys nothing and breaks all of it. Step 1 has a gap at 8.
--
-- WHAT IS KEPT
-- ------------
-- Notes on P1.1.8 are appended to P1.1.7's under a header, and the minutes are
-- summed. There are no task_answers and no assets on P1.1.8 (checked
-- 27-08-2026), and nothing required it as a precondition — only P1.1.8 itself
-- hung off P1.0.4.
--
-- AND WHAT IS ROLLED BACK
-- -----------------------
-- A store where P1.1.7 was DONE but P1.1.8 was not is not finished with the
-- merged task: the half that was about social was never done. That one goes
-- back to IN_PROGRESS. The other way round changes nothing — it was open
-- already.
--
-- Idempotent: every step keys off P1.1.8 rows still existing.

-- 1. P1.1.7 now covers both sources.
UPDATE organic.task_definitions
   SET expected_output =
         'One link covering the client''s existing visual material — the content drive plus whatever ' ||
         'Instagram and TikTok hold, uncompressed and without watermarks — and one line on what is in ' ||
         'it. White backgrounds only means the AI route becomes mandatory, so say so here.',
       guidance =
         'Record the link and assess the quality; two things here decide the whole design route later. ' ||
         'White backgrounds only makes the AI route mandatory. Social exports carrying a watermark are ' ||
         'penalised by the algorithm, so ask for the originals rather than what is on the profile.'
 WHERE id = 'P1.1.7';

-- 2. Notes and time spent move from P1.1.8 to P1.1.7.
UPDATE organic.client_tasks t7
   SET notes = CASE
                 WHEN COALESCE(NULLIF(TRIM(t8.notes), ''), '') = '' THEN t7.notes
                 ELSE COALESCE(NULLIF(TRIM(t7.notes), '') || E'\n\n', '')
                      || E'--- carried over from P1.1.8 (Other social content) ---\n'
                      || t8.notes
               END,
       time_spent_min = NULLIF(COALESCE(t7.time_spent_min, 0) + COALESCE(t8.time_spent_min, 0), 0),
       started_at = LEAST(COALESCE(t7.started_at, t8.started_at), COALESCE(t8.started_at, t7.started_at))
  FROM organic.client_tasks t8
 WHERE t8.task_id = 'P1.1.8'
   AND t7.task_id = 'P1.1.7'
   AND t7.org_id  = t8.org_id
   AND t7.cycle IS NOT DISTINCT FROM t8.cycle;

-- 3. A finished P1.1.7 reopens where the social half was not finished.
UPDATE organic.client_tasks t7
   SET status = 'IN_PROGRESS'::organic.task_status,
       completed_at = NULL
  FROM organic.client_tasks t8
 WHERE t8.task_id = 'P1.1.8'
   AND t7.task_id = 'P1.1.7'
   AND t7.org_id  = t8.org_id
   AND t7.cycle IS NOT DISTINCT FROM t8.cycle
   AND t7.status = 'DONE'
   AND t8.status NOT IN ('DONE', 'SKIPPED');

-- 4. P1.1.8 leaves the boards.
DELETE FROM organic.task_preconditions WHERE task_id = 'P1.1.8';
DELETE FROM organic.client_tasks       WHERE task_id = 'P1.1.8';

-- 5. And is never instantiated again — activate.ts reads active = true.
UPDATE organic.task_definitions SET active = false WHERE id = 'P1.1.8';
