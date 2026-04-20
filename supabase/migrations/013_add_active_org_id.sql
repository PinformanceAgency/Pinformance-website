-- Migration 013: add active_org_id to users for agency_admin org switching
-- SECURITY: active_org_id is honoured by application code ONLY for users with role = 'agency_admin'.
-- The existing RLS policies already grant agency_admin cross-org SELECT access via is_agency_admin().

alter table public.users
  add column if not exists active_org_id uuid references public.organizations(id) on delete set null;

-- Optional helper: pick the effective org in SQL contexts (mirrors getOrgIdFromProfile in TS).
-- Defaults to org_id unless the user is an agency_admin with a set active_org_id.
create or replace function public.effective_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when u.role = 'agency_admin' and u.active_org_id is not null then u.active_org_id
    else u.org_id
  end
  from public.users u
  where u.id = auth.uid();
$$;

grant execute on function public.effective_org_id() to authenticated;

comment on column public.users.active_org_id is
  'Agency admins only: the org they are currently "acting as" in the dashboard. Ignored by application code for all other roles.';
