-- Delta Control Tower
-- Migration: 023_users_avatar_url
-- Purpose: Add avatar image url for user profile UI

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMIT;
