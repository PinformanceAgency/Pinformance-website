-- Follow-up to 051: everything that references the board_status enum now
-- treats PROTECTED like SECRET was treated before.

-- 1. Backfill the three actually-synced boards to their real Pinterest
--    privacy. GET /v5/boards confirmed:
--      "Snel bewaren"                     PUBLIC (Pinterest's default
--                                                board, 0 pins — we
--                                                don't manage it, keep
--                                                as PROTECTED locally
--                                                to avoid violating the
--                                                public_needs_seeding
--                                                CHECK constraint)
--      "Performance+ creative backgrounds" PROTECTED
--      "Products"                          PROTECTED
UPDATE organic.boards SET status = 'PROTECTED'::organic.board_status
 WHERE pinterest_board_id IN (
   '681310318568853869',   -- Snel bewaren  (Pinterest PUBLIC, 0 pins, unmanaged)
   '681310318568965861',   -- Products
   '681310318568968626'    -- Performance+ creative backgrounds
 );

-- 2. auto_publish_board — flip PROTECTED (and legacy SECRET) → PUBLIC at
--    10 pins. Same behaviour, just PROTECTED-aware.
CREATE OR REPLACE FUNCTION organic.auto_publish_board()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.pin_count >= 10 AND new.status IN ('SECRET'::organic.board_status, 'PROTECTED'::organic.board_status) THEN
    new.status := 'PUBLIC'::organic.board_status;
  END IF;
  RETURN new;
END;
$$;

-- 3. topic_coverage — count PROTECTED alongside SECRET and PUBLIC as
--    an "active" board.
CREATE OR REPLACE VIEW organic.topic_coverage AS
 SELECT t.id AS topic_id,
    t.org_id,
    t.name AS topic_name,
    t.parent_id,
    count(b.id) FILTER (WHERE b.status = ANY (ARRAY[
      'SECRET'::organic.board_status,
      'PROTECTED'::organic.board_status,
      'PUBLIC'::organic.board_status])) AS active_boards,
    count(b.id) FILTER (WHERE b.status = 'PLANNED'::organic.board_status) AS planned_boards,
    count(b.id) FILTER (WHERE b.breadth = 'BROAD'::organic.board_breadth
                           AND b.status = ANY (ARRAY[
                             'SECRET'::organic.board_status,
                             'PROTECTED'::organic.board_status,
                             'PUBLIC'::organic.board_status])) AS broad_boards,
    count(b.id) FILTER (WHERE b.breadth = 'NICHE'::organic.board_breadth
                           AND b.status = ANY (ARRAY[
                             'SECRET'::organic.board_status,
                             'PROTECTED'::organic.board_status,
                             'PUBLIC'::organic.board_status])) AS niche_boards,
    count(b.id) FILTER (WHERE b.status = ANY (ARRAY[
      'SECRET'::organic.board_status,
      'PROTECTED'::organic.board_status,
      'PUBLIC'::organic.board_status])) >= 5 AS is_covered
   FROM organic.topics t
     LEFT JOIN organic.boards b ON b.topic_id = t.id
  GROUP BY t.id, t.org_id, t.name, t.parent_id;
