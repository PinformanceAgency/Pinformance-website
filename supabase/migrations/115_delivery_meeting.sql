-- 115 — Delivery meeting cron: decks + Tycho prep → Slack, every Tuesday.
--
-- Three tables and one private bucket. The pipeline itself lives in
-- src/lib/delivery-meeting/; see the header of pipeline.ts for the stages.
--
--   delivery_meeting_buyers    per buyer: which meeting, the monthly goal
--                              (stores on track), the monday user id that
--                              marks their items and logs.
--   delivery_meeting_settings  per store, only what store_settings does not
--                              already hold. Invoice ROAS, BER, invoicing
--                              model, department and buyer stay THERE — a
--                              second copy here would be the one nobody
--                              updates.
--   delivery_meeting_runs      one row per stream per Tuesday. The pipeline is
--                              staged because a Fathom transcript and a Claude
--                              call do not fit in the ~60 s a Vercel function
--                              really gets; `payload` carries everything
--                              collected so far, so any invocation can pick up
--                              where the last one stopped.
--
-- The values (targets, multipliers, blend groups) are client figures and are
-- seeded by a local script from files outside the repo — the repo is public.

CREATE TABLE IF NOT EXISTS public.delivery_meeting_buyers (
  -- lowercase first name, exactly as in store_settings.media_buyer
  buyer                    text PRIMARY KEY,
  stream                   text NOT NULL CHECK (stream IN ('dropship', 'branded')),
  monthly_target_on_track  integer NOT NULL CHECK (monthly_target_on_track >= 0),
  -- the monday person id: Clients subitems, Weekly Store Logs and to-dos are
  -- matched on it, never on a display name
  monday_user_id           bigint,
  -- how the buyer is named on the slides and in Slack ("Dylan", "Rens")
  slack_label              text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_meeting_settings (
  org_id                    uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- the name on the slide; null = organizations.name
  display_name              text,
  -- counts towards the weekly goal. When no store in a deck has it set, the
  -- goal falls back to "agreed target ≥ floor, plus every store green".
  weekly_goal               boolean NOT NULL DEFAULT false,
  -- revenue × this, week and month (a store whose attribution undercounts)
  revenue_multiplier        numeric NOT NULL DEFAULT 1 CHECK (revenue_multiplier > 0),
  -- stores sharing a value are ONE row in the deck, summed (Viorita Group)
  blend_group               text,
  -- Weekly Updates parent items (board 5091362359): the fallback for a store
  -- with no Pinterest data on the dashboard
  monday_weekly_update_ids  text[] NOT NULL DEFAULT '{}',
  -- the store as the Weekly Store Log's Store column spells it
  monday_store_name         text,
  -- every other spelling monday uses for it (Clients subitem, to-dos): the
  -- names diverge systematically ("graceparkerjewelry", "ICON.", "by-willa")
  monday_aliases            text[] NOT NULL DEFAULT '{}',
  -- offboarded but still invoiced: stays in the deck up to and including
  keep_until                date,
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_meeting_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date  date NOT NULL,
  stream        text NOT NULL CHECK (stream IN ('dropship', 'branded')),
  stage         text NOT NULL DEFAULT 'collect',
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'error', 'done')),
  error         text,
  attempts      integer NOT NULL DEFAULT 0,
  -- a run is advanced by one invocation at a time; a crashed one frees it
  -- when this passes
  locked_until  timestamptz,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_date, stream)
);

-- RLS on, in the same migration (CLAUDE.md). The pipeline writes with the
-- service role, which bypasses it; agency admins may read.
ALTER TABLE public.delivery_meeting_buyers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_meeting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_meeting_runs     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_meeting_buyers_admin_read ON public.delivery_meeting_buyers;
CREATE POLICY delivery_meeting_buyers_admin_read ON public.delivery_meeting_buyers
  FOR SELECT TO authenticated USING ((SELECT is_agency_admin()));
DROP POLICY IF EXISTS delivery_meeting_settings_admin_read ON public.delivery_meeting_settings;
CREATE POLICY delivery_meeting_settings_admin_read ON public.delivery_meeting_settings
  FOR SELECT TO authenticated USING ((SELECT is_agency_admin()));
DROP POLICY IF EXISTS delivery_meeting_runs_admin_read ON public.delivery_meeting_runs;
CREATE POLICY delivery_meeting_runs_admin_read ON public.delivery_meeting_runs
  FOR SELECT TO authenticated USING ((SELECT is_agency_admin()));

-- The rendered decks and preps. Private: they carry client figures.
INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-meeting', 'delivery-meeting', false)
ON CONFLICT (id) DO NOTHING;
