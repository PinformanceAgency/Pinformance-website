-- Seed 4 new stores (organizations) requested by the agency.
-- Mirrors the defaults applied by POST /api/admin/create-client:
--   onboarding skipped (step 5 + completed_at), full settings block,
--   and an empty brand_profile row per org.
-- Idempotent: ON CONFLICT (slug) DO NOTHING means re-running is safe.

with new_orgs as (
  insert into organizations (name, slug, onboarding_step, onboarding_completed_at, settings)
  values
    ('Fit vital',     'fit-vital',     5, now(), '{
      "pins_per_day": 40,
      "auto_approve": false,
      "timezone": "Europe/Amsterdam",
      "posting_hours": [8, 12, 17, 20],
      "content_mix": {"static": 70, "video": 20, "carousel": 10},
      "min_post_interval_minutes": 180,
      "max_pins_per_day": 5,
      "weekend_boost": true,
      "pillar_rotation": true
    }'::jsonb),
    ('Valerie Mason', 'valerie-mason', 5, now(), '{
      "pins_per_day": 40,
      "auto_approve": false,
      "timezone": "Europe/Amsterdam",
      "posting_hours": [8, 12, 17, 20],
      "content_mix": {"static": 70, "video": 20, "carousel": 10},
      "min_post_interval_minutes": 180,
      "max_pins_per_day": 5,
      "weekend_boost": true,
      "pillar_rotation": true
    }'::jsonb),
    ('Noviare',       'noviare',       5, now(), '{
      "pins_per_day": 40,
      "auto_approve": false,
      "timezone": "Europe/Amsterdam",
      "posting_hours": [8, 12, 17, 20],
      "content_mix": {"static": 70, "video": 20, "carousel": 10},
      "min_post_interval_minutes": 180,
      "max_pins_per_day": 5,
      "weekend_boost": true,
      "pillar_rotation": true
    }'::jsonb),
    ('Breathfree',    'breathfree',    5, now(), '{
      "pins_per_day": 40,
      "auto_approve": false,
      "timezone": "Europe/Amsterdam",
      "posting_hours": [8, 12, 17, 20],
      "content_mix": {"static": 70, "video": 20, "carousel": 10},
      "min_post_interval_minutes": 180,
      "max_pins_per_day": 5,
      "weekend_boost": true,
      "pillar_rotation": true
    }'::jsonb)
  on conflict (slug) do nothing
  returning id
)
insert into brand_profiles (org_id, raw_data)
select id, '{}'::jsonb from new_orgs
on conflict (org_id) do nothing;
