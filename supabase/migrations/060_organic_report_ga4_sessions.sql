-- STAGE 2 · section D needs a session count, not just session quality.
--
-- Section D puts two figures side by side — what Pinterest counted, and what
-- GA4 counted — and then explains the gap. 059 gave us GA4's *quality*
-- columns (engagement rate, duration, bounce) but no volume column, so the
-- left-hand side of that comparison had nothing to render.
--
-- ga4_sessions is Pinterest-attributed sessions as GA4 reports them. It is
-- expected to be far lower than outbound_clicks, and that gap IS the point
-- of the section: it is evidence, not an error to be reconciled away.

ALTER TABLE organic.monthly_kpis
  ADD COLUMN IF NOT EXISTS ga4_sessions integer;

COMMENT ON COLUMN organic.monthly_kpis.ga4_sessions IS
  'Pinterest-attributed sessions per GA4. Deliberately not reconciled with outbound_clicks — the difference is what section D explains.';
