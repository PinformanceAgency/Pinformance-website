-- Help Center audit log.
--
-- Every prompt an agency_admin types into the in-app Help Center gets
-- logged here, along with what the system did about it. Keeps a full
-- audit trail of who-changed-what (incl. before/after values) so we
-- can roll back if a capability handler ever does the wrong thing.

create table help_requests (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references users(id) on delete set null,

  -- the original natural-language prompt
  prompt text not null,
  -- what the system displayed back to the admin
  response text not null,

  -- 'apply'       — capability handler ran successfully
  -- 'answer'      — pure Q&A, no mutation
  -- 'unsupported' — requires the developer; no change applied
  -- 'error'       — handler failed (DB error, validation, etc.)
  type text not null check (type in ('apply', 'answer', 'unsupported', 'error')),

  -- name of the capability handler that ran, when type='apply' or 'error'
  capability text,

  -- audit trail: what changed (only set for type='apply')
  before_value jsonb,
  after_value jsonb,

  created_at timestamptz default now() not null
);

create index help_requests_org_id_created_at_idx
  on help_requests (org_id, created_at desc);
create index help_requests_user_id_idx on help_requests (user_id);

-- RLS: agency_admins see all rows for their active org. client_admins
-- don't have Help Center access at all (UI blocks them), but the policy
-- still scopes them to their own org defensively.
alter table help_requests enable row level security;

create policy "agency_admins read help_requests for their org"
  on help_requests for select
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.role in ('agency_admin', 'client_admin')
        and (
          users.active_org_id = help_requests.org_id
          or users.org_id = help_requests.org_id
        )
    )
  );

-- Only the server (service_role) writes — keeps capability dispatch
-- centralized in the API route and prevents clients from forging rows.
create policy "service_role writes help_requests"
  on help_requests for insert
  with check (auth.role() = 'service_role');
