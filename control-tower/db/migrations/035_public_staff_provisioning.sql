BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.staff_form_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_url TEXT,
  calendar_mode TEXT NOT NULL DEFAULT 'all_compatible',
  calendar_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_form_configs_org_uq UNIQUE (organization_id),
  CONSTRAINT staff_form_configs_key_uq UNIQUE (form_key),
  CONSTRAINT staff_form_configs_calendar_mode_ck
    CHECK (calendar_mode IN ('all_compatible', 'specific'))
);

CREATE TRIGGER trg_staff_form_configs_set_updated_at
BEFORE UPDATE ON app.staff_form_configs
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.staff_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  request_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  result JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staff_applications_status_ck
    CHECK (status IN ('processing', 'completed', 'completed_with_warnings', 'failed'))
);

CREATE INDEX IF NOT EXISTS staff_applications_org_created_idx
ON app.staff_applications (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS staff_applications_email_idx
ON app.staff_applications (LOWER(email));

CREATE TRIGGER trg_staff_applications_set_updated_at
BEFORE UPDATE ON app.staff_applications
FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

COMMIT;
