-- Server-side aggregation for the Team Activity manager view.
--
-- Prior attempts pulled the full ~140k row campaign-snapshot history via
-- PostgREST and blew the statement-timeout every time (~15s). Two RPCs
-- here do the grouping in-database so the API roundtrip is a single call
-- returning ~ (weeks × orgs) rows, well under the timeout.
--
-- team_paid_activity(weeks_back int)
--   returns (week_start, org_id, launched, paused)
--   - launched = distinct campaigns whose Pinterest `created_time` falls in
--     that week
--   - paused   = distinct campaigns whose status transitioned from ACTIVE (or
--     DRAFT) to PAUSED on any day in that week. Detected with LAG() over the
--     per-campaign daily status series.
--
-- team_organic_activity(weeks_back int)
--   returns (week_start, org_id, boards_created, pins_added)
--   - boards_created = boards.created_at in that week
--   - pins_added     = pins.created_at in that week (everything that went
--     through the dashboard, regardless of eventual status)
--
-- `week_start` is the Monday of the ISO week in UTC.

CREATE OR REPLACE FUNCTION team_paid_activity(weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  org_id uuid,
  launched bigint,
  paused bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('week', current_date) - ((weeks_back - 1) * INTERVAL '1 week'))::date AS earliest_monday,
      (date_trunc('week', current_date))::date AS latest_monday
  ),
  weeks AS (
    SELECT generate_series(
      (SELECT earliest_monday FROM bounds),
      (SELECT latest_monday   FROM bounds),
      '1 week'::interval
    )::date AS week_start
  ),
  orgs AS (
    SELECT DISTINCT s.org_id
      FROM store_settings s
     WHERE s.org_id IS NOT NULL
  ),
  latest_per_campaign AS (
    SELECT DISTINCT ON (s.org_id, s.entity_id)
           s.org_id, s.entity_id, s.created_time
      FROM pinterest_entity_snapshots s
     WHERE s.entity_type = 'campaign'
       AND s.created_time IS NOT NULL
     ORDER BY s.org_id, s.entity_id, s.snapshot_date DESC
  ),
  launched_events AS (
    SELECT DISTINCT
           (date_trunc('week', to_timestamp(created_time::bigint) AT TIME ZONE 'UTC'))::date AS week_start,
           org_id,
           entity_id
      FROM latest_per_campaign, bounds
     WHERE created_time::bigint >= EXTRACT(EPOCH FROM earliest_monday)::bigint
  ),
  status_series AS (
    SELECT s.org_id, s.entity_id, s.snapshot_date, s.status,
           LAG(s.status) OVER (PARTITION BY s.org_id, s.entity_id ORDER BY s.snapshot_date) AS prev_status
      FROM pinterest_entity_snapshots s, bounds
     WHERE s.entity_type = 'campaign'
       AND s.snapshot_date >= (earliest_monday - INTERVAL '7 days')::date
  ),
  paused_events AS (
    SELECT DISTINCT
           (date_trunc('week', snapshot_date))::date AS week_start,
           org_id,
           entity_id
      FROM status_series, bounds
     WHERE status = 'PAUSED'
       AND prev_status IN ('ACTIVE', 'DRAFT')
       AND snapshot_date >= earliest_monday
  )
  SELECT
    w.week_start,
    o.org_id,
    COALESCE(l.n, 0)::bigint AS launched,
    COALESCE(p.n, 0)::bigint AS paused
  FROM weeks w
  CROSS JOIN orgs o
  LEFT JOIN (
    SELECT week_start, org_id, COUNT(*)::bigint AS n
      FROM launched_events
     GROUP BY week_start, org_id
  ) l ON l.week_start = w.week_start AND l.org_id = o.org_id
  LEFT JOIN (
    SELECT week_start, org_id, COUNT(*)::bigint AS n
      FROM paused_events
     GROUP BY week_start, org_id
  ) p ON p.week_start = w.week_start AND p.org_id = o.org_id
  ORDER BY w.week_start, o.org_id;
$$;

CREATE OR REPLACE FUNCTION team_organic_activity(weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  org_id uuid,
  boards_created bigint,
  pins_added bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT
      (date_trunc('week', current_date) - ((weeks_back - 1) * INTERVAL '1 week'))::date AS earliest_monday,
      (date_trunc('week', current_date))::date AS latest_monday
  ),
  weeks AS (
    SELECT generate_series(
      (SELECT earliest_monday FROM bounds),
      (SELECT latest_monday   FROM bounds),
      '1 week'::interval
    )::date AS week_start
  ),
  orgs AS (
    SELECT DISTINCT s.org_id
      FROM store_settings s
     WHERE s.org_id IS NOT NULL
  )
  SELECT
    w.week_start,
    o.org_id,
    COALESCE(b.n, 0)::bigint AS boards_created,
    COALESCE(p.n, 0)::bigint AS pins_added
  FROM weeks w
  CROSS JOIN orgs o
  LEFT JOIN (
    SELECT (date_trunc('week', created_at))::date AS week_start,
           org_id,
           COUNT(*)::bigint AS n
      FROM boards, bounds
     WHERE created_at >= earliest_monday::timestamptz
     GROUP BY 1, 2
  ) b ON b.week_start = w.week_start AND b.org_id = o.org_id
  LEFT JOIN (
    SELECT (date_trunc('week', created_at))::date AS week_start,
           org_id,
           COUNT(*)::bigint AS n
      FROM pins, bounds
     WHERE created_at >= earliest_monday::timestamptz
     GROUP BY 1, 2
  ) p ON p.week_start = w.week_start AND p.org_id = o.org_id
  ORDER BY w.week_start, o.org_id;
$$;
