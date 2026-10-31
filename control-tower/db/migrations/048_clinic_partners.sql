-- Additive migration. Apply explicitly; never run DDL on public requests.
begin;
create table if not exists app.clinics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  description text not null default '',
  logo_url text not null default '',
  primary_color text not null default '#084f5e',
  accent_color text not null default '#e9f3f7',
  contact_email text not null,
  contact_phone text not null default '',
  coverage jsonb not null default '[]',
  published boolean not null default false,
  approved_by uuid references app.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clinics_public_idx on app.clinics (name,id) where status='approved' and published;
create table if not exists app.clinic_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email=lower(email)),
  full_name text not null,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists app.clinic_sessions (
  token_hash text primary key,
  account_id uuid not null references app.clinic_accounts(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists clinic_sessions_account_idx on app.clinic_sessions(account_id);
create table if not exists app.clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references app.clinics(id),
  email text not null check (email=lower(email)),
  role text not null check (role in ('owner','manager','nurse')),
  status text not null default 'invited' check (status in ('invited','pending','active','suspended','removed')),
  partner_profile_id uuid references app.partner_profiles(id),
  coverage jsonb not null default '[]',
  invite_hash text unique,
  invite_expires_at timestamptz,
  accepted_at timestamptz,
  authorized_by text,
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id,email),
  check (role <> 'nurse' or status <> 'active' or partner_profile_id is not null)
);
create index if not exists clinic_memberships_email_idx on app.clinic_memberships(email,status);
create index if not exists clinic_memberships_profile_idx on app.clinic_memberships(partner_profile_id,clinic_id) where status='active';
create table if not exists app.clinic_service_prices (
  clinic_id uuid not null references app.clinics(id),
  service_id uuid not null references app.services(id),
  enabled boolean not null default true,
  price numeric(12,2) check (price >= 0 and price <= 1000000),
  regional_prices jsonb not null default '[]',
  updated_by uuid references app.users(id),
  updated_at timestamptz not null default now(),
  primary key (clinic_id,service_id)
);
create index if not exists clinic_service_prices_service_idx on app.clinic_service_prices(service_id,clinic_id);
create table if not exists app.clinic_audit (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references app.clinics(id),
  actor text not null, action text not null, subject_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists clinic_audit_history_idx on app.clinic_audit(clinic_id,created_at desc);
-- Separate approval authority without changing existing independent partners.
alter table app.partner_profiles add column if not exists clinic_managed boolean not null default false;
alter table app.appointments add column if not exists clinic_id uuid references app.clinics(id);
create index if not exists appointments_clinic_idx on app.appointments(clinic_id,starts_at desc) where clinic_id is not null;

commit;
