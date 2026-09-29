-- 114 — organic reporting: followers, posts published, top post, new pins.
--
-- Builds on 112 (organic.weekly_kpis). The reporting view asks per brand and
-- per Monday–Sunday week for impressions, outbound clicks, saves, followers,
-- posts published and the top post, week over week — and, separately, how the
-- pins that were NEW that week did against the account as a whole.
--
-- Three things the API decides for us, stated so nobody re-derives them:
--
--   Followers  Pinterest gives the CURRENT follower count only
--              (GET /user_account), never a history. So it is snapshotted
--              daily from 28-09-2026 on, and a week's figure is the snapshot
--              taken on its Sunday or the first day after. Weeks before the
--              first snapshot have no follower figure — null, not zero.
--   Posts      GET /pins lists the account's own pins with created_at. Board
--              warming (P3.3.7) saves the store's existing pins onto new
--              boards, which creates pins too; those are copies, not new
--              posts, and are counted apart (`board_warming_saves`).
--   New pins   Measured per pin (/pins/{id}/analytics) from the day it was
--              created to the end of its week, so "what the new pins did this
--              week" sits next to what the whole account did in the same week.

CREATE TABLE IF NOT EXISTS organic.follower_snapshots (
  org_id      uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  measured_on date    NOT NULL,
  followers   integer NOT NULL CHECK (followers >= 0),
  PRIMARY KEY (org_id, measured_on)
);
COMMENT ON TABLE organic.follower_snapshots IS
  'Daily follower count per store. Pinterest has no follower history, so this table is the history, from 28-09-2026 on.';

ALTER TABLE organic.weekly_kpis
  ADD COLUMN IF NOT EXISTS posts_published         integer,
  ADD COLUMN IF NOT EXISTS board_warming_saves     integer,
  ADD COLUMN IF NOT EXISTS top_pin_id              text,
  ADD COLUMN IF NOT EXISTS top_pin_title           text,
  ADD COLUMN IF NOT EXISTS top_pin_image           text,
  ADD COLUMN IF NOT EXISTS top_pin_link            text,
  ADD COLUMN IF NOT EXISTS top_pin_impressions     bigint,
  ADD COLUMN IF NOT EXISTS top_pin_saves           bigint,
  ADD COLUMN IF NOT EXISTS top_pin_outbound_clicks bigint;

COMMENT ON COLUMN organic.weekly_kpis.posts_published IS
  'Own pins created on the account that week (GET /pins), board-warming saves excluded. Whoever pinned them — the client or us.';
COMMENT ON COLUMN organic.weekly_kpis.top_pin_id IS
  'Most impressions that week among the store''s own image and video pins (top_pins, source YOUR_PINS, never product pins).';

CREATE TABLE IF NOT EXISTS organic.new_pins (
  org_id          uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pin_id          text        NOT NULL,
  week_start      date        NOT NULL CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  created_at      timestamptz NOT NULL,
  title           text,
  image_url       text,
  link            text,
  media_type      text,
  -- Published through the dashboard (organic.pins) rather than by the client.
  is_ours         boolean     NOT NULL DEFAULT false,
  -- From created_at to the Sunday of its week. Null = not measured yet.
  impressions     bigint,
  saves           bigint,
  outbound_clicks bigint,
  pin_clicks      bigint,
  measured_at     timestamptz,
  PRIMARY KEY (org_id, pin_id)
);
CREATE INDEX IF NOT EXISTS new_pins_week_idx ON organic.new_pins (org_id, week_start);

ALTER TABLE organic.follower_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic.new_pins ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='follower_snapshots' AND policyname='follower_snapshots_read_authenticated') THEN
    CREATE POLICY "follower_snapshots_read_authenticated" ON organic.follower_snapshots
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='new_pins' AND policyname='new_pins_read_authenticated') THEN
    CREATE POLICY "new_pins_read_authenticated" ON organic.new_pins
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
