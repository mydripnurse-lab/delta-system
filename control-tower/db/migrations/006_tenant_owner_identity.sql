-- Delta Control Tower
-- Migration: 006_tenant_owner_identity
-- Purpose: Add owner identity fields to tenant settings

BEGIN;

ALTER TABLE app.organization_settings
  ADD COLUMN IF NOT EXISTS owner_first_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_last_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_email TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone TEXT;

COMMIT;
