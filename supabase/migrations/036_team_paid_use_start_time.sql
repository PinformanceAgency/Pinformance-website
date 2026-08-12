-- The manager thinks of "launched" as when a campaign STARTS DELIVERING
-- (matches Pinterest UI's "Start date/time"), not when the buyer clicked
-- "Create". A buyer who creates a campaign on Sunday and schedules it to
-- start Monday should show as "launched Monday" — otherwise the weekly
-- tally under-counts new campaigns for the current week.
--
-- Use raw->>'start_time' (bigint epoch seconds) with created_time as a
-- fallback for campaigns without an explicit start_time.

DROP FUNCTION IF EXISTS team_paid_activity_for_org(uuid, int);

CREATE OR REPLACE FUNCTION team_paid_activity_for_org(p_org uuid, weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  launched bigint,
  paused bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS MATERIALIZED (
    SELECT
      (date_trunc('week', current_date) - ((weeks_back - 1) * INTERVAL '1 week'))::date AS earliest_monday,
      (date_trunc('week', current_date))::date AS latest_monday
  ),
  weeks AS MATERIALIZED (
    SELECT generate_series(
      (SELECT earliest_monday FROM bounds),
      (SELECT latest_monday   FROM bounds),
      '1 week'::interval
    )::date AS week_start
  ),
  latest_per_campaign AS MATERIALIZED (
    -- One row per campaign with the launch epoch we want to bucket by:
    -- start_time when available, else fall back to created_time.
    SELECT DISTINCT ON (s.entity_id)
           s.entity_id,
           COALESCE(
             NULLIF(s.raw->>'start_time', '')::bigint,
             s.created_time::bigint
           ) AS launch_epoch
      FROM pinterest_entity_snapshots s
     WHERE s.entity_type = 'campaign'
       AND s.org_id = p_org
       AND (s.raw->>'start_time' IS NOT NULL OR s.created_time IS NOT NULL)
     ORDER BY s.entity_id, s.snapshot_date DESC
  ),
  launched_agg AS MATERIALIZED (
    SELECT
      (date_trunc('week', to_timestamp(launch_epoch)))::date AS week_start,
      COUNT(DISTINCT entity_id)::bigint AS n
      FROM latest_per_campaign, bounds
     WHERE launch_epoch >= EXTRACT(EPOCH FROM earliest_monday)::bigint
     GROUP BY 1
  ),
  status_series AS MATERIALIZED (
    SELECT s.entity_id, s.snapshot_date, s.status,
           LAG(s.status) OVER (
             PARTITION BY s.entity_id
             ORDER BY s.snapshot_date
           ) AS prev_status
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'campaign'
       AND s.org_id = p_org
       AND s.snapshot_date >= (earliest_monday - INTERVAL '7 days')::date
  ),
  paused_agg AS MATERIALIZED (
    SELECT
      (date_trunc('week', snapshot_date))::date AS week_start,
      COUNT(DISTINCT entity_id)::bigint AS n
      FROM status_series, bounds
     WHERE status = 'PAUSED'
       AND prev_status IN ('ACTIVE', 'DRAFT')
       AND snapshot_date >= earliest_monday
     GROUP BY 1
  )
  SELECT
    w.week_start,
    COALESCE(l.n, 0)::bigint AS launched,
    COALESCE(p.n, 0)::bigint AS paused
    FROM weeks w
    LEFT JOIN launched_agg l ON l.week_start = w.week_start
    LEFT JOIN paused_agg   p ON p.week_start = w.week_start
   ORDER BY w.week_start;
$$;
