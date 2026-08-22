-- Phase 5 — analytics baseline stored structured (not just as P1.2.13 notes)
-- so the analytics tab can subtract absolute numbers to show movement.

CREATE TABLE IF NOT EXISTS organic.baseline_kpis (
  org_id                     uuid PRIMARY KEY,
  measured_from              date,
  measured_to                date,
  impressions                integer,
  engagements                integer,
  engagement_rate            numeric,
  outbound_clicks            integer,
  pin_saves                  integer,
  profile_visits             integer,
  monthly_views              integer,
  followers_start            integer,
  followers_end              integer,
  top_click_pin_clicks       integer,
  top_save_pin_saves         integer,
  audience_top_country_pct   numeric,
  audience_top_age_bracket   text,
  captured_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organic.baseline_kpis ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='baseline_kpis' AND policyname='baseline_kpis_read_authenticated') THEN
    CREATE POLICY "baseline_kpis_read_authenticated" ON organic.baseline_kpis
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
