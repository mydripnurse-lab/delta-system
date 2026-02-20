-- Delta Control Tower
-- Migration: 021_users_phone_and_activation_tokens
-- Purpose: Add phone to app.users and activation tokens for invite flows

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS app.user_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT 'staff_invite',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_activation_tokens_token_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS user_activation_tokens_user_idx
ON app.user_activation_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_activation_tokens_expiry_idx
ON app.user_activation_tokens (expires_at);

COMMIT;
