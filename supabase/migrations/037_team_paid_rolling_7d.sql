-- Switch team_paid_activity_for_org from ISO week buckets to rolling 7-day
-- windows ending today. The manager's mental model is "what happened in the
-- past 7 days" (matches Pinterest UI's "Last 7 days" filter), not
-- "what happened since Monday" — which under-counts every Monday morning
-- and over-counts every Sunday evening.
--
-- Semantics:
--   window_start = today - 6 (inclusive)
--   window_end   = today (inclusive)
--   prior window = today-13 .. today-7
-- Chart shows `weeks_back` non-overlapping 7-day windows ending today.

DROP FUNCTION IF EXISTS team_paid_activity_for_org(uuid, int);

CREATE OR REPLACE FUNCTION team_paid_activity_for_org(p_org uuid, weeks_back int DEFAULT 8)
RETURNS TABLE(
  week_start date,
  launched bigint,
  paused bigint
)
LANGUAGE sql STABLE AS $$
  WITH bounds AS MATERIALIZED (
    -- window_start values: today-6, today-13, today-20, ... going back.
    -- Reversed to oldest→newest for consistent charting.
    SELECT (current_date - ((weeks_back - 1) * 7) - 6)::date AS earliest_start,
           current_date AS today_end
  ),
  windows AS MATERIALIZED (
    SELECT (current_date - (n * 7) - 6)::date AS window_start,
           (current_date - (n * 7))::date       AS window_end
      FROM generate_series(0, weeks_back - 1) n
     ORDER BY window_start
  ),
  latest_per_campaign AS MATERIALIZED (
    -- One row per campaign with the launch epoch we bucket by (start_time
    -- when set, else created_time).
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
    -- Assign each campaign to the rolling window it falls in (if any).
    SELECT w.window_start, COUNT(DISTINCT lpc.entity_id)::bigint AS n
      FROM latest_per_campaign lpc
      CROSS JOIN windows w
     WHERE to_timestamp(lpc.launch_epoch)::date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
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
       AND s.snapshot_date >= (earliest_start - INTERVAL '7 days')::date
  ),
  paused_events AS MATERIALIZED (
    SELECT snapshot_date, entity_id
      FROM status_series
     WHERE status = 'PAUSED'
       AND prev_status IN ('ACTIVE', 'DRAFT')
  ),
  paused_agg AS MATERIALIZED (
    SELECT w.window_start, COUNT(DISTINCT pe.entity_id)::bigint AS n
      FROM paused_events pe
      CROSS JOIN windows w
     WHERE pe.snapshot_date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start
  )
  SELECT
    w.window_start AS week_start,
    COALESCE(l.n, 0)::bigint AS launched,
    COALESCE(p.n, 0)::bigint AS paused
    FROM windows w
    LEFT JOIN launched_agg l ON l.window_start = w.window_start
    LEFT JOIN paused_agg   p ON p.window_start = w.window_start
   ORDER BY w.window_start;
$$;


-- Same treatment for organic — rolling 7-day windows instead of ISO weeks.

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
    SELECT (current_date - ((weeks_back - 1) * 7) - 6)::date AS earliest_start
  ),
  windows AS MATERIALIZED (
    SELECT (current_date - (n * 7) - 6)::date AS window_start,
           (current_date - (n * 7))::date       AS window_end
      FROM generate_series(0, weeks_back - 1) n
     ORDER BY window_start
  ),
  orgs AS MATERIALIZED (
    SELECT DISTINCT s.org_id FROM store_settings s WHERE s.org_id IS NOT NULL
  ),
  boards_agg AS MATERIALIZED (
    SELECT w.window_start, b.org_id, COUNT(*)::bigint AS n
      FROM boards b
      CROSS JOIN windows w
     WHERE b.created_at::date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start, b.org_id
  ),
  pins_agg AS MATERIALIZED (
    SELECT w.window_start, p.org_id, COUNT(*)::bigint AS n
      FROM pins p
      CROSS JOIN windows w
     WHERE p.created_at::date BETWEEN w.window_start AND w.window_end
     GROUP BY w.window_start, p.org_id
  )
  SELECT
    w.window_start AS week_start,
    o.org_id,
    COALESCE(b.n, 0)::bigint AS boards_created,
    COALESCE(p.n, 0)::bigint AS pins_added
    FROM windows w
    CROSS JOIN orgs o
    LEFT JOIN boards_agg b ON b.window_start = w.window_start AND b.org_id = o.org_id
    LEFT JOIN pins_agg   p ON p.window_start = w.window_start AND p.org_id = o.org_id
   ORDER BY w.window_start, o.org_id;
$$;
