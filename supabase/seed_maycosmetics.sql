-- =============================================================
-- MayCosmetics Account Setup (self-contained, run in one go)
-- Run this in Supabase SQL Editor
-- =============================================================

-- Step 1: Create org_invites table (for auto-linking new signups)
CREATE TABLE IF NOT EXISTS org_invites (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  role user_role not null default 'client_admin',
  created_at timestamptz default now(),
  unique(email)
);

-- Step 2: Create MayCosmetics org + brand profile
DO $$
DECLARE
  new_org_id uuid;
BEGIN
  INSERT INTO organizations (
    name, slug, logo_url,
    onboarding_step, onboarding_completed_at,
    settings
  ) VALUES (
    'MayCosmetics',
    'maycosmetics',
    NULL,
    5,
    NOW(),
    '{
      "pins_per_day": 40,
      "auto_approve": false,
      "timezone": "Europe/Amsterdam",
      "posting_hours": [8, 12, 17, 20],
      "content_mix": {"static": 70, "video": 20, "carousel": 10},
      "min_post_interval_minutes": 180,
      "max_pins_per_day": 5,
      "weekend_boost": true,
      "pillar_rotation": true
    }'::jsonb
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    onboarding_step = EXCLUDED.onboarding_step,
    onboarding_completed_at = EXCLUDED.onboarding_completed_at,
    settings = EXCLUDED.settings
  RETURNING id INTO new_org_id;

  -- Empty brand profile (branding comes later)
  INSERT INTO brand_profiles (org_id, raw_data)
  VALUES (new_org_id, '{}'::jsonb)
  ON CONFLICT (org_id) DO NOTHING;

  RAISE NOTICE 'MayCosmetics created: %', new_org_id;
END $$;

-- Step 3: Give your existing agency admin accounts access to MayCosmetics
-- (They keep agency_admin role from TT Advertising but can also view this org)
-- This is already handled by RLS — agency admins see all orgs via the admin panel.

-- Step 4: Auto-link trigger for new user signups
CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS trigger AS $$
DECLARE
  invite_record record;
BEGIN
  SELECT * INTO invite_record
  FROM org_invites
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF invite_record IS NOT NULL THEN
    INSERT INTO users (id, email, full_name, org_id, role, onboarding_step, onboarding_completed_at)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      invite_record.org_id,
      invite_record.role,
      5,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM org_invites WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_signup();

-- Step 5: Create invite for the MayCosmetics client user
-- !! VERANDER het email hieronder naar het echte email van de klant !!
INSERT INTO org_invites (org_id, email, role)
VALUES (
  (SELECT id FROM organizations WHERE slug = 'maycosmetics'),
  'info@maycosmetics.nl',
  'client_admin'
)
ON CONFLICT (email) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  role = EXCLUDED.role;

-- Verify
SELECT '✓ MayCosmetics ready' as status, id as org_id, slug
FROM organizations WHERE slug = 'maycosmetics';
