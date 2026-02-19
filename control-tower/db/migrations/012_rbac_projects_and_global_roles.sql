-- Delta Control Tower
-- Migration: 012_rbac_projects_and_global_roles
-- Purpose: Extend RBAC roles, add project assignments, and global user roles

BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET search_path TO app, public;

ALTER TABLE app.organization_memberships
  DROP CONSTRAINT IF EXISTS organization_memberships_role_ck;

ALTER TABLE app.organization_memberships
  ADD CONSTRAINT organization_memberships_role_ck
  CHECK (
    role IN (
      'owner',
      'admin',
      'analyst',
      'viewer',
      'agency_admin',
      'tenant_admin',
      'project_manager',
      'analytics',
      'member'
    )
  );

ALTER TABLE app.organization_staff
  DROP CONSTRAINT IF EXISTS organization_staff_role_ck;

ALTER TABLE app.organization_staff
  ADD CONSTRAINT organization_staff_role_ck
  CHECK (
    role IN (
      'owner',
      'admin',
      'analyst',
      'viewer',
      'agency_admin',
      'tenant_admin',
      'project_manager',
      'analytics',
      'member'
    )
  );

CREATE TABLE IF NOT EXISTS app.user_global_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_global_roles_role_ck CHECK (role IN ('platform_admin', 'agency_admin', 'analytics')),
  CONSTRAINT user_global_roles_user_role_uq UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS user_global_roles_user_idx
ON app.user_global_roles (user_id);

CREATE TABLE IF NOT EXISTS app.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_status_ck CHECK (status IN ('active', 'archived', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_org_slug_lower_uq
ON app.projects (organization_id, LOWER(slug));

CREATE INDEX IF NOT EXISTS projects_org_idx
ON app.projects (organization_id);

CREATE TRIGGER trg_projects_set_updated_at
BEFORE UPDATE ON app.projects
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TABLE IF NOT EXISTS app.project_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_memberships_role_ck CHECK (role IN ('tenant_admin', 'project_manager', 'analytics', 'member')),
  CONSTRAINT project_memberships_status_ck CHECK (status IN ('active', 'invited', 'disabled')),
  CONSTRAINT project_memberships_project_user_uq UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_memberships_project_idx
ON app.project_memberships (project_id);

CREATE INDEX IF NOT EXISTS project_memberships_org_idx
ON app.project_memberships (organization_id);

CREATE INDEX IF NOT EXISTS project_memberships_user_idx
ON app.project_memberships (user_id);

CREATE TRIGGER trg_project_memberships_set_updated_at
BEFORE UPDATE ON app.project_memberships
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;

