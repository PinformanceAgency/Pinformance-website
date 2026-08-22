-- 044: index voor "welke ad accounts hebben we recent gezien"
--
-- WAAROM
-- ------
-- weekly-update-sync bouwt bij elke run een index van gekoppelde ad accounts
-- (LINKS_QUERY in scripts/weekly-update-sync.ts): per org het laatst geziene
-- ad account uit beide snapshot-tabellen van de laatste 30 dagen. Die query
-- deed er 19-26 seconden over -- op een cron-run die in de praktijk ~60s
-- wall clock krijgt is dat een derde van het budget, nog voor de eerste store
-- aan de beurt is. Gemeten op 22-08-2026: de metrics-helft kost 1s, de
-- entity-helft de rest, want pinterest_entity_snapshots telt 1,5 miljoen rijen
-- en had geen index met snapshot_date vooraan.
--
-- Deze twee indexen dekken precies de kolommen die de query nodig heeft
-- (snapshot_date als bereik, daarna org_id en ad_account_id), zodat Postgres
-- een index-only scan kan doen in plaats van de hele tabel te lezen.
--
-- De entity-helft is niet weg te laten: 7 orgs (o.a. Kate & Wendy, Joseph
-- Violet) staan wel in de entity-snapshots en niet in de metrics -- dat zijn
-- juist de stores zonder spend, en die moeten als 'wel gezien' blijven gelden.

CREATE INDEX IF NOT EXISTS idx_pes_seen_by_date
    ON pinterest_entity_snapshots (snapshot_date, org_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_pms_seen_by_date
    ON pinterest_metrics_snapshots (snapshot_date, org_id, ad_account_id);

-- De index alleen is niet genoeg: een index-only scan werkt pas als de
-- visibility map bij is. Direct na CREATE INDEX koos de planner nog een seq
-- scan (19,5s) en werd het met enable_seqscan=off zelfs 75s, omdat elke
-- index-tuple alsnog de heap in moest. Na VACUUM (ANALYZE) ging dezelfde query
-- naar 0,3-0,7s.
--
-- Beide tabellen krijgen 4x per dag een bulk insert van de snapshot-crons.
-- Blijft autovacuum achter, dan zakt deze query stilletjes terug naar ~20s en
-- loopt de maandagcron weer tegen zijn tijdslimiet. Daarom vacuumt Postgres
-- deze twee tabellen strenger dan standaard (5% i.p.v. 20% aangroei).
ALTER TABLE pinterest_entity_snapshots
      SET (autovacuum_vacuum_scale_factor = 0.05,
           autovacuum_analyze_scale_factor = 0.05);

ALTER TABLE pinterest_metrics_snapshots
      SET (autovacuum_vacuum_scale_factor = 0.05,
           autovacuum_analyze_scale_factor = 0.05);
