-- 086 — who is owed a post right now, in one round-trip.
--
-- WHY
-- ---
-- post-pins used to work this out with a prefilter that selected every due
-- pin row just to collect the distinct org ids, plus two more queries per org
-- inside the loop (last posted, posted today). Three problems with that:
--
--   1. PostgREST caps a response at 1000 rows. The prefilter had no limit, so
--      once the backlog passes a thousand due pins the org list silently
--      becomes a sample and whole stores stop being considered. On 27-08-2026
--      the backlog was 453 — close enough to matter soon.
--   2. It cost a round-trip per org to learn things one GROUP BY answers.
--   3. It gave no basis for ordering, so the loop always ran the orgs in the
--      same arbitrary order and the tail was permanently starved. petcura sat
--      at position 10 with 40 healthy pins and a valid token, and had never
--      posted a single one.
--
-- last_posted is the fairness signal: order by it ascending, nulls first, and
-- the store that has waited longest goes first. That is the whole fix for (3).
--
-- STABLE, not IMMUTABLE — it reads now() and the pins table.

CREATE OR REPLACE FUNCTION public.pins_due_orgs()
RETURNS TABLE (
  org_id      uuid,
  due_count   integer,
  oldest_due  timestamptz,
  last_posted timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT p.org_id,
         COUNT(*) FILTER (
           WHERE p.status IN ('approved','scheduled') AND p.scheduled_at <= now()
         )::int AS due_count,
         MIN(p.scheduled_at) FILTER (
           WHERE p.status IN ('approved','scheduled') AND p.scheduled_at <= now()
         ) AS oldest_due,
         MAX(p.posted_at) FILTER (WHERE p.status = 'posted') AS last_posted
    FROM public.pins p
   GROUP BY p.org_id
  HAVING COUNT(*) FILTER (
           WHERE p.status IN ('approved','scheduled') AND p.scheduled_at <= now()
         ) > 0;
$$;

COMMENT ON FUNCTION public.pins_due_orgs() IS
  'Orgs with at least one pin due to post now, with their backlog size, oldest '
  'due pin and last successful post. Called by /api/cron/post-pins to order the '
  'run least-recently-posted first, so no store can be starved by the ones in '
  'front of it.';

GRANT EXECUTE ON FUNCTION public.pins_due_orgs() TO service_role, authenticated;
