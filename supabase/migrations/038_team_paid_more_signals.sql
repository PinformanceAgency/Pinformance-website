-- Add three extra signals to the Paid per-store view:
--   ads_paused    — ads that went ACTIVE→PAUSED in the window BUT only if
--                   their parent campaign is CURRENTLY still active. Ads that
--                   got paused as a byproduct of pausing the whole campaign
--                   would double-count and drown the real signal (which is
--                   creative-level optimization).
--   budget_changed — distinct campaigns whose daily_spend_cap_dollars
--                   changed value from one snapshot to the next inside the
--                   window (scaling up or down).
--   active_days   — how many distinct days inside the window had ANY action
--                   for this org (campaign launch, campaign pause, ad pause,
--                   or budget change). Best available proxy for "how often
--                   did the buyer touch this account this week" — Pinterest
--                   doesn't expose login history via API.
--
-- All computed per (org, rolling 7-day window ending today).

DROP FUNCTION IF EXISTS team_paid_activity_for_org(uuid, int);

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
      FROM pinterest_entity_snapshots s
     WHERE s.entity_type = 'campaign' AND s.org_id = p_org
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
