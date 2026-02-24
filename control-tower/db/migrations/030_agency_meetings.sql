-- Delta Control Tower
-- Migration: 030_agency_meetings
-- Purpose: Persist agency meetings so links are shared across devices/users

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.agency_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  starts_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 45,
  room_slug TEXT NOT NULL,
  created_by_user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_meetings_duration_ck CHECK (duration_minutes >= 15 AND duration_minutes <= 180),
  CONSTRAINT agency_meetings_room_slug_uq UNIQUE (room_slug)
);

CREATE INDEX IF NOT EXISTS agency_meetings_created_at_idx
ON app.agency_meetings (created_at DESC);

CREATE TRIGGER trg_agency_meetings_set_updated_at
BEFORE UPDATE ON app.agency_meetings
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;
