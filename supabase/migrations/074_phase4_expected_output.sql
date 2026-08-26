-- Say what each phase-4 task hands back, and where the work happens.
--
-- Fifteen of the twenty-two had no expected_output. Combined with the cycle
-- panel rendering them as a read-only list of id, name and status pill, a
-- manager opening phase 4 could see that P4.2.5 existed and was TODO, and
-- had nowhere to learn what it wanted, no way to record it and no way to
-- close it. Phases 1 to 3 have had all of that from the start; there was
-- never a reason for a cycle task to work differently.
--
-- AUTO tasks get a line too. "The system does it" is not the same as "there
-- is nothing to check", and the line says what to look at when the output
-- is wrong — which is exactly when somebody opens the task.

UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — the list builds itself from cooldown, topic coverage and board assignment. If it is empty, the panel at the top of phase 4 says which of the three is holding each URL up.'
 WHERE id = 'P4.1.1';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back. URLs whose peak falls eight to twelve weeks out surface automatically; set the peak window on the URL if one is missing here.'
 WHERE id = 'P4.1.2';
UPDATE organic.task_definitions SET expected_output =
  'The reason from the fixed list, plus a note where the list does not capture it. This is the only record of why the month looked the way it did, and next month''s selection is judged against it.'
 WHERE id = 'P4.1.5';
UPDATE organic.task_definitions SET expected_output =
  'Up to five keywords with one marked primary. The keyword picker ranks gridded terms first, because the design brief can only set format and colour from a keyword that has a grid row.'
 WHERE id = 'P4.1.6';
UPDATE organic.task_definitions SET expected_output =
  'At least five semantically relevant boards. The picker ranks by what has already won on this account, then topic, then the approved Steal List. Fewer than five is allowed and will be flagged, not blocked.'
 WHERE id = 'P4.1.7';
UPDATE organic.task_definitions SET expected_output =
  'Three to five descriptive long-tail terms per URL. They become the text-overlay hook, so they have to work as a phrase somebody reads on an image, not as a keyword list.'
 WHERE id = 'P4.1.8';
UPDATE organic.task_definitions SET expected_output =
  'DIRECT or AI, and one line on why. Direct where the client has usable lifestyle material, AI where they do not — the design brief and the image prompt both branch on this.'
 WHERE id = 'P4.2.2';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — the brief is generated from the grid, the brand book, the taste graph and what has already won. Read it before designing; it names any research that was missing.'
 WHERE id = 'P4.2.3';
UPDATE organic.task_definitions SET expected_output =
  'Three micro-crops per design, twelve in total, attached. The image is the heaviest freshness signal after the URL, so the crops are what keep the sixteen pins from reading as one pin repeated.'
 WHERE id = 'P4.2.5';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — file names are generated lowercase, hyphenated and keyword-bearing. Check they survived the export; design tools rename on download.'
 WHERE id = 'P4.2.6';
UPDATE organic.task_definitions SET expected_output =
  'Four copy sets, drafted from the brand book and the account''s own research, then approved by you. A regenerate resets approval, so approve last.'
 WHERE id = 'P4.2.8';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — the validator enforces title length and keyword position, description 250 to 300, no exclamation marks, hashtags or dashes, and the brand book''s banned words. A fail names the rule.'
 WHERE id = 'P4.2.9';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — sixteen pins, dates and board rotation are computed. Check the spread before approving: every board should get every design.'
 WHERE id = 'P4.3.1';
UPDATE organic.task_definitions SET expected_output =
  'Your approval on the calendar, and a note if you changed the spacing or the start date. Nothing is scheduled until this is given.'
 WHERE id = 'P4.3.2';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back — pins go to Pinterest as standard pins over the API. If any failed, the reason is on the pin and on the Overview leak panel.'
 WHERE id = 'P4.4.1';
UPDATE organic.task_definitions SET expected_output =
  'Nothing to hand back unless something failed. Act on what surfaces: a rate limit queues itself, an expired token does not — that one needs a reconnect before the next cycle.'
 WHERE id = 'P4.4.2';
