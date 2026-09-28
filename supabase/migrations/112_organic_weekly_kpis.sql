-- 112 — organic per week, zoals de brands het wekelijks willen zien.
--
-- `monthly_kpis` is het maandrapport voor de klant. De agency kijkt per week
-- (Tristan, 28-09-2026), en een maand is te grof om na een nieuwe cyclus te
-- zien of er iets beweegt. Dit is dezelfde vorm op weekniveau, maandag tot
-- en met zondag, en twee helften met een verschillende herkomst:
--
--   uit de API   — bereik, saves, kliks. Alleen de EIGEN image- en video-pins
--                  van de store (own-pins.ts): product-pins lopen op paid en
--                  zijn geen organic.
--   met de hand  — omzet, checkouts, page visits, add to cart. Die bestaan
--                  voor organic alleen in Conversion Insights in Ads Manager,
--                  niet in de API (/resources/delivery_metrics kent voor
--                  ORGANIC geen enkele conversiemetric; gecontroleerd tegen
--                  Pinterest's eigen OpenAPI-spec op 28-09-2026).
--
-- Het conversievenster staat per rij, en het is dat van de BRAND
-- (`public.store_settings.attribution_setting`, standaard 30/1), zodat organic
-- en paid over dezelfde regel worden gemeten. Opgeslagen zoals het was op het
-- moment van invoeren: verandert de brand later zijn venster, dan blijven de
-- oude weken leesbaar als wat ze waren, en het scherm meldt het verschil.

CREATE TABLE IF NOT EXISTS organic.weekly_kpis (
  org_id                  uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  week_start              date        NOT NULL,
  -- Uit de API. Null = niet gemeten, niet nul.
  impressions             bigint,
  pin_saves               bigint,
  pin_clicks              bigint,
  outbound_clicks         bigint,
  engagements             bigint,
  -- Een dag van de week was nog niet READY bij Pinterest, of viel buiten de
  -- 90 dagen die de API teruggeeft.
  is_partial              boolean     NOT NULL DEFAULT false,
  measured_at             timestamptz,
  -- Uit Conversion Insights: organic, your pins, image + video.
  revenue_organic         numeric,
  checkouts               integer,
  page_visits             integer,
  add_to_cart             integer,
  conversion_window_click integer,
  conversion_window_view  integer,
  figures_entered_at      timestamptz,
  figures_note            text,
  PRIMARY KEY (org_id, week_start),
  -- Een week begint op maandag. Een rij op een dinsdag telt dubbel met de
  -- week ervoor en valt op geen enkel scherm op.
  CONSTRAINT weekly_kpis_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT weekly_kpis_nonneg CHECK (
        COALESCE(revenue_organic, 0) >= 0 AND COALESCE(checkouts, 0) >= 0
    AND COALESCE(page_visits, 0) >= 0     AND COALESCE(add_to_cart, 0) >= 0),
  -- Omzet zonder venster is een getal dat met niets te vergelijken is.
  CONSTRAINT weekly_kpis_window_with_revenue CHECK (
    revenue_organic IS NULL
    OR (conversion_window_click IS NOT NULL AND conversion_window_view IS NOT NULL))
);

COMMENT ON TABLE organic.weekly_kpis IS
  'Organic per week (ma-zo). Bereik uit de API (eigen image+video pins), omzet en conversies met de hand uit Conversion Insights met het conversievenster van de brand.';
COMMENT ON COLUMN organic.weekly_kpis.revenue_organic IS
  'Conversion Insights, organic conversions only. Paid-assisted hoort hier NIET bij: dat claimt het paid-rapport al.';

CREATE INDEX IF NOT EXISTS weekly_kpis_week_idx ON organic.weekly_kpis (week_start);

ALTER TABLE organic.weekly_kpis ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic'
                  AND tablename='weekly_kpis' AND policyname='weekly_kpis_read_authenticated') THEN
    CREATE POLICY "weekly_kpis_read_authenticated" ON organic.weekly_kpis
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
