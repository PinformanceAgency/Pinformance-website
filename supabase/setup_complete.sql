-- =============================================
-- PINFORMANCE COMPLETE DATABASE SETUP
-- Run this in Supabase SQL Editor (one time)
-- =============================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- Enums (use DO block to handle "already exists" gracefully)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('agency_admin', 'client_admin', 'client_viewer');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pin_type AS ENUM ('static', 'video', 'idea', 'carousel');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pin_status AS ENUM ('generating', 'generated', 'scheduled', 'approved', 'posting', 'posted', 'failed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE board_status AS ENUM ('draft', 'created', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE parse_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE scrape_status AS ENUM ('pending', 'scraping', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE keyword_source AS ENUM ('ai_generated', 'competitor', 'manual', 'analytics');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE rule_type AS ENUM ('prompt_modifier', 'content_filter', 'style_guide', 'keyword_boost', 'keyword_block');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_task_type AS ENUM ('keyword_strategy', 'board_plan', 'pin_content', 'image_prompt', 'feedback_analysis', 'competitor_analysis');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE ai_task_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pattern_type AS ENUM ('keyword', 'visual_style', 'posting_time', 'content_type', 'description_pattern');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  logo_url text,
  shopify_domain text,
  shopify_access_token_enc text,
  pinterest_user_id text,
  pinterest_access_token_enc text,
  pinterest_refresh_token_enc text,
  pinterest_token_expires_at timestamptz,
  krea_api_key_enc text,
  onboarding_step int default 0,
  onboarding_completed_at timestamptz,
  onboarding_video_watched boolean default false,
  settings jsonb default '{
    "pins_per_day": 40,
    "auto_approve": false,
    "timezone": "UTC",
    "posting_hours": [8, 12, 17, 20],
    "content_mix": {"static": 70, "video": 20, "carousel": 10}
  }'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  org_id uuid references organizations(id) on delete cascade not null,
  role user_role not null default 'client_viewer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Brand Profiles
CREATE TABLE IF NOT EXISTS brand_profiles (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null unique,
  brand_voice text,
  target_audience text,
  unique_selling_points text[] default '{}',
  color_palette text[] default '{}',
  font_preferences text[] default '{}',
  tone_keywords text[] default '{}',
  avoid_keywords text[] default '{}',
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  shopify_product_id text,
  title text not null,
  description text,
  product_type text,
  vendor text,
  tags text[] default '{}',
  images jsonb default '[]',
  variants jsonb default '[]',
  collections text[] default '{}',
  status text default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_shopify_idx ON products(org_id, shopify_product_id) WHERE shopify_product_id IS NOT NULL;

-- Competitors
CREATE TABLE IF NOT EXISTS competitors (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  pinterest_username text not null,
  pinterest_url text,
  display_name text,
  last_scraped_at timestamptz,
  scrape_status scrape_status default 'pending',
  board_count int,
  pin_count int,
  follower_count int,
  avg_posting_frequency numeric,
  top_keywords text[] default '{}',
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Competitor Boards
CREATE TABLE IF NOT EXISTS competitor_boards (
  id uuid default gen_random_uuid() primary key,
  competitor_id uuid references competitors(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  description text,
  pin_count int,
  category text,
  keywords text[] default '{}',
  created_at timestamptz default now()
);

-- Boards
CREATE TABLE IF NOT EXISTS boards (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  pinterest_board_id text,
  name text not null,
  description text,
  category text,
  keywords text[] default '{}',
  privacy text default 'public' check (privacy in ('public', 'secret')),
  status board_status default 'draft',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Board Sections
CREATE TABLE IF NOT EXISTS board_sections (
  id uuid default gen_random_uuid() primary key,
  board_id uuid references boards(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  pinterest_section_id text,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Keywords
CREATE TABLE IF NOT EXISTS keywords (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  keyword text not null,
  search_volume int,
  competition_score numeric,
  relevance_score numeric,
  performance_score numeric,
  category text,
  source keyword_source default 'ai_generated',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE UNIQUE INDEX IF NOT EXISTS keywords_org_keyword_idx ON keywords(org_id, keyword);

-- Pins
CREATE TABLE IF NOT EXISTS pins (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  board_id uuid references boards(id) on delete set null,
  board_section_id uuid references board_sections(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  pinterest_pin_id text,
  title varchar(100) not null,
  description varchar(500),
  link_url text,
  alt_text text,
  pin_type pin_type default 'static',
  image_url text,
  video_url text,
  keywords text[] default '{}',
  status pin_status default 'generating',
  generation_prompt text,
  krea_job_id text,
  scheduled_at timestamptz,
  posted_at timestamptz,
  rejected_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS pins_org_status_idx ON pins(org_id, status);
CREATE INDEX IF NOT EXISTS pins_scheduled_idx ON pins(org_id, scheduled_at) WHERE status IN ('approved', 'scheduled');
CREATE INDEX IF NOT EXISTS pins_krea_job_idx ON pins(krea_job_id) WHERE krea_job_id IS NOT NULL;

-- Pin Analytics
CREATE TABLE IF NOT EXISTS pin_analytics (
  id uuid default gen_random_uuid() primary key,
  pin_id uuid references pins(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  date date not null,
  impressions int default 0,
  saves int default 0,
  pin_clicks int default 0,
  outbound_clicks int default 0,
  video_views int default 0,
  save_rate numeric,
  engagement_rate numeric,
  created_at timestamptz default now(),
  unique(pin_id, date)
);

CREATE INDEX IF NOT EXISTS pin_analytics_org_date_idx ON pin_analytics(org_id, date);

-- Board Analytics
CREATE TABLE IF NOT EXISTS board_analytics (
  id uuid default gen_random_uuid() primary key,
  board_id uuid references boards(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  date date not null,
  impressions int default 0,
  saves int default 0,
  clicks int default 0,
  created_at timestamptz default now(),
  unique(board_id, date)
);

-- Calendar Entries
CREATE TABLE IF NOT EXISTS calendar_entries (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  pin_id uuid references pins(id) on delete cascade not null,
  scheduled_date date not null,
  scheduled_time time,
  slot_index int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS calendar_entries_org_date_idx ON calendar_entries(org_id, scheduled_date);

-- AI Tasks
CREATE TABLE IF NOT EXISTS ai_tasks (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  task_type ai_task_type not null,
  input_data jsonb default '{}',
  output_data jsonb default '{}',
  model text,
  tokens_used int,
  status ai_task_status default 'pending',
  error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

-- Feedback Rules
CREATE TABLE IF NOT EXISTS feedback_rules (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade,
  rule_type rule_type not null,
  rule_text text not null,
  priority int default 0,
  is_active boolean default true,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Performance Patterns
CREATE TABLE IF NOT EXISTS performance_patterns (
  id uuid default gen_random_uuid() primary key,
  pattern_type pattern_type not null,
  pattern_data jsonb default '{}',
  discovered_at timestamptz default now(),
  is_active boolean default true
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers (drop first to avoid duplicates)
DROP TRIGGER IF EXISTS set_updated_at ON organizations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON brand_profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON brand_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON competitors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON competitors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON boards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON boards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON keywords;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON keywords FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON pins;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON pins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON calendar_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON feedback_rules;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON feedback_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE pin_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_rules ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations policies
DROP POLICY IF EXISTS "Users can view own org" ON organizations;
CREATE POLICY "Users can view own org" ON organizations FOR SELECT USING (id = get_user_org_id());

DROP POLICY IF EXISTS "Agency admins can update own org" ON organizations;
CREATE POLICY "Agency admins can update own org" ON organizations FOR UPDATE USING (
  id = get_user_org_id() AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'agency_admin')
);

-- Users policies
DROP POLICY IF EXISTS "Users can view own org users" ON users;
CREATE POLICY "Users can view own org users" ON users FOR SELECT USING (org_id = get_user_org_id());

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (id = auth.uid());

-- Generic org-based policies for all other tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['brand_profiles','products','competitors','competitor_boards','boards','board_sections','keywords','pins','pin_analytics','board_analytics','calendar_entries','ai_tasks','feedback_rules'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Org members can view" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Org members can view" ON %I FOR SELECT USING (org_id = get_user_org_id())', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Org members can insert" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Org members can insert" ON %I FOR INSERT WITH CHECK (org_id = get_user_org_id())', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Org members can update" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Org members can update" ON %I FOR UPDATE USING (org_id = get_user_org_id())', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Org members can delete" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Org members can delete" ON %I FOR DELETE USING (org_id = get_user_org_id())', tbl);
  END LOOP;
END $$;

-- =============================================
-- CREATE ORGANIZATION & LINK USERS
-- =============================================

-- Create Pinformance Agency organization
INSERT INTO organizations (name, slug, onboarding_step)
VALUES ('TT Advertising', 'tt-advertising', 1)
ON CONFLICT (slug) DO NOTHING;

-- Link info@tt-advertisingbv.com as agency admin
INSERT INTO users (id, email, full_name, org_id, role)
SELECT
  'c93d6ec4-b33d-45a0-aae4-00434ff63678'::uuid,
  'info@tt-advertisingbv.com',
  'Admin',
  (SELECT id FROM organizations WHERE slug = 'tt-advertising'),
  'agency_admin'::user_role
ON CONFLICT (id) DO UPDATE SET
  org_id = (SELECT id FROM organizations WHERE slug = 'tt-advertising'),
  role = 'agency_admin'::user_role;

-- Link tycho@tt-advertisingbv.com as agency admin
INSERT INTO users (id, email, full_name, org_id, role)
SELECT
  'cc90567e-a2c8-477c-8f05-356a1bf9e276'::uuid,
  'tycho@tt-advertisingbv.com',
  'Tycho',
  (SELECT id FROM organizations WHERE slug = 'tt-advertising'),
  'agency_admin'::user_role
ON CONFLICT (id) DO UPDATE SET
  org_id = (SELECT id FROM organizations WHERE slug = 'tt-advertising'),
  role = 'agency_admin'::user_role;

-- Done!
SELECT 'Setup complete! Organization and users created.' as status;
