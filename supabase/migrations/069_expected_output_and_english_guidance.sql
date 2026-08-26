-- What each task hands back, and guidance in one language.
--
-- PART 1 · expected_output
--
-- Every task without a form of its own used to carry the same three
-- questions: what did you do, what did you find, what did you decide.
-- "Collect brand book" does not want three paragraphs about fetching a
-- brand book. It wants the brand book. So each of those tasks now states
-- the artefact it expects, rendered directly above the box that takes it.
--
-- Left null deliberately where a task has its own form (the viability
-- gate, most of phases 2 and 3) or its own written checklist (phase 1
-- step 3): those capture their output as structured data and have nothing
-- to attach. A prompt asking for a file that does not exist is noise.
--
-- PART 2 · guidance in English
--
-- Nine tasks in phases 4 and 5 had Dutch guidance sitting in the rendered
-- UI, against the standing rule that everything a user reads is English.
-- They are translated here rather than left for later: guidance is read
-- most by whoever knows the SOP least, which is exactly the person who
-- cannot read around a language switch.

-- ---------------------------------------------------------------------
-- PART 1 · what each task hands back
-- ---------------------------------------------------------------------

-- Step 1.1 · Intake & access
UPDATE organic.task_definitions SET expected_output =
  'The completed questionnaire back from the client — attach the file or paste the link to their response.'
 WHERE id = 'P1.1.1';
UPDATE organic.task_definitions SET expected_output =
  'Confirmation that Analyst access is granted: which GA4 property, and to which account.'
 WHERE id = 'P1.1.3';
UPDATE organic.task_definitions SET expected_output =
  'Access granted, plus the Performance export showing which queries and pages already rank.'
 WHERE id = 'P1.1.4';
UPDATE organic.task_definitions SET expected_output =
  'The brand book itself — logo as a transparent PNG, hex codes, typography. Attach the file or the drive link.'
 WHERE id = 'P1.1.6';
UPDATE organic.task_definitions SET expected_output =
  'The drive link, plus one line on what is in it. White backgrounds only means the AI route becomes mandatory, so say so here.'
 WHERE id = 'P1.1.7';
UPDATE organic.task_definitions SET expected_output =
  'The Instagram and TikTok material, uncompressed and without watermarks. Attach the folder link.'
 WHERE id = 'P1.1.8';
UPDATE organic.task_definitions SET expected_output =
  'The keyword list from the client''s SEO or ads side. Attach the export — it is direction for phase 2, not a bank.'
 WHERE id = 'P1.1.9';
UPDATE organic.task_definitions SET expected_output =
  'The client''s existing persona or audience document. Attach it — it feeds the taste graph in phase 2.'
 WHERE id = 'P1.1.10';
UPDATE organic.task_definitions SET expected_output =
  'The XML or CSV feed URL, and confirmation that it loads.'
 WHERE id = 'P1.1.11';

-- Step 1.2 · Account audit
UPDATE organic.task_definitions SET expected_output =
  'Whether the domain is blocked. If it is, the support ticket reference.'
 WHERE id = 'P1.2.1';
UPDATE organic.task_definitions SET expected_output =
  'The flagged-pin report, uploaded. The system turns the status codes into priorities.'
 WHERE id = 'P1.2.2';
UPDATE organic.task_definitions SET expected_output =
  'The broken redirects and canonical errors found, and which of them have been fixed.'
 WHERE id = 'P1.2.3';
UPDATE organic.task_definitions SET expected_output =
  'How many pins point at the homepage, and where they now point instead.'
 WHERE id = 'P1.2.4';
UPDATE organic.task_definitions SET expected_output =
  'The pins with no destination, and the URL each one now carries.'
 WHERE id = 'P1.2.5';
UPDATE organic.task_definitions SET expected_output =
  'Whether another brand holds the canonical pin, with the pin URL you checked.'
 WHERE id = 'P1.2.6';
UPDATE organic.task_definitions SET expected_output =
  'The renames: each cryptic board name against the exact parent interest it becomes.'
 WHERE id = 'P1.2.7';
UPDATE organic.task_definitions SET expected_output =
  'The group boards found, and whether each was left in place or archived.'
 WHERE id = 'P1.2.8';
UPDATE organic.task_definitions SET expected_output =
  'The boards under ten pins, and which were set back to secret.'
 WHERE id = 'P1.2.9';
UPDATE organic.task_definitions SET expected_output =
  'Whether title and price appear automatically in the Pin Builder. Attach the screenshot.'
 WHERE id = 'P1.2.10';
UPDATE organic.task_definitions SET expected_output =
  'The inactivity period, and the account class it sets.'
 WHERE id = 'P1.2.11';
UPDATE organic.task_definitions SET expected_output =
  'The shadowban signals found — or a clear statement that there are none.'
 WHERE id = 'P1.2.12';
UPDATE organic.task_definitions SET expected_output =
  'The top five to ten pins on outbound clicks and on saves, and the URLs behind them.'
 WHERE id = 'P1.2.14';
UPDATE organic.task_definitions SET expected_output =
  'The annotated interests PinClicks returned per pin — candidates for the keyword bank.'
 WHERE id = 'P1.2.15';

-- Phase 4 · cycle work that produces something
UPDATE organic.task_definitions SET expected_output =
  'What the client said about launches and new blog posts, with dates where they gave them.'
 WHERE id = 'P4.1.3';
UPDATE organic.task_definitions SET expected_output =
  'Why these URLs and not the others — the reasoning is what makes next month''s selection better than this one.'
 WHERE id = 'P4.1.4';
UPDATE organic.task_definitions SET expected_output =
  'The grid finding per keyword: what Pinterest is rewarding right now, and what that means for the designs.'
 WHERE id = 'P4.2.1';
UPDATE organic.task_definitions SET expected_output =
  'The four designs, attached, plus which route produced them.'
 WHERE id = 'P4.2.4';
UPDATE organic.task_definitions SET expected_output =
  'What the QC caught, and what was sent back. A clean pass is worth recording too.'
 WHERE id = 'P4.2.7';
UPDATE organic.task_definitions SET expected_output =
  'The copy the validator cannot judge: does it sound like the brand, does it match the image, does the landing page deliver it.'
 WHERE id = 'P4.2.10';

-- Phase 5 · reporting and review
UPDATE organic.task_definitions SET expected_output =
  'The GA4 export — session duration, bounce rate, pages per session. Attach it.'
 WHERE id = 'P5.1.2';
UPDATE organic.task_definitions SET expected_output =
  'The gap in numbers for this client, and the sentence you will put in front of them about it.'
 WHERE id = 'P5.1.3';
UPDATE organic.task_definitions SET expected_output =
  'The updated dashboard link, and what changed on it this month.'
 WHERE id = 'P5.1.4';
UPDATE organic.task_definitions SET expected_output =
  'Which design on which board worked, and why. High clicks means a strong hook, high saves a strong aesthetic.'
 WHERE id = 'P5.2.2';
UPDATE organic.task_definitions SET expected_output =
  'The templates now marked as proven, and what was retired.'
 WHERE id = 'P5.2.3';
UPDATE organic.task_definitions SET expected_output =
  'The emerging searches found, and which of them fit the taste graph.'
 WHERE id = 'P5.3.1';
UPDATE organic.task_definitions SET expected_output =
  'Which product categories are rising, as advice the client can act on for stock and focus.'
 WHERE id = 'P5.3.2';
UPDATE organic.task_definitions SET expected_output =
  'Next month''s candidate list: the trends and the winners that will drive URL selection.'
 WHERE id = 'P5.3.4';
UPDATE organic.task_definitions SET expected_output =
  'The six audiences, exported and handed to the paid side, with the date of the handover.'
 WHERE id = 'P5.4.1';
UPDATE organic.task_definitions SET expected_output =
  'What was retired from the keyword bank and the board architecture, and what replaced it.'
 WHERE id = 'P5.5.1';

-- ---------------------------------------------------------------------
-- PART 2 · the nine Dutch guidance lines, in English
-- ---------------------------------------------------------------------
UPDATE organic.task_definitions SET guidance =
  'Only what the validator cannot judge: does it sound like the brand, does it match the image, does the landing page deliver what the copy promises.'
 WHERE id = 'P4.2.10';
UPDATE organic.task_definitions SET guidance =
  'Sixteen pins, dates and board rotation. Design 1 goes to boards 1-2-3-4, design 2 to 2-3-4-1. Every board gets every design, spread over time.'
 WHERE id = 'P4.3.1';
UPDATE organic.task_definitions SET guidance =
  'A visual calendar. Check the spread before anything is scheduled.'
 WHERE id = 'P4.3.2';
UPDATE organic.task_definitions SET guidance =
  'Via the API. Always standard pins, never the simplified or idea format: those are barely distributed.'
 WHERE id = 'P4.4.1';
UPDATE organic.task_definitions SET guidance =
  'Flag errors, queue on rate limits, report expired tokens.'
 WHERE id = 'P4.4.2';
UPDATE organic.task_definitions SET guidance =
  'Filters fixed: Organic, Claimed Domain, Your Pins, and realtime data off. This is the source of truth for volume.'
 WHERE id = 'P5.1.1';
UPDATE organic.task_definitions SET guidance =
  'More than eighty percent happens inside the Pinterest app, where the referral tag is lost. That traffic shows up as direct, so the raw number always understates Pinterest.'
 WHERE id = 'P5.1.3';
UPDATE organic.task_definitions SET guidance =
  'Four panels: acquisition, behaviour, conversion, and Pinterest against the other channels.'
 WHERE id = 'P5.1.4';
UPDATE organic.task_definitions SET guidance =
  'Top 3 to 5 on outbound clicks and separately on saves. Not on impressions.'
 WHERE id = 'P5.2.1';
UPDATE organic.task_definitions SET guidance =
  'Which design on which board worked, and why. High clicks means a strong hook, high saves a strong aesthetic.'
 WHERE id = 'P5.2.2';
UPDATE organic.task_definitions SET guidance =
  'Mark winning templates as proven. This is how each client converges on a handful of layouts that work.'
 WHERE id = 'P5.2.3';
UPDATE organic.task_definitions SET guidance =
  'Which product categories are rising. Directly usable advice for the client on stock and focus.'
 WHERE id = 'P5.3.2';
UPDATE organic.task_definitions SET guidance =
  'What rises on Pinterest rises on Google weeks later. That is what makes the reporting strategic rather than backward-looking.'
 WHERE id = 'P5.3.3';
UPDATE organic.task_definitions SET guidance =
  'Trends plus winners become the candidate list for next month''s URL selection. That closes the loop.'
 WHERE id = 'P5.3.4';
