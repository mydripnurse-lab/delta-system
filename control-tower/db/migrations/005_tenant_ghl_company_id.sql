BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.organization_settings
ADD COLUMN IF NOT EXISTS ghl_company_id TEXT;

COMMIT;
