-- v2 of team_paid_activity — v1 re-ran the aggregation CTEs per output row
-- (26s for 440 rows). Force MATERIALIZED so each CTE runs once, and
-- pre-aggregate launched/paused to per-week-per-org rows BEFORE joining to
-- the weeks × orgs grid.

DROP FUNCTION IF EXISTS team_paid_activity(int);

CREATE OR REPLACE FUNCTION team_paid_activity(weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  org_id uuid,
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
  orgs AS MATERIALIZED (
    SELECT DISTINCT s.org_id
      FROM store_settings s
     WHERE s.org_id IS NOT NULL
  ),
  latest_per_campaign AS MATERIALIZED (
    SELECT DISTINCT ON (s.org_id, s.entity_id)
           s.org_id, s.entity_id, s.created_time
      FROM pinterest_entity_snapshots s
     WHERE s.entity_type = 'campaign'
       AND s.created_time IS NOT NULL
     ORDER BY s.org_id, s.entity_id, s.snapshot_date DESC
  ),
  launched_agg AS MATERIALIZED (
    SELECT
      (date_trunc('week', to_timestamp(lpc.created_time::bigint)))::date AS week_start,
      lpc.org_id,
      COUNT(DISTINCT lpc.entity_id)::bigint AS n
      FROM latest_per_campaign lpc, bounds
     WHERE lpc.created_time::bigint >= EXTRACT(EPOCH FROM earliest_monday)::bigint
     GROUP BY 1, 2
  ),
  status_series AS MATERIALIZED (
    SELECT s.org_id, s.entity_id, s.snapshot_date, s.status,
           LAG(s.status) OVER (
             PARTITION BY s.org_id, s.entity_id
             ORDER BY s.snapshot_date
           ) AS prev_status
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'campaign'
       AND s.snapshot_date >= (earliest_monday - INTERVAL '7 days')::date
  ),
  paused_agg AS MATERIALIZED (
    SELECT
      (date_trunc('week', snapshot_date))::date AS week_start,
      org_id,
      COUNT(DISTINCT entity_id)::bigint AS n
      FROM status_series, bounds
     WHERE status = 'PAUSED'
       AND prev_status IN ('ACTIVE', 'DRAFT')
       AND snapshot_date >= earliest_monday
     GROUP BY 1, 2
  )
  SELECT
    w.week_start,
    o.org_id,
    COALESCE(l.n, 0)::bigint AS launched,
    COALESCE(p.n, 0)::bigint AS paused
    FROM weeks w
    CROSS JOIN orgs o
    LEFT JOIN launched_agg l ON l.week_start = w.week_start AND l.org_id = o.org_id
    LEFT JOIN paused_agg   p ON p.week_start = w.week_start AND p.org_id = o.org_id
   ORDER BY w.week_start, o.org_id;
$$;

DROP FUNCTION IF EXISTS team_organic_activity(int);

CREATE OR REPLACE FUNCTION team_organic_activity(weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  org_id uuid,
  boards_created bigint,
  pins_added bigint
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
  orgs AS MATERIALIZED (
    SELECT DISTINCT s.org_id FROM store_settings s WHERE s.org_id IS NOT NULL
  ),
  boards_agg AS MATERIALIZED (
    SELECT (date_trunc('week', b.created_at))::date AS week_start,
           b.org_id,
           COUNT(*)::bigint AS n
      FROM boards b, bounds
     WHERE b.created_at >= earliest_monday::timestamptz
     GROUP BY 1, 2
  ),
  pins_agg AS MATERIALIZED (
    SELECT (date_trunc('week', p.created_at))::date AS week_start,
           p.org_id,
           COUNT(*)::bigint AS n
      FROM pins p, bounds
     WHERE p.created_at >= earliest_monday::timestamptz
     GROUP BY 1, 2
  )
  SELECT
    w.week_start,
    o.org_id,
    COALESCE(b.n, 0)::bigint AS boards_created,
    COALESCE(p.n, 0)::bigint AS pins_added
    FROM weeks w
    CROSS JOIN orgs o
    LEFT JOIN boards_agg b ON b.week_start = w.week_start AND b.org_id = o.org_id
    LEFT JOIN pins_agg   p ON p.week_start = w.week_start AND p.org_id = o.org_id
   ORDER BY w.week_start, o.org_id;
$$;
