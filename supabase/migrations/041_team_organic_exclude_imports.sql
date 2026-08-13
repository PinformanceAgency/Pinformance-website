-- Filter imported boards out of the "boards created this week" count.
-- Candela's dashboard showed "3 new boards" on day-1 because we synced
-- 3 existing Pinterest boards into our DB when the store was onboarded —
-- but the buyer didn't create anything new. Only source='ai_generated'
-- (or 'user_created') boards count as team activity.

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
       AND COALESCE(b.source, 'ai_generated') <> 'imported'
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
