-- 004_tenant_logo_url.sql
-- Adds tenant-scoped logo URL to organization settings.

alter table app.organization_settings
  add column if not exists logo_url text;

