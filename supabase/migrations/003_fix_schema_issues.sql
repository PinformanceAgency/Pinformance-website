-- Fix schema issues: column name mismatches, missing columns, missing enum values, missing storage bucket

-- 1. Rename encrypted token columns to match application code
ALTER TABLE organizations RENAME COLUMN pinterest_access_token_enc TO pinterest_access_token_encrypted;
ALTER TABLE organizations RENAME COLUMN pinterest_refresh_token_enc TO pinterest_refresh_token_encrypted;
ALTER TABLE organizations RENAME COLUMN shopify_access_token_enc TO shopify_access_token_encrypted;
ALTER TABLE organizations RENAME COLUMN krea_api_key_enc TO krea_api_key_encrypted;

-- 2. Add structured_data column to brand_profiles (used by parse-brand-doc worker + pipelines)
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS structured_data jsonb default '{}';

-- 3. Add missing columns to ai_tasks (used by all AI pipelines)
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS input_summary text;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS output_summary text;
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS metadata jsonb default '{}';
ALTER TABLE ai_tasks ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- 4. Add missing enum values for AI pipelines
ALTER TYPE ai_task_type ADD VALUE IF NOT EXISTS 'content_generation';
ALTER TYPE ai_task_type ADD VALUE IF NOT EXISTS 'strategy_generation';

-- 5. Update default pins_per_day from 40 to 10 (40 triggers Pinterest spam detection)
-- Note: only affects new orgs. Existing orgs keep their settings.
ALTER TABLE organizations ALTER COLUMN settings SET DEFAULT '{
  "pins_per_day": 10,
  "auto_approve": false,
  "timezone": "UTC",
  "posting_hours": [7, 9, 11, 13, 15, 17, 19, 21],
  "content_mix": {"static": 70, "video": 20, "carousel": 10}
}'::jsonb;

-- 6. Add unique index for board upsert in strategy pipeline
CREATE UNIQUE INDEX IF NOT EXISTS boards_org_name_idx ON boards(org_id, name);

-- 6. Create pin-images storage bucket (used by Krea webhook for generated images)
INSERT INTO storage.buckets (id, name, public) VALUES ('pin-images', 'pin-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies for pin-images bucket
CREATE POLICY "org_upload_pin_images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pin-images');
CREATE POLICY "public_read_pin_images" ON storage.objects FOR SELECT
  USING (bucket_id = 'pin-images');
