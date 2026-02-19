-- Delta Control Tower
-- Migration: 020_staff_phone_required_at_api
-- Purpose: Add phone field to tenant staff records

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.organization_staff
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMIT;

