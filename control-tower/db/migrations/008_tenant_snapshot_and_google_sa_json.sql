BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.organization_settings
  ADD COLUMN IF NOT EXISTS snapshot_id TEXT,
  ADD COLUMN IF NOT EXISTS google_service_account_json JSONB;

COMMIT;
