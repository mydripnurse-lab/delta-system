-- Delta Control Tower
-- Migration: 031_agency_meetings_security
-- Purpose: Add host-key and room security defaults for zero-cost hardening

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.agency_meetings
  ADD COLUMN IF NOT EXISTS host_key TEXT,
  ADD COLUMN IF NOT EXISTS room_passcode TEXT,
  ADD COLUMN IF NOT EXISTS lobby_enabled BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE app.agency_meetings
SET host_key = substr(encode(gen_random_bytes(16), 'hex'), 1, 24)
WHERE coalesce(host_key, '') = '';

UPDATE app.agency_meetings
SET room_passcode = lpad(((100000 + floor(random() * 900000))::int)::text, 6, '0')
WHERE coalesce(room_passcode, '') = '';

ALTER TABLE app.agency_meetings
  ALTER COLUMN host_key SET NOT NULL,
  ALTER COLUMN room_passcode SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agency_meetings_host_key_uq
ON app.agency_meetings (host_key);

COMMIT;
