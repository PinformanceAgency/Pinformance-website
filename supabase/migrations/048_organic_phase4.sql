-- Phase 4 — recurring per-cycle waterfall engine.
--
-- The existing pins/waterfalls schema is complete: waterfalls own designs,
-- designs own copy_sets, pins point to (waterfall, design, copy_set, board)
-- with UNIQUE(waterfall_id, sequence_number) and CHECK sequence_number
-- 1..16, plus copy_variant ∈ {A,B,C,D}. Four triggers already enforce
-- spacing, daily volume, board-URL history and the 60-day URL cooldown.
--
-- The only trigger that conflicts with the SOP is check_board_url_history:
-- as written, it fires WITHIN a single waterfall too, which contradicts
-- "each board receives four pins from four different designs" — every
-- board would get 4 pins for the same URL inside one 16-day waterfall.
-- The 180-day rule is meant to apply BETWEEN cycles, not within one.
-- Patch: exclude same-waterfall pins from the history check.

CREATE OR REPLACE FUNCTION organic.check_board_url_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_url uuid;
  v_recent int;
BEGIN
  SELECT url_id INTO v_url FROM organic.waterfalls WHERE id = new.waterfall_id;

  SELECT count(*) INTO v_recent
    FROM organic.pins p
    JOIN organic.waterfalls w ON w.id = p.waterfall_id
   WHERE w.url_id     = v_url
     AND p.board_id   = new.board_id
     AND w.id        <> new.waterfall_id                    -- allow same-waterfall pins
     AND p.id IS DISTINCT FROM new.id
     AND p.scheduled_date > current_date - interval '180 days'
     AND p.status <> 'CANCELLED';

  IF v_recent > 0 THEN
    RAISE EXCEPTION
      'Board-URL cooldown violated: URL % was pinned on this board within the last 180 days (in another waterfall)',
      v_url;
  END IF;
  RETURN new;
END;
$$;

-- Small helper: unique index so urls upserts by (org_id, url) are safe.
CREATE UNIQUE INDEX IF NOT EXISTS urls_org_url_uniq
  ON organic.urls (org_id, url);
