-- 102: Team Activity gaat eruit
--
-- BESLUIT (Tristan, 17-09-2026): het kost te veel en het wordt niet gebruikt.
-- De cijfers waren aardig -- wie welke campagne startte, pauzeerde, van budget
-- veranderde -- maar niemand nam er beslissingen op, en de rekening liep op:
-- de RPC las per store zijn hele plak van pinterest_entity_snapshots (4,5 GB,
-- 2,7M rijen), elke zes uur, voor alle 43 stores. Dat was vanochtend 478
-- seconden per run. Migratie 101 bracht het terug naar 51, en toen was de
-- eerlijke vraag niet "hoe maken we het sneller" maar "waarom draaien we het".
--
-- Alles gaat weg: de pagina, /api/team-activity, de cron, de cache, beide
-- RPC's en de twee dekkende indexen die 101 er vanochtend voor bouwde. Die
-- indexen zijn niet gratis -- de snapshot-crons doen vier keer per dag een
-- bulk insert in deze tabel en moeten ze dan bijwerken -- en ze bestonden
-- uitsluitend voor team_paid_activity_for_org().
--
-- WAT BLIJFT STAAN, EN WAAROM
-- ---------------------------
-- idx_pes_campaign_org_entity_date (033) en idx_pes_ad_org_entity_date (039)
-- zijn ooit voor dezelfde RPC gemaakt, maar ze zijn breder bruikbaar en
-- andere queries kunnen ze inmiddels gebruiken. Ze weghalen op een aanname is
-- precies het soort opruimen dat drie weken later als een trage pagina
-- terugkomt. Wie ze wil opruimen: kijk eerst naar idx_scan in
-- pg_stat_user_indexes, en doe het in een eigen migratie.
--
-- De data zelf raakt niets: pinterest_entity_snapshots blijft volledig
-- intact, alleen de afgeleide cache verdwijnt. Terugdraaien is 031-043 en 101
-- opnieuw draaien -- de bestanden blijven staan, want een migratie is
-- geschiedenis en wordt niet herschreven.

DROP TABLE IF EXISTS team_activity_cache;

DROP FUNCTION IF EXISTS team_paid_activity_for_org(uuid, int);
DROP FUNCTION IF EXISTS team_organic_activity(int);

DROP INDEX IF EXISTS idx_pes_ad_window_cover;
DROP INDEX IF EXISTS idx_pes_campaign_window_cover;
