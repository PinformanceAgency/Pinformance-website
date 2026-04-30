-- Migration 014: RAW CONTENT — external content bookmarks per organisation
-- Stores links to Tagbox, Canva, Google Drive, Dropbox, etc. with optional thumbnails.

create table if not exists public.content_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  source_type text not null default 'other',
  description text,
  thumbnail_url text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_sources_org on public.content_sources(org_id);
create index if not exists idx_content_sources_type on public.content_sources(org_id, source_type);

alter table public.content_sources enable row level security;

-- SELECT: only own org or agency_admin
drop policy if exists "content_sources_select" on public.content_sources;
create policy "content_sources_select" on public.content_sources
  for select using (org_id = public.user_org_id() or public.is_agency_admin());

-- INSERT: only into own org or agency_admin
drop policy if exists "content_sources_insert" on public.content_sources;
create policy "content_sources_insert" on public.content_sources
  for insert with check (org_id = public.user_org_id() or public.is_agency_admin());

-- UPDATE: only within own org or agency_admin
drop policy if exists "content_sources_update" on public.content_sources;
create policy "content_sources_update" on public.content_sources
  for update using (org_id = public.user_org_id() or public.is_agency_admin())
  with check (org_id = public.user_org_id() or public.is_agency_admin());

-- DELETE: only within own org or agency_admin
drop policy if exists "content_sources_delete" on public.content_sources;
create policy "content_sources_delete" on public.content_sources
  for delete using (org_id = public.user_org_id() or public.is_agency_admin());

comment on table public.content_sources is
  'External raw content sources per org (Tagbox, Canva, Google Drive, etc). Used by the Raw Content dashboard tab.';
