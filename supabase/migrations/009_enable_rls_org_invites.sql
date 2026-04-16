-- =============================================================
-- Enable RLS on org_invites
-- =============================================================
-- The org_invites table was created without RLS, which Supabase's
-- Security Advisor flags as "RLS Disabled in Public".
--
-- This table is only accessed by:
--   1. handle_new_user_signup() trigger (SECURITY DEFINER -> bypasses RLS)
--   2. Admin API routes using the service_role key (bypasses RLS)
--
-- So we enable RLS with NO policies: all direct client access is denied
-- (via anon/authenticated keys), while trusted server paths keep working.
-- =============================================================

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites FORCE ROW LEVEL SECURITY;

-- No policies = deny all for non-privileged roles.
-- service_role bypasses RLS; SECURITY DEFINER functions run as their owner.
