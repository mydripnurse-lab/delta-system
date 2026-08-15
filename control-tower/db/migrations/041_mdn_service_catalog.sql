begin;

create table if not exists app.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  short_description text not null default '',
  full_description text not null default '',
  ingredients text[] not null default array[]::text[],
  benefits text[] not null default array[]::text[],
  medical_disclaimer text not null default '',
  price numeric(12,2) not null default 0,
  currency text not null default 'USD',
  deposit_type text not null default 'percentage',
  deposit_value numeric(12,2) not null default 35,
  image_url text not null default '',
  image_alt text not null default '',
  image_title text not null default '',
  landing_page_url text not null default '',
  survey_cta_url text not null default '',
  editorial_status text not null default 'draft',
  is_active boolean not null default true,
  source_metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (price >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (deposit_type in ('percentage', 'fixed')),
  check (deposit_value >= 0),
  check (deposit_type <> 'percentage' or deposit_value <= 100),
  check (editorial_status in ('draft', 'review', 'approved', 'published', 'archived'))
);

create index if not exists services_organization_status_idx
  on app.services (organization_id, is_active, editorial_status, name);

create table if not exists app.service_calendars (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references app.services(id) on delete cascade,
  public_key text not null unique,
  status text not null default 'draft',
  duration_minutes integer not null default 60,
  slot_interval_minutes integer not null default 30,
  buffer_before_minutes integer not null default 0,
  buffer_after_minutes integer not null default 30,
  minimum_notice_minutes integer not null default 120,
  maximum_advance_days integer not null default 60,
  daily_capacity integer,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (status in ('draft', 'active', 'paused', 'archived')),
  check (duration_minutes between 5 and 1440),
  check (slot_interval_minutes between 5 and 1440),
  check (buffer_before_minutes between 0 and 1440),
  check (buffer_after_minutes between 0 and 1440),
  check (minimum_notice_minutes between 0 and 525600),
  check (maximum_advance_days between 1 and 730),
  check (daily_capacity is null or daily_capacity > 0)
);

create table if not exists app.service_media (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references app.services(id) on delete cascade,
  role text not null default 'hero',
  url text not null,
  mime_type text,
  width integer,
  height integer,
  alt_text text not null default '',
  title_text text not null default '',
  focal_point jsonb not null default '{"x":0.5,"y":0.5}'::jsonb,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('hero', 'card', 'og', 'gallery')),
  check (width is null or width > 0),
  check (height is null or height > 0)
);

create unique index if not exists service_media_primary_role_uq
  on app.service_media (service_id, role)
  where is_primary = true;

create index if not exists service_media_service_idx
  on app.service_media (service_id, role, sort_order);

drop trigger if exists trg_services_set_updated_at on app.services;
create trigger trg_services_set_updated_at
before update on app.services
for each row execute function app.set_updated_at();

drop trigger if exists trg_service_calendars_set_updated_at on app.service_calendars;
create trigger trg_service_calendars_set_updated_at
before update on app.service_calendars
for each row execute function app.set_updated_at();

drop trigger if exists trg_service_media_set_updated_at on app.service_media;
create trigger trg_service_media_set_updated_at
before update on app.service_media
for each row execute function app.set_updated_at();

commit;
