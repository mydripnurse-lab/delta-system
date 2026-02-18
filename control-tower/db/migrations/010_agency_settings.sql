-- Delta Control Tower
-- Migration: 010_agency_settings
-- Purpose: Persist agency-level UI preferences (projects filters, compare flags, etc.)

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.agency_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_settings_setting_key_uq UNIQUE (setting_key)
);

CREATE TRIGGER trg_agency_settings_set_updated_at
BEFORE UPDATE ON app.agency_settings
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;
