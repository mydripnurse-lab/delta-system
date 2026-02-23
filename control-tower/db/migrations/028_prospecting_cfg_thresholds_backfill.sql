BEGIN;

-- Backfill legacy prospecting threshold keys into isolated config namespace.
-- Safe behavior:
-- 1) copies only when legacy key exists
-- 2) does not overwrite if new cfg key already exists for tenant/provider/scope/module

WITH key_map(old_key, new_key) AS (
  VALUES
    ('prospecting_threshold_lost_value_critical', 'prospecting_cfg_lost_value_critical'),
    ('prospecting_threshold_lost_value_warning', 'prospecting_cfg_lost_value_warning'),
    ('prospecting_threshold_pending_critical', 'prospecting_cfg_pending_critical'),
    ('prospecting_threshold_pending_warning', 'prospecting_cfg_pending_warning'),
    ('prospecting_threshold_contactable_critical_below', 'prospecting_cfg_contactable_critical_below'),
    ('prospecting_threshold_contactable_warning_below', 'prospecting_cfg_contactable_warning_below'),
    ('prospecting_threshold_ctr_warning_below', 'prospecting_cfg_ctr_warning_below'),
    ('prospecting_threshold_profile_missing_critical', 'prospecting_cfg_profile_missing_critical'),
    ('prospecting_threshold_profile_missing_warning', 'prospecting_cfg_profile_missing_warning')
),
source_rows AS (
  SELECT
    cv.organization_id,
    cv.provider,
    cv.scope,
    cv.module,
    km.new_key AS key_name,
    cv.key_value,
    cv.value_type,
    cv.is_secret,
    cv.is_active,
    cv.description,
    cv.metadata,
    cv.last_synced_at
  FROM app.organization_custom_values cv
  JOIN key_map km
    ON cv.key_name = km.old_key
)
INSERT INTO app.organization_custom_values (
  organization_id,
  provider,
  scope,
  module,
  key_name,
  key_value,
  value_type,
  is_secret,
  is_active,
  description,
  metadata,
  last_synced_at
)
SELECT
  s.organization_id,
  s.provider,
  s.scope,
  s.module,
  s.key_name,
  s.key_value,
  s.value_type,
  s.is_secret,
  s.is_active,
  CASE
    WHEN COALESCE(s.description, '') = '' THEN 'Backfilled from legacy prospecting_threshold_* key.'
    ELSE s.description
  END,
  COALESCE(s.metadata, '{}'::jsonb) || jsonb_build_object('migrated_from_legacy_threshold_key', true),
  s.last_synced_at
FROM source_rows s
ON CONFLICT (organization_id, provider, scope, module, key_name) DO NOTHING;

COMMIT;
