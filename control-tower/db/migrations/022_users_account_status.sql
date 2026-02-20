-- Delta Control Tower
-- Migration: 022_users_account_status
-- Purpose: Support explicit active/invited/disabled state for agency accounts

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS account_status TEXT;

UPDATE app.users
SET account_status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END
WHERE account_status IS NULL OR btrim(account_status) = '';

ALTER TABLE app.users
  ALTER COLUMN account_status SET DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_account_status_ck'
  ) THEN
    ALTER TABLE app.users
      ADD CONSTRAINT users_account_status_ck
      CHECK (account_status IN ('active', 'invited', 'disabled'));
  END IF;
END $$;

COMMIT;
