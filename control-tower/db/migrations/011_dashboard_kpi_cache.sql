-- Delta Control Tower
-- Migration: 011_dashboard_kpi_cache
-- Purpose: Range-scoped KPI cache for fast dashboard reads in serverless/runtime-cold starts

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.dashboard_kpi_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  integration_key TEXT NOT NULL DEFAULT 'owner',
  range_start TIMESTAMPTZ NOT NULL,
  range_end TIMESTAMPTZ NOT NULL,
  preset TEXT NOT NULL DEFAULT '',
  compare_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_kpi_cache_unique
    UNIQUE (organization_id, module, integration_key, range_start, range_end, preset, compare_enabled)
);

CREATE INDEX IF NOT EXISTS dashboard_kpi_cache_lookup_idx
ON app.dashboard_kpi_cache (organization_id, module, integration_key, range_start, range_end, preset, compare_enabled);

CREATE INDEX IF NOT EXISTS dashboard_kpi_cache_captured_idx
ON app.dashboard_kpi_cache (organization_id, module, captured_at DESC);

CREATE INDEX IF NOT EXISTS dashboard_kpi_cache_expires_idx
ON app.dashboard_kpi_cache (expires_at);

CREATE TRIGGER trg_dashboard_kpi_cache_set_updated_at
BEFORE UPDATE ON app.dashboard_kpi_cache
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;
