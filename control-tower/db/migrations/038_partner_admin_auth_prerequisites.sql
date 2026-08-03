-- Delta Control Tower
-- Migration: 038_partner_admin_auth_prerequisites
-- Purpose: Install only the user authentication and global-role pieces required
--          by the protected partner administration workspace.

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS account_status TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en-US';

UPDATE app.users
SET account_status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
WHERE account_status IS NULL OR btrim(account_status) = '';

UPDATE app.users
SET preferred_locale = 'en-US'
WHERE preferred_locale IS NULL OR btrim(preferred_locale) = '';

ALTER TABLE app.users
  ALTER COLUMN account_status SET DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'app'
      AND c.conname = 'users_account_status_ck'
  ) THEN
    ALTER TABLE app.users
      ADD CONSTRAINT users_account_status_ck
      CHECK (account_status IN ('active', 'invited', 'disabled'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.user_global_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_global_roles_role_ck
    CHECK (role IN ('platform_admin', 'agency_admin', 'analytics')),
  CONSTRAINT user_global_roles_user_role_uq UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_global_roles_user_idx
ON app.user_global_roles (user_id);

COMMIT;
