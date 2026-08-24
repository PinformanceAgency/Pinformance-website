-- STAGE 2 · the client report.
--
-- Two tables. Both exist because the report has to make an argument about
-- compounding, and an argument about compounding needs a series — not a
-- single 30-day window recomputed each time someone opens the page.
--
--   monthly_kpis     one row per (org, month). The series behind section B.
--                    Filled from the Pinterest API, one month at a time,
--                    then frozen. A month already measured is never
--                    silently rewritten by a later fetch, because a client
--                    who was shown 572 clicks in August must still see 572
--                    in December.
--
--   monthly_reports  the editable layer. The headline is generated from
--                    the data and then owned by the manager; what the
--                    client sees is the approved text, never the draft.

CREATE TABLE IF NOT EXISTS organic.monthly_kpis (
  org_id                 uuid NOT NULL,
  month                  date NOT NULL,           -- always the 1st
  -- Hard — results
  outbound_clicks        integer,
  pin_saves              integer,
  page_visits            integer,
  add_to_cart            integer,
  checkouts              integer,
  conversions            integer,
  revenue                numeric,
  -- Soft — distribution and reach
  impressions            integer,
  engagements            integer,
  pin_clicks             integer,
  engagement_rate        numeric,
  save_rate              numeric,
  -- Your Pins vs Other Pins. Other Pins are user-saved from the client
  -- site: valuable, but not attributable to our work, so they are never
  -- folded into the headline figures.
  other_impressions      integer,
  other_saves            integer,
  -- Leading indicators — the foundation being built, which is the only
  -- honest story in months one to four.
  pins_published         integer,
  boards_live            integer,
  keywords_validated     integer,
  urls_active            integer,
  -- On-site quality, hand-entered from GA4 (no API access in this build)
  ga4_engagement_rate    numeric,
  ga4_session_seconds    numeric,
  ga4_pages_per_session  numeric,
  ga4_bounce_rate        numeric,
  ga4_site_engagement_rate   numeric,
  ga4_site_session_seconds   numeric,
  ga4_site_pages_per_session numeric,
  ga4_site_bounce_rate       numeric,
  -- Provenance, carried with the row rather than re-derived on read
  conversion_tag_firing  boolean NOT NULL DEFAULT false,
  ga4_connected          boolean NOT NULL DEFAULT false,
  is_partial             boolean NOT NULL DEFAULT false,
  measured_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, month)
);

CREATE TABLE IF NOT EXISTS organic.monthly_reports (
  org_id              uuid NOT NULL,
  month               date NOT NULL,
  headline_generated  text,
  headline_approved   text,
  next_month_notes    text,
  published_at        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, month)
);

CREATE INDEX IF NOT EXISTS monthly_kpis_org_idx    ON organic.monthly_kpis(org_id, month DESC);
CREATE INDEX IF NOT EXISTS monthly_reports_org_idx ON organic.monthly_reports(org_id, month DESC);

ALTER TABLE organic.monthly_kpis    ENABLE ROW LEVEL SECURITY;
ALTER TABLE organic.monthly_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='monthly_kpis' AND policyname='monthly_kpis_read_authenticated') THEN
    CREATE POLICY "monthly_kpis_read_authenticated" ON organic.monthly_kpis FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='monthly_reports' AND policyname='monthly_reports_read_authenticated') THEN
    CREATE POLICY "monthly_reports_read_authenticated" ON organic.monthly_reports FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
