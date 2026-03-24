-- Add per-user onboarding fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step int DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_video_watched boolean DEFAULT false;

-- Sync existing org-level onboarding to users
-- If org already completed onboarding, mark all existing users as completed too
UPDATE users u
SET
  onboarding_step = o.onboarding_step,
  onboarding_completed_at = o.onboarding_completed_at,
  onboarding_video_watched = o.onboarding_video_watched
FROM organizations o
WHERE u.org_id = o.id
AND o.onboarding_completed_at IS NOT NULL;
