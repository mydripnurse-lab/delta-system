-- 003_tenant_state_files.sql
-- Stores per-tenant state JSON catalogs (source of truth for multi-tenant mode).

create schema if not exists app;

create extension if not exists pgcrypto;

create table if not exists app.organization_state_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  state_slug text not null,
  state_name text not null,
  payload jsonb not null,
  root_domain text null,
  source text not null default 'generator',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_state_files_uq unique (organization_id, state_slug)
);

create index if not exists organization_state_files_org_idx
  on app.organization_state_files (organization_id);

create index if not exists organization_state_files_org_generated_idx
  on app.organization_state_files (organization_id, generated_at desc);

create index if not exists organization_state_files_payload_gin_idx
  on app.organization_state_files using gin (payload);
