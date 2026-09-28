-- 113 — autovacuum ook na INSERTS op de snapshot-tabellen, niet alleen na
-- dode rijen.
--
-- 28-09-2026 faalden de weekly-update-sync (12:00), de retry (12:30) en de
-- watchdog (13:00) alle drie op tijd: LINKS_QUERY (ad account -> org) deed er
-- 46s over in plaats van ~3s, en de cron krijgt in de praktijk ~60s. Het
-- Weekly Updates-bord bleef voor elke store leeg tot een handmatige run.
--
-- Oorzaak: de index-only scan uit 044 werkt alleen met een actuele visibility
-- map, en die wordt alleen door VACUUM bijgewerkt. 044 verlaagde de drempel
-- voor dode rijen naar 5%, maar deze tabellen groeien vooral door INSERTS
-- (elke 6 uur een snapshot). Een insert-getriggerde vacuum gaat standaard pas
-- af na 20% nieuwe rijen — op pinterest_entity_snapshots (3M rijen) is dat
-- 600k, dagen aan snapshots. Sinds de laatste autovacuum op 26-09 was de map
-- verouderd en viel de planner terug op heap-lookups. Een handmatige
-- VACUUM (ANALYZE) bracht de query van 46s naar 2,7s.
--
-- 2% nieuwe rijen (~60k, ongeveer een dag snapshots) houdt de map bij.

ALTER TABLE public.pinterest_entity_snapshots
  SET (autovacuum_vacuum_insert_scale_factor = 0.02);
ALTER TABLE public.pinterest_metrics_snapshots
  SET (autovacuum_vacuum_insert_scale_factor = 0.02);
