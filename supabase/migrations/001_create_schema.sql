-- Pinformance Database Schema
-- Run this in Supabase SQL Editor

-- Enable required extensions
create extension if not exists "pgcrypto";

-- Enums
create type user_role as enum ('agency_admin', 'client_admin', 'client_viewer');
create type pin_type as enum ('static', 'video', 'idea', 'carousel');
create type pin_status as enum ('generating', 'generated', 'scheduled', 'approved', 'posting', 'posted', 'failed', 'rejected');
create type board_status as enum ('draft', 'created', 'active', 'archived');
create type parse_status as enum ('pending', 'processing', 'completed', 'failed');
create type scrape_status as enum ('pending', 'scraping', 'completed', 'failed');
create type keyword_source as enum ('ai_generated', 'competitor', 'manual', 'analytics');
create type rule_type as enum ('prompt_modifier', 'content_filter', 'style_guide', 'keyword_boost', 'keyword_block');
create type ai_task_type as enum ('keyword_strategy', 'board_plan', 'pin_content', 'image_prompt', 'feedback_analysis', 'competitor_analysis');
create type ai_task_status as enum ('pending', 'processing', 'completed', 'failed');
create type pattern_type as enum ('keyword', 'visual_style', 'posting_time', 'content_type', 'description_pattern');

-- Organizations (tenants)
create table organizations (
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

-- Users
create table users (
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
create table brand_profiles (
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

-- Brand Documents
create table brand_documents (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  file_path text not null,
  file_type text,
  parsed_content text,
  parse_status parse_status default 'pending',
  created_at timestamptz default now()
);

-- Products
create table products (
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

create unique index products_shopify_idx on products(org_id, shopify_product_id) where shopify_product_id is not null;

-- Competitors
create table competitors (
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
create table competitor_boards (
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

-- Boards (managed Pinterest boards)
create table boards (
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
create table board_sections (
  id uuid default gen_random_uuid() primary key,
  board_id uuid references boards(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  pinterest_section_id text,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Keywords
create table keywords (
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

create unique index keywords_org_keyword_idx on keywords(org_id, keyword);

-- Pins
create table pins (
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

create index pins_org_status_idx on pins(org_id, status);
create index pins_scheduled_idx on pins(org_id, scheduled_at) where status in ('approved', 'scheduled');
create index pins_krea_job_idx on pins(krea_job_id) where krea_job_id is not null;

-- Pin Analytics
create table pin_analytics (
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

create index pin_analytics_org_date_idx on pin_analytics(org_id, date);

-- Board Analytics
create table board_analytics (
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
create table calendar_entries (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  pin_id uuid references pins(id) on delete cascade not null,
  scheduled_date date not null,
  scheduled_time time,
  slot_index int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index calendar_entries_org_date_idx on calendar_entries(org_id, scheduled_date);

-- AI Tasks (audit trail)
create table ai_tasks (
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
create table feedback_rules (
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

-- Performance Patterns (cross-brand)
create table performance_patterns (
  id uuid default gen_random_uuid() primary key,
  pattern_type pattern_type not null,
  pattern_data jsonb default '{}',
  discovered_at timestamptz default now(),
  is_active boolean default true
);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply trigger to all tables with updated_at
create trigger set_updated_at before update on organizations for each row execute function update_updated_at();
create trigger set_updated_at before update on users for each row execute function update_updated_at();
create trigger set_updated_at before update on brand_profiles for each row execute function update_updated_at();
create trigger set_updated_at before update on products for each row execute function update_updated_at();
create trigger set_updated_at before update on competitors for each row execute function update_updated_at();
create trigger set_updated_at before update on boards for each row execute function update_updated_at();
create trigger set_updated_at before update on keywords for each row execute function update_updated_at();
create trigger set_updated_at before update on pins for each row execute function update_updated_at();
create trigger set_updated_at before update on calendar_entries for each row execute function update_updated_at();
create trigger set_updated_at before update on feedback_rules for each row execute function update_updated_at();
