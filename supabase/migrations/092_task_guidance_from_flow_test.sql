-- Guidance corrections from the Valerie Mason flow test (06-09-2026).
--
-- A media buyer ran phase 1 and step 2.1 end to end and wrote down every
-- place the tool asked something she could not answer, or asked it in a way
-- that had no honest answer. This migration is the half of that feedback
-- which lives in the database; the questions themselves are in
-- src/lib/organic/task-fields.ts and change in the same commit.
--
-- The pattern in most of it: a task that does not apply to this store had no
-- visible way of saying so, so it sat there looking undone. Naming when a
-- task applies is not a change to the method — it is what the method meant.

-- Tools she had to go and find. "Measure page speed" named no tool at all,
-- and "Export competitor pins" named PinInspector without a link.
UPDATE organic.task_definitions
   SET external_tool = 'PageSpeed Insights',
       external_url  = 'https://pagespeed.web.dev/'
 WHERE id = 'P1.3.8';

UPDATE organic.task_definitions
   SET external_url = 'https://pininspector.com'
 WHERE id = 'P2.1.6' AND external_url IS NULL;

-- An account with no top performers yet: that is the finding, not a blank.
UPDATE organic.task_definitions
   SET expected_output = 'The top five to ten pins on outbound clicks and on saves, and the URLs behind them. '
                      || 'A fresh account that has no pins with clicks or saves yet is a finding in itself — record that '
                      || 'and skip the task with it as the reason, rather than leaving it open on numbers that cannot exist.'
 WHERE id = 'P1.2.14';

-- Reading page one is about the market, not about the store's own history.
UPDATE organic.task_definitions
   SET guidance = 'Search incognito, or use PinClicks to avoid personalisation bias. Look at the first 15 to 20 organic pins. '
               || 'This reads what Pinterest already rewards for the keyword, so it has nothing to do with whether the store '
               || 'itself has any history — it applies to a brand-new account exactly as it does to a takeover.'
 WHERE id = 'P2.1.2';

-- Re-optimising existing pins is a takeover task.
UPDATE organic.task_definitions
   SET guidance = 'Only applies to an account that already published organically — a fresh account has nothing to re-optimise, '
               || 'and skipping it with that reason is the right answer. For pins with impressions but no destination URL, add the '
               || 'correct link: those are the highest ROI edits. Then fix any pins with generic titles/descriptions on '
               || 'high-impression board pages. Cap yourself at 10 to 20 edits per day. Hard platform limit: 150 pin edits per day '
               || 'per account. Above that Pinterest rate-limits the whole account.'
 WHERE id = 'P1.3.16';

-- The three settings that need the owner's login. Saying so up front is the
-- difference between a task somebody can finish and one they get stuck on.
UPDATE organic.task_definitions
   SET guidance = guidance || ' Needs the account owner''s login — with partner access only, this is a request to the client. '
               || 'Record that in the box and skip; it is not something the organic operator can do.'
 WHERE id IN ('P1.3.6', 'P1.3.7', 'P1.3.15')
   AND guidance NOT LIKE '%owner''s login%';

-- How to actually perform the canonical check, and what to do with the answer.
UPDATE organic.task_definitions
   SET guidance = 'Open one of our pins, take the number out of its URL (pinterest.com/pin/<id>/) and open that URL in a private '
               || 'window. The account it lands on holds the canonical. Repeat for five to ten of the best performers. If another '
               || 'brand holds it, the clicks earned by our image land on their site — report it through Pinterest''s copyright form '
               || 'and record the reference.'
 WHERE id = 'P1.2.6';

-- The inactivity finding has to land on the client settings, not only in a note.
UPDATE organic.task_definitions
   SET guidance = 'Determines the account class. Longer than 6 months silent, or never posted, means NEW with 48-hour spacing, even '
               || 'on an old account. Record the number of months and the class here, and set the class on the client settings — '
               || 'the answers on this task do not write it there.'
 WHERE id = 'P1.2.11';
