-- Decisions taken on the Valerie Mason flow test feedback, 06-09-2026.
--
-- Two of them, both agreed with Tristan rather than derived from the build
-- reference — which is why they are written down here as well as applied.

-- 1. P2.1.6's 700-1000 pins per competitor is a target, not a floor.
--
-- The operator's point: few competitors in a normal niche have that many
-- pins, so the task as written cannot be finished honestly on most accounts,
-- and choosing competitors by pin volume would select for accounts that are
-- already fully organic-optimised rather than the ones we actually compete
-- with. Take what the competitor has and record how many it was: the number
-- is a finding about the niche, and P2.2.1 reasons over what arrived, not
-- over a quota.
UPDATE organic.task_definitions
   SET guidance = 'Seven hundred to a thousand pins per competitor where the competitor has them, and everything '
               || 'they do have where they do not — the count per competitor is itself a finding about the niche. '
               || 'Five to ten competitors. Manual, do not automate.',
       expected_output = 'The parsed exports, imported per competitor on the upload screen above: 700-1000 pins each '
               || 'where that many exist, otherwise everything the competitor has. Five to ten competitors — the '
               || 'coverage line tells you which are still missing, and the imported count per competitor is recorded '
               || 'with them. Attach the link to wherever the raw CSVs live (Drive) so the export can be traced back '
               || 'later; it lands in the Assets library as a PinInspector export automatically.'
 WHERE id = 'P2.1.6';

-- 2. P2.2.1 named inputs the code does not use.
--
-- The guidance said the prompt is fed with the questionnaire, brand book,
-- catalogue, tone of voice and grid analysis. generateMarketAnalysis feeds
-- the intake, the taste graph, the grid analyses and the competitors. The
-- operator went looking for where to attach a brand book. Say what it
-- actually reads; the brand book reaches phase 4 through brand_rules, which
-- is a different task and a different moment.
UPDATE organic.task_definitions
   SET guidance = 'The prompt is assembled server-side from the intake questionnaire, the taste graph, the grid '
               || 'analyses and the competitor list — there is nothing to paste and nothing to attach. Output is a '
               || 'Steal List, board gaps and content angles, each approvable one by one in P2.2.2.'
 WHERE id = 'P2.2.1';
