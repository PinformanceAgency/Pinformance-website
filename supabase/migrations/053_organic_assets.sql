-- Assets tab — external link registry per client.
-- No file storage on our side (per requirement). Everything is a URL to
-- Google Drive, Canva, PinInspector, etc.
-- linked_task_id is a text foreign to organic.task_definitions.id so an
-- asset can trace back to the task that captured it.

CREATE TABLE IF NOT EXISTS organic.assets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  title          text NOT NULL,
  url            text NOT NULL,
  type           text NOT NULL,
  source_tool    text,
  linked_task_id text,
  uploaded_by    uuid,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  notes          text
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='assets_type_valid') THEN
    ALTER TABLE organic.assets
      ADD CONSTRAINT assets_type_valid CHECK (type IN (
        'BRAND_BOOK','CONTENT_DRIVE','PININSPECTOR_EXPORT','CANVA_DESIGN',
        'FLAGGED_PIN_REPORT','GOOGLE_KEYWORD_LIST','AUDIENCE_DOCUMENT',
        'PRODUCT_FEED','MOODBOARD','OTHER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assets_org_idx  ON organic.assets(org_id);
CREATE INDEX IF NOT EXISTS assets_task_idx ON organic.assets(linked_task_id);

ALTER TABLE organic.assets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='organic' AND tablename='assets' AND policyname='assets_read_authenticated') THEN
    CREATE POLICY "assets_read_authenticated" ON organic.assets FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
