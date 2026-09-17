-- 101: Team Activity rekende zichzelf dood
--
-- WAT ER MIS WAS
-- --------------
-- team_activity_cache stond op 13-09-2026 06:20 stil. De cron draait elk
-- kwartier na het hele uur, elke zes uur, en haalde het al vier dagen niet:
-- computeTeamActivity() valt om met "Query read timeout", en de route zelf
-- heeft maxDuration = 300. Gemeten 17-09-2026: de 43 stores samen kostten
-- **478 seconden** aan team_paid_activity_for_org(), Nordheim alleen 58,9s.
--
-- Niemand zag het. De pagina en /api/team-activity lezen de cache en tonen
-- wat erin staat; vier dagen oude cijfers renderen exact zoals verse. De
-- cron faalt stil, want alertCronFailure() was hier nooit ingehangen.
--
-- WAAROM HET ZO DUUR WAS: DE RIJEN ZIJN VET
-- -----------------------------------------
-- pinterest_entity_snapshots is 4,5 GB over 2,7 miljoen rijen -- ~1,7 KB per
-- rij, want elke rij draagt de volledige `raw` jsonb van Pinterest mee. De
-- RPC heeft per rij precies vier kleine kolommen nodig (entity_id,
-- snapshot_date, status, parent_campaign_id), maar las de hele rij: voor
-- Nordheim 225.790 ad-rijen = 62.896 blocks ≈ 490 MB van schijf, plus een
-- sort die naar temp files uitweek. 43 stores × hun eigen plak = de hele
-- tabel meermaals per run.
--
-- De twee dekkende indexen hieronder maken er een index-only scan van: alles
-- wat de window-functie nodig heeft staat in de index, in precies de
-- volgorde die PARTITION BY entity_id ORDER BY snapshot_date vraagt. 138 MB
-- en 27 MB in plaats van 4,5 GB.
--
-- OP PRODUCTIE ZIJN ZE CONCURRENTLY GEBOUWD (84s en 61s) en daarna is er
-- met de hand VACUUM (ANALYZE) gedraaid. Dat laatste is niet optioneel en
-- is dezelfde les als migratie 044: een index-only scan werkt pas als de
-- visibility map bij is, anders moet elke index-tuple alsnog de heap in en
-- kiest de planner gewoon weer een seq scan. IF NOT EXISTS, dus dit bestand
-- is op productie een no-op en bouwt ze alleen op een verse database.
--
--   VACUUM (ANALYZE) pinterest_entity_snapshots;
--
-- EN ÉÉN FILTER DIE NAAR BENEDEN KAN
-- ----------------------------------
-- ad_series berekende de LAG over *alle* ads van de store en gooide daarna
-- pas weg wat niet onder een nu nog actieve campagne hing. Bij Nordheim zijn
-- 66 van de 579 campagnes actief, dus 89% van dat werk was voor de prullenbak.
-- Het filter staat nu in de scan zelf. Dat mag: geen enkele ad-rij heeft een
-- lege parent_campaign_id en geen enkele ad verhuist ooit van campagne
-- (beide nagemeten op de hele tabel), dus per ad overleven ofwel alle rijen
-- ofwel geen, en de LAG van de overlevers verandert niet.
--
-- latest_per_campaign las de hele geschiedenis van de store om per campagne
-- de nieuwste rij te vinden. Het venster is hetzelfde venster dat de rest van
-- de functie al gebruikt: een campagne zonder snapshot in die 63 dagen kan
-- niet in dit venster gelanceerd zijn en is ook niet "op dit moment actief".
--
-- UITKOMST, nagemeten over alle 43 actieve stores: **0 verschillen** met de
-- oude functie, rij voor rij, en 478s → 51s sequentieel (~30s wall clock bij
-- CONCURRENCY = 2). Nordheim 58,9s → 7,4s.

CREATE INDEX IF NOT EXISTS idx_pes_ad_window_cover
    ON pinterest_entity_snapshots (org_id, entity_id, snapshot_date)
    INCLUDE (status, parent_campaign_id)
    WHERE entity_type = 'ad';

CREATE INDEX IF NOT EXISTS idx_pes_campaign_window_cover
    ON pinterest_entity_snapshots (org_id, entity_id, snapshot_date)
    INCLUDE (status, daily_spend_cap_dollars, created_time)
    WHERE entity_type = 'campaign';

-- De functie zelf: zelfde signatuur, zelfde uitkomst, twee minder verspilde
-- scans. Verder ongewijzigd ten opzichte van 038.
CREATE OR REPLACE FUNCTION team_paid_activity_for_org(p_org uuid, weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  launched bigint,
  paused bigint,
  ads_paused bigint,
  budget_changed bigint,
  active_days bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS MATERIALIZED (
    SELECT (current_date - ((weeks_back - 1) * 7) - 6)::date AS earliest_start,
           current_date AS today_end
  ),
  windows AS MATERIALIZED (
    SELECT (current_date - (n * 7) - 6)::date AS window_start,
           (current_date - (n * 7))::date       AS window_end
      FROM generate_series(0, weeks_back - 1) n
     ORDER BY window_start
  ),

  -- ── Campaign-level: launched (start_time) + paused (status transition)
  latest_per_campaign AS MATERIALIZED (
    SELECT DISTINCT ON (s.entity_id)
           s.entity_id, s.status AS current_status,
           COALESCE(NULLIF(s.raw->>'start_time', '')::bigint, s.created_time::bigint) AS launch_epoch
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'campaign' AND s.org_id = p_org
       AND s.snapshot_date >= (earliest_start - INTERVAL '7 days')::date
       AND (s.raw->>'start_time' IS NOT NULL OR s.created_time IS NOT NULL)
     ORDER BY s.entity_id, s.snapshot_date DESC
  ),
  launched_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT lpc.entity_id)::bigint AS n
      FROM latest_per_campaign lpc CROSS JOIN windows w
     WHERE to_timestamp(lpc.launch_epoch)::date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  ),
  campaign_series AS MATERIALIZED (
    SELECT s.entity_id, s.snapshot_date, s.status,
           s.daily_spend_cap_dollars,
           LAG(s.status)                    OVER (PARTITION BY s.entity_id ORDER BY s.snapshot_date) AS prev_status,
           LAG(s.daily_spend_cap_dollars)   OVER (PARTITION BY s.entity_id ORDER BY s.snapshot_date) AS prev_budget
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'campaign' AND s.org_id = p_org
       AND s.snapshot_date >= (earliest_start - INTERVAL '7 days')::date
  ),
  paused_events AS MATERIALIZED (
    SELECT snapshot_date, entity_id FROM campaign_series
     WHERE status = 'PAUSED' AND prev_status IN ('ACTIVE', 'DRAFT')
  ),
  paused_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT pe.entity_id)::bigint AS n
      FROM paused_events pe CROSS JOIN windows w
     WHERE pe.snapshot_date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  ),
  budget_events AS MATERIALIZED (
    SELECT snapshot_date, entity_id FROM campaign_series
     WHERE prev_budget IS NOT NULL
       AND daily_spend_cap_dollars IS DISTINCT FROM prev_budget
  ),
  budget_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT be.entity_id)::bigint AS n
      FROM budget_events be CROSS JOIN windows w
     WHERE be.snapshot_date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  ),

  -- ── Ad-level: paused, filtered to ads whose parent campaign is still ACTIVE
  currently_active_campaigns AS MATERIALIZED (
    SELECT entity_id
      FROM latest_per_campaign
     WHERE current_status = 'ACTIVE'
  ),
  ad_series AS MATERIALIZED (
    SELECT s.entity_id, s.snapshot_date, s.status,
           s.parent_campaign_id,
           LAG(s.status) OVER (PARTITION BY s.entity_id ORDER BY s.snapshot_date) AS prev_status
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'ad' AND s.org_id = p_org
       AND s.snapshot_date >= (earliest_start - INTERVAL '7 days')::date
       AND s.parent_campaign_id IN (SELECT entity_id FROM currently_active_campaigns)
  ),
  ad_paused_events AS MATERIALIZED (
    SELECT a.snapshot_date, a.entity_id
      FROM ad_series a
      JOIN currently_active_campaigns cac ON cac.entity_id = a.parent_campaign_id
     WHERE a.status = 'PAUSED' AND a.prev_status = 'ACTIVE'
  ),
  ads_paused_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT ape.entity_id)::bigint AS n
      FROM ad_paused_events ape CROSS JOIN windows w
     WHERE ape.snapshot_date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  ),

  -- ── active_days: union of every event date, count distinct days per window
  all_event_dates AS MATERIALIZED (
    SELECT snapshot_date FROM paused_events
    UNION SELECT snapshot_date FROM budget_events
    UNION SELECT snapshot_date FROM ad_paused_events
    UNION SELECT to_timestamp(launch_epoch)::date FROM latest_per_campaign
  ),
  active_days_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT aed.snapshot_date)::bigint AS n
      FROM all_event_dates aed CROSS JOIN windows w
     WHERE aed.snapshot_date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  )

  SELECT
    w.window_start                         AS week_start,
    COALESCE(l.n,   0)::bigint             AS launched,
    COALESCE(p.n,   0)::bigint             AS paused,
    COALESCE(ap.n,  0)::bigint             AS ads_paused,
    COALESCE(b.n,   0)::bigint             AS budget_changed,
    COALESCE(ad.n,  0)::bigint             AS active_days
    FROM windows w
    LEFT JOIN launched_agg    l   ON l.window_start   = w.window_start
    LEFT JOIN paused_agg      p   ON p.window_start   = w.window_start
    LEFT JOIN ads_paused_agg  ap  ON ap.window_start  = w.window_start
    LEFT JOIN budget_agg      b   ON b.window_start   = w.window_start
    LEFT JOIN active_days_agg ad  ON ad.window_start  = w.window_start
   ORDER BY w.window_start;
$$;
