-- Per-org variants of the paid activity RPC. The all-orgs variant did a
-- single LAG() over 140k campaign rows which reliably hit the statement
-- timeout. Per-org caps the window to that org's ~300 campaigns × ~65 days
-- = ~10-20k rows, well under any reasonable timeout.
--
-- The org list itself is cheap to iterate client-side (~50 orgs, 5-way
-- concurrent) and total wall-clock stays under 5s.

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
    SELECT DISTINCT ON (s.entity_id) s.entity_id, s.created_time
      FROM pinterest_entity_snapshots s
     WHERE s.entity_type = 'campaign'
       AND s.org_id = p_org
       AND s.created_time IS NOT NULL
     ORDER BY s.entity_id, s.snapshot_date DESC
  ),
  launched_agg AS MATERIALIZED (
    SELECT
      (date_trunc('week', to_timestamp(created_time::bigint)))::date AS week_start,
      COUNT(DISTINCT entity_id)::bigint AS n
      FROM latest_per_campaign, bounds
     WHERE created_time::bigint >= EXTRACT(EPOCH FROM earliest_monday)::bigint
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
