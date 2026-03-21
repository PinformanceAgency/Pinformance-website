-- Row Level Security Policies

-- Enable RLS on all tables
alter table organizations enable row level security;
alter table users enable row level security;
alter table brand_profiles enable row level security;
alter table brand_documents enable row level security;
alter table products enable row level security;
alter table competitors enable row level security;
alter table competitor_boards enable row level security;
alter table boards enable row level security;
alter table board_sections enable row level security;
alter table keywords enable row level security;
alter table pins enable row level security;
alter table pin_analytics enable row level security;
alter table board_analytics enable row level security;
alter table calendar_entries enable row level security;
alter table ai_tasks enable row level security;
alter table feedback_rules enable row level security;
alter table performance_patterns enable row level security;

-- Helper: get current user's org_id
create or replace function public.user_org_id()
returns uuid as $$
  select org_id from public.users where id = auth.uid()
$$ language sql security definer stable;

-- Helper: check if current user is agency admin
create or replace function public.is_agency_admin()
returns boolean as $$
  select exists(
    select 1 from public.users where id = auth.uid() and role = 'agency_admin'
  )
$$ language sql security definer stable;

-- Organizations
create policy "Users see own org" on organizations
  for select using (id = public.user_org_id() or public.is_agency_admin());
create policy "Agency admin manages all orgs" on organizations
  for all using (public.is_agency_admin());
create policy "Client admin updates own org" on organizations
  for update using (
    id = public.user_org_id() and
    exists(select 1 from users where id = auth.uid() and role in ('agency_admin', 'client_admin'))
  );

-- Users
create policy "Users see own org members" on users
  for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "Agency admin manages all users" on users
  for all using (public.is_agency_admin());

-- Brand Profiles
create policy "org_isolation" on brand_profiles for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on brand_profiles for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on brand_profiles for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on brand_profiles for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Brand Documents
create policy "org_isolation" on brand_documents for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on brand_documents for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on brand_documents for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on brand_documents for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Products
create policy "org_isolation" on products for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on products for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on products for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on products for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Competitors
create policy "org_isolation" on competitors for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on competitors for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on competitors for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on competitors for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Competitor Boards
create policy "org_isolation" on competitor_boards for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on competitor_boards for insert with check (org_id = public.user_org_id() or public.is_agency_admin());

-- Boards
create policy "org_isolation" on boards for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on boards for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on boards for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on boards for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Board Sections
create policy "org_isolation" on board_sections for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on board_sections for insert with check (org_id = public.user_org_id() or public.is_agency_admin());

-- Keywords
create policy "org_isolation" on keywords for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on keywords for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on keywords for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on keywords for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Pins
create policy "org_isolation" on pins for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on pins for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on pins for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on pins for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- Pin Analytics
create policy "org_isolation" on pin_analytics for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on pin_analytics for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on pin_analytics for update using (org_id = public.user_org_id() or public.is_agency_admin());

-- Board Analytics
create policy "org_isolation" on board_analytics for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on board_analytics for insert with check (org_id = public.user_org_id() or public.is_agency_admin());

-- Calendar Entries
create policy "org_isolation" on calendar_entries for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on calendar_entries for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on calendar_entries for update using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_delete" on calendar_entries for delete using (org_id = public.user_org_id() or public.is_agency_admin());

-- AI Tasks
create policy "org_isolation" on ai_tasks for select using (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_write" on ai_tasks for insert with check (org_id = public.user_org_id() or public.is_agency_admin());
create policy "org_update" on ai_tasks for update using (org_id = public.user_org_id() or public.is_agency_admin());

-- Feedback Rules (global rules visible to all, org rules to own org)
create policy "read_rules" on feedback_rules for select using (
  org_id is null or org_id = public.user_org_id() or public.is_agency_admin()
);
create policy "agency_manages_rules" on feedback_rules for all using (public.is_agency_admin());

-- Performance Patterns (read by all, managed by agency)
create policy "read_patterns" on performance_patterns for select using (true);
create policy "agency_manages_patterns" on performance_patterns for all using (public.is_agency_admin());

-- Storage bucket for uploads
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true)
  on conflict (id) do nothing;

-- Storage policy: users can upload to their org folder
create policy "org_upload" on storage.objects for insert
  with check (bucket_id = 'uploads' and (storage.foldername(name))[2] = public.user_org_id()::text);
create policy "org_read" on storage.objects for select
  using (bucket_id = 'uploads');

-- Enable Realtime for key tables
alter publication supabase_realtime add table pins;
alter publication supabase_realtime add table calendar_entries;
alter publication supabase_realtime add table competitors;
alter publication supabase_realtime add table ai_tasks;
