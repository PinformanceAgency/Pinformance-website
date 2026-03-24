-- Brand profiles table (stores intake form data + AI-structured brand info)
CREATE TABLE IF NOT EXISTS brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  raw_data JSONB DEFAULT '{}',
  structured_data JSONB DEFAULT '{}',
  brand_voice TEXT,
  target_audience TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id)
);

-- AI tasks table (logs all pipeline runs)
CREATE TABLE IF NOT EXISTS ai_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL, -- 'strategy_generation', 'content_generation', 'feedback_analysis', 'image_generation'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  input_summary TEXT,
  output_summary TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add encrypted token columns to organizations if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'pinterest_access_token_encrypted') THEN
    ALTER TABLE organizations ADD COLUMN pinterest_access_token_encrypted TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'pinterest_refresh_token_encrypted') THEN
    ALTER TABLE organizations ADD COLUMN pinterest_refresh_token_encrypted TEXT;
  END IF;
END $$;

-- Add unique constraint on keywords for upsert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'keywords_org_id_keyword_key') THEN
    ALTER TABLE keywords ADD CONSTRAINT keywords_org_id_keyword_key UNIQUE (org_id, keyword);
  END IF;
END $$;

-- Add unique constraint on boards for upsert
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boards_org_id_name_key') THEN
    ALTER TABLE boards ADD CONSTRAINT boards_org_id_name_key UNIQUE (org_id, name);
  END IF;
END $$;

-- RLS policies for brand_profiles
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org brand profile"
  ON brand_profiles FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update own org brand profile"
  ON brand_profiles FOR UPDATE
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert own org brand profile"
  ON brand_profiles FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- RLS policies for ai_tasks
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org ai tasks"
  ON ai_tasks FOR SELECT
  USING (org_id IN (SELECT org_id FROM users WHERE id = auth.uid()));

-- Index for faster pipeline queries
CREATE INDEX IF NOT EXISTS idx_pins_status_org ON pins(org_id, status);
CREATE INDEX IF NOT EXISTS idx_pins_scheduled ON pins(org_id, status, scheduled_at) WHERE status IN ('approved', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_ai_tasks_org ON ai_tasks(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_org_performance ON keywords(org_id, performance_score DESC NULLS LAST);
