-- Delta Control Tower
-- Migration: 007_tenant_staff_and_audit
-- Purpose: Per-tenant staff directory and audit trail

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.organization_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'active',
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_staff_role_ck CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  CONSTRAINT organization_staff_status_ck CHECK (status IN ('active', 'invited', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_staff_org_email_lower_uq
ON app.organization_staff (organization_id, LOWER(email));

CREATE INDEX IF NOT EXISTS organization_staff_org_idx
ON app.organization_staff (organization_id);

CREATE INDEX IF NOT EXISTS organization_staff_org_status_idx
ON app.organization_staff (organization_id, status);

CREATE TRIGGER trg_organization_staff_set_updated_at
BEFORE UPDATE ON app.organization_staff
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.organization_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL DEFAULT 'user',
  actor_user_id UUID REFERENCES app.users(id) ON DELETE SET NULL,
  actor_label TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_audit_logs_actor_type_ck CHECK (actor_type IN ('user', 'system', 'api')),
  CONSTRAINT organization_audit_logs_severity_ck CHECK (severity IN ('info', 'warning', 'critical'))
);

CREATE INDEX IF NOT EXISTS organization_audit_logs_org_created_idx
ON app.organization_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_audit_logs_org_action_idx
ON app.organization_audit_logs (organization_id, action);

COMMIT;
