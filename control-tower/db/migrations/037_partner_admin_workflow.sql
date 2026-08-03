BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.staff_form_configs
  ADD COLUMN IF NOT EXISTS applicant_received_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS admin_notification_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS admin_base_url TEXT NOT NULL DEFAULT 'https://admin.mydripnurse.com';

ALTER TABLE app.staff_applications
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;

UPDATE app.staff_applications
SET submitted_at = COALESCE(submitted_at, created_at),
    first_name = COALESCE(first_name, request_payload->>'firstName'),
    last_name = COALESCE(last_name, request_payload->>'lastName'),
    phone = COALESCE(phone, request_payload->>'phone'),
    company = COALESCE(company, request_payload->>'company');

ALTER TABLE app.staff_applications
  DROP CONSTRAINT IF EXISTS staff_applications_status_ck;

ALTER TABLE app.staff_applications
  ALTER COLUMN status SET DEFAULT 'submitted';

ALTER TABLE app.staff_applications
  ADD CONSTRAINT staff_applications_status_ck CHECK (
    status IN (
      'submitted',
      'under_review',
      'stripe_pending',
      'staff_ready',
      'staff_processing',
      'staff_created',
      'calendar_deposit_pending',
      'ready_to_complete',
      'processing',
      'completed',
      'completed_with_warnings',
      'rejected',
      'failed'
    )
  );

CREATE TABLE IF NOT EXISTS app.staff_application_location_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES app.staff_applications(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  state TEXT NOT NULL,
  county TEXT NOT NULL,
  stripe_status TEXT NOT NULL DEFAULT 'pending',
  staff_status TEXT NOT NULL DEFAULT 'pending',
  calendars_status TEXT NOT NULL DEFAULT 'pending',
  deposit_status TEXT NOT NULL DEFAULT 'pending',
  stripe_completed_at TIMESTAMPTZ,
  stripe_completed_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  deposit_completed_at TIMESTAMPTZ,
  deposit_completed_by UUID REFERENCES app.users(id) ON DELETE SET NULL,
  deposit_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_application_location_steps_uq UNIQUE (application_id, location_id),
  CONSTRAINT staff_application_location_steps_stripe_ck
    CHECK (stripe_status IN ('pending', 'complete', 'not_required')),
  CONSTRAINT staff_application_location_steps_staff_ck
    CHECK (staff_status IN ('pending', 'processing', 'complete', 'failed')),
  CONSTRAINT staff_application_location_steps_calendars_ck
    CHECK (calendars_status IN ('pending', 'processing', 'complete', 'failed')),
  CONSTRAINT staff_application_location_steps_deposit_ck
    CHECK (deposit_status IN ('pending', 'processing', 'complete', 'not_required', 'failed'))
);

CREATE INDEX IF NOT EXISTS staff_application_location_steps_application_idx
  ON app.staff_application_location_steps (application_id, created_at);

DROP TRIGGER IF EXISTS trg_staff_application_location_steps_set_updated_at
  ON app.staff_application_location_steps;
CREATE TRIGGER trg_staff_application_location_steps_set_updated_at
BEFORE UPDATE ON app.staff_application_location_steps
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

COMMIT;
