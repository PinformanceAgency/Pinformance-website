-- P2.1.6 — make a competitor-pin import repeatable.
--
-- The import wrote plain INSERTs with no constraint behind them, so a run
-- that died halfway (700-1000 rows, one INSERT per row, against a route
-- with maxDuration = 60) could only be recovered by importing the whole
-- file again — which doubled every row that had already landed. The AI
-- market analysis in P2.2.1 reads this table by volume, so a doubled
-- export does not error anywhere; it just quietly makes every finding
-- twice as confident as the data warrants.
--
-- (competitor_id, pin_url) is the natural key: PinInspector exports one
-- row per pin per competitor. The index is partial because a row without
-- a URL cannot be deduplicated on anything — the importer now refuses a
-- CSV with no URL column, so those rows can only come from before today.

-- Existing duplicates first, keeping the oldest of each set.
DELETE FROM organic.competitor_pins a
 USING organic.competitor_pins b
 WHERE a.competitor_id = b.competitor_id
   AND a.pin_url IS NOT NULL
   AND a.pin_url = b.pin_url
   AND (a.imported_at, a.id) > (b.imported_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_pins_unique_idx
    ON organic.competitor_pins (competitor_id, pin_url)
 WHERE pin_url IS NOT NULL;

-- The task said what to do (guidance) but never what it hands back, so
-- its work panel read "Your work on this task" — the generic fallback for
-- a task with no stated output. The upload screen takes the CSVs; what
-- belongs in the panel is the link to where the raw exports live.
UPDATE organic.task_definitions SET expected_output =
  'The parsed exports: 700-1000 pins per competitor, imported per competitor on the upload screen above. '
  'Five to ten competitors — the coverage line tells you which are still missing. '
  'Attach the link to wherever the raw CSVs live (Drive) so the export can be traced back later; '
  'it lands in the Assets library as a PinInspector export automatically.'
 WHERE id = 'P2.1.6';
