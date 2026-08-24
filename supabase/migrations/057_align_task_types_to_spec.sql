-- Align every task_type to the specification.
--
-- The reconcile run found 39 of 116 spec tasks carrying the wrong type.
-- task_type is not cosmetic: it drives the UI pattern each task renders
-- (AUTO gets a run-button, EXTERNAL gets a do-it-elsewhere-and-paste-back
-- flow, IN_DASHBOARD gets a form, AI_DRAFT gets a generate-and-approve
-- flow). A wrong type means the operator gets the wrong interface.
--
-- Distribution before this migration (116 spec tasks):
--   IN_DASHBOARD  46 (40%)  spec wants 43 (37%)
--   EXTERNAL      15 (13%)  spec wants 37 (32%)   ← 22 too few
--   AUTO          42 (36%)  spec wants 30 (26%)   ← 12 too many
--   AI_DRAFT      13 (11%)  spec wants  6 ( 5%)   ←  7 too many
--
-- The build drifted toward automation. The spec is deliberately
-- conservative: AUTO only where no judgement is involved and an error is
-- costly; AI_DRAFT only where volume makes manual work unsustainable.
-- Roughly three quarters of tasks should involve human judgement.
--
-- The seven AI_DRAFT demotions are the most consequential — board
-- architecture, seasonal classification, board list, seeding selection,
-- keyword assignment and board assignment are all judgement calls the
-- spec explicitly keeps human.

-- ---- EXTERNAL: work happens in another tool, result comes back here ----
UPDATE organic.task_definitions SET task_type = 'EXTERNAL'::organic.task_type
 WHERE id IN (
   'P1.1.4',   -- Google Search Console (was IN_DASHBOARD)
   'P1.1.7',   -- Connect content drive (was IN_DASHBOARD)
   'P1.1.8',   -- Other social content (was IN_DASHBOARD)
   'P1.2.6',   -- Canonical pin ID check (was IN_DASHBOARD)
   'P1.3.2',   -- Claim domain (was AUTO)
   'P1.3.3',   -- Pinterest tag (was IN_DASHBOARD)
   'P1.3.4',   -- Connect catalogue (was IN_DASHBOARD)
   'P1.3.6',   -- Turn off shopping recommendations (was IN_DASHBOARD)
   'P1.3.7',   -- Limit messages (was IN_DASHBOARD)
   'P1.3.8',   -- Measure page speed (was AUTO)
   'P1.3.11',  -- Meta descriptions (was AUTO)
   'P1.3.12',  -- Save buttons on the site (was IN_DASHBOARD)
   'P1.3.13',  -- Mobile experience (was IN_DASHBOARD)
   'P2.3.2',   -- Read Audience Insights (was IN_DASHBOARD)
   'P2.4.1',   -- Determine competitor velocity (was IN_DASHBOARD)
   'P3.1.1',   -- Candidates from the search bar (was IN_DASHBOARD)
   'P3.1.2',   -- Candidates from bubbles (was IN_DASHBOARD)
   'P3.1.5',   -- Recognise a cloaked niche (was AUTO)
   'P4.2.1',   -- Grid analysis before designing (was IN_DASHBOARD)
   'P4.2.5',   -- Generate fresh copies (was AUTO)
   'P5.1.2',   -- Pull GA4 data (was AUTO)
   'P5.3.1',   -- Check Pinterest Trends (was IN_DASHBOARD)
   'P5.3.2'    -- Check Shopping Trends (was IN_DASHBOARD)
 );

-- ---- IN_DASHBOARD: human judgement, structured input ----
UPDATE organic.task_definitions SET task_type = 'IN_DASHBOARD'::organic.task_type
 WHERE id IN (
   'P1.2.7',   -- Board architecture audit (was AI_DRAFT — renaming boards
               --   to exact parent interests is judgement, the system may
               --   suggest taxonomy matches but must not rename)
   'P1.2.12',  -- Shadowban signals (was AUTO — reading an impression curve
               --   for a downgrade pattern is interpretation)
   'P1.3.9',   -- Review URL slugs (was AI_DRAFT)
   'P1.3.10',  -- Image file names (was AUTO)
   'P2.1.7',   -- Collect top pin designs (was EXTERNAL — structured capture
               --   happens in the dashboard)
   'P3.1.12',  -- Seasonal classification (was AI_DRAFT — reading the Trends
               --   curve is a human call; MICRO_TREND exclusion is the only
               --   automated part)
   'P3.3.1',   -- Finalise board list (was AI_DRAFT — the system proposes
               --   candidates, the librarian decides)
   'P3.3.6',   -- Select seeding pins (was AI_DRAFT — system ranks, human
               --   picks; competitor content must never leak in)
   'P4.1.6',   -- Assign keywords (was AI_DRAFT)
   'P4.1.7',   -- Assign boards (was AI_DRAFT — semantic relevance is exactly
               --   the judgement the spec calls out: swimwear does not
               --   belong on a strapless bra board)
   'P4.1.8',   -- Long-tail to the design brief (was AUTO)
   'P4.2.2',   -- Determine route (was AUTO — system pre-selects from the
               --   recorded content quality, human confirms)
   'P5.1.3',   -- Explain the attribution gap (was AUTO)
   'P5.2.3',   -- Update the design brief (was AUTO)
   'P5.3.4'    -- Next month roadmap (was AUTO — the system combines the
               --   candidate sources, the manager confirms the list)
 );

-- ---- AUTO: no judgement, error is costly ----
UPDATE organic.task_definitions SET task_type = 'AUTO'::organic.task_type
 WHERE id IN (
   'P1.2.13'   -- Analytics baseline (was IN_DASHBOARD — thirteen KPIs across
               --   three periods, manually transcribed, is where errors
               --   enter; human still fills the GA4 figures the API lacks)
 );

-- AI_DRAFT stays exactly where the spec puts it: P2.2.1, P3.2.1, P3.2.2,
-- P3.3.3, P4.2.8, P5.3.3. Every other AI_DRAFT assignment was drift and is
-- demoted above.
