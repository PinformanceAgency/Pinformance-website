-- Account-level daily analytics from Pinterest /user_account/analytics endpoint
create table if not exists account_analytics (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  date date not null,
  impressions integer default 0,
  saves integer default 0,
  pin_clicks integer default 0,
  outbound_clicks integer default 0,
  engagement integer default 0,
  engagement_rate numeric(5,2) default 0,
  save_rate numeric(5,2) default 0,
  created_at timestamptz default now(),
  unique(org_id, date)
);

-- Add follower/views columns to organizations
alter table organizations add column if not exists pinterest_follower_count integer default 0;
alter table organizations add column if not exists pinterest_monthly_views integer default 0;

-- RLS
alter table account_analytics enable row level security;

create policy "Users can view own org account analytics"
  on account_analytics for select
  using (org_id = public.user_org_id());

create policy "Agency admins can view all account analytics"
  on account_analytics for select
  using (public.is_agency_admin());

create policy "Service role full access to account analytics"
  on account_analytics for all
  using (true)
  with check (true);
