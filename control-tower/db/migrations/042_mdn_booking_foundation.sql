begin;

create table if not exists app.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  application_id uuid not null unique references app.staff_applications(id) on delete cascade,
  ghl_user_id text not null default '',
  email text not null,
  slug text not null,
  display_name text not null,
  business_name text,
  public_title text,
  professional_credentials text,
  biography text,
  profile_photo_url text,
  profile_photo_file_id text,
  profile_photo_location_id text,
  primary_location_id text,
  group_calendar_id text,
  group_calendar_slug text,
  group_calendar_url text,
  services jsonb not null default '[]'::jsonb,
  service_areas jsonb not null default '[]'::jsonb,
  website_status text not null default 'draft',
  ghl_photo_sync_status text not null default 'pending',
  ghl_photo_synced_at timestamptz,
  ghl_photo_sync_error text,
  profile_consent_at timestamptz,
  affiliate_code text,
  portal_password_hash text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  check (website_status in ('draft', 'ready', 'published', 'hidden')),
  check (ghl_photo_sync_status in ('pending', 'syncing', 'synced', 'failed'))
);

alter table app.partner_profiles
  add column if not exists group_calendar_id text,
  add column if not exists group_calendar_slug text,
  add column if not exists group_calendar_url text,
  add column if not exists services jsonb not null default '[]'::jsonb,
  add column if not exists service_areas jsonb not null default '[]'::jsonb,
  add column if not exists affiliate_code text,
  add column if not exists portal_password_hash text;

update app.partner_profiles
   set affiliate_code = slug
 where affiliate_code is null;

create index if not exists partner_profiles_organization_status_idx
  on app.partner_profiles (organization_id, website_status, updated_at desc);

create index if not exists partner_profiles_ghl_user_idx
  on app.partner_profiles (ghl_user_id);

create unique index if not exists partner_profiles_affiliate_code_uq
  on app.partner_profiles (organization_id, affiliate_code)
  where affiliate_code is not null;

create table if not exists app.partner_service_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
  service_id uuid not null references app.services(id) on delete cascade,
  status text not null default 'active',
  price_override numeric(12,2),
  priority_weight numeric(8,4) not null default 1,
  activated_at timestamptz,
  deactivated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_profile_id, service_id),
  check (status in ('active', 'paused', 'revoked')),
  check (price_override is null or price_override >= 0),
  check (priority_weight > 0)
);

create index if not exists partner_service_assignments_service_status_idx
  on app.partner_service_assignments (organization_id, service_id, status, partner_profile_id);

create table if not exists app.partner_coverage_areas (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references app.partner_service_assignments(id) on delete cascade,
  state text not null,
  county text not null,
  city text,
  postal_codes text[] not null default array[]::text[],
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('active', 'paused'))
);

create unique index if not exists partner_coverage_areas_scope_uq
  on app.partner_coverage_areas (
    assignment_id,
    lower(state),
    lower(county),
    lower(coalesce(city, ''))
  );

create index if not exists partner_coverage_areas_lookup_idx
  on app.partner_coverage_areas (lower(state), lower(county), lower(coalesce(city, '')), status);

create table if not exists app.partner_availability_rules (
  id uuid primary key default gen_random_uuid(),
  partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
  service_id uuid references app.services(id) on delete cascade,
  timezone text not null default 'America/New_York',
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  effective_from date,
  effective_until date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (day_of_week between 0 and 6),
  check (start_time < end_time),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create index if not exists partner_availability_rules_lookup_idx
  on app.partner_availability_rules (partner_profile_id, service_id, day_of_week, is_active);

create table if not exists app.partner_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
  service_id uuid references app.services(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  kind text not null default 'unavailable',
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (kind in ('available', 'unavailable'))
);

create index if not exists partner_availability_exceptions_lookup_idx
  on app.partner_availability_exceptions (partner_profile_id, starts_at, ends_at);

create table if not exists app.booking_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  normalized_email text not null default '',
  normalized_phone text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalized_email <> '' or normalized_phone <> '')
);

create unique index if not exists booking_customers_email_uq
  on app.booking_customers (organization_id, normalized_email)
  where normalized_email <> '';

create unique index if not exists booking_customers_phone_uq
  on app.booking_customers (organization_id, normalized_phone)
  where normalized_phone <> '';

create table if not exists app.appointments (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  organization_id uuid not null references app.organizations(id) on delete cascade,
  service_id uuid not null references app.services(id) on delete restrict,
  service_calendar_id uuid not null references app.service_calendars(id) on delete restrict,
  partner_profile_id uuid references app.partner_profiles(id) on delete set null,
  customer_id uuid not null references app.booking_customers(id) on delete restrict,
  status text not null default 'payment_pending',
  selection_mode text not null default 'balanced',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  address_line_1 text not null,
  address_line_2 text not null default '',
  city text not null,
  county text not null,
  state text not null,
  postal_code text not null,
  country_code text not null default 'US',
  source_url text not null default '',
  source_city text not null default '',
  source_county text not null default '',
  source_state text not null default '',
  service_price numeric(12,2) not null,
  deposit_type text not null,
  deposit_value numeric(12,2) not null,
  deposit_amount numeric(12,2) not null,
  currency text not null default 'USD',
  cancellation_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in (
    'payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress',
    'completed', 'cancelled', 'refunded', 'failed'
  )),
  check (selection_mode in ('returning_partner', 'customer_selected', 'balanced', 'admin_assigned')),
  check (ends_at > starts_at),
  check (service_price >= 0),
  check (deposit_type in ('percentage', 'fixed')),
  check (deposit_value >= 0),
  check (deposit_amount >= 0),
  check (currency ~ '^[A-Z]{3}$'),
  check (country_code ~ '^[A-Z]{2}$')
);

create index if not exists appointments_calendar_time_idx
  on app.appointments (service_calendar_id, starts_at, status);

create index if not exists appointments_partner_time_idx
  on app.appointments (partner_profile_id, starts_at, status)
  where partner_profile_id is not null;

create index if not exists appointments_customer_history_idx
  on app.appointments (customer_id, service_id, completed_at desc)
  where status = 'completed';

create table if not exists app.appointment_payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references app.appointments(id) on delete cascade,
  provider text not null default 'stripe',
  status text not null default 'pending',
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  checkout_session_id text,
  payment_intent_id text,
  charge_id text,
  refund_id text,
  failure_code text not null default '',
  failure_message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'processing', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  check (amount >= 0),
  check (currency ~ '^[A-Z]{3}$')
);

create unique index if not exists appointment_payments_checkout_session_uq
  on app.appointment_payments (checkout_session_id)
  where checkout_session_id is not null;

create unique index if not exists appointment_payments_intent_uq
  on app.appointment_payments (payment_intent_id)
  where payment_intent_id is not null;

create table if not exists app.customer_partner_affinities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  customer_id uuid not null references app.booking_customers(id) on delete cascade,
  partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
  successful_appointments integer not null default 0,
  last_completed_at timestamptz,
  status text not null default 'preferred',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, partner_profile_id),
  check (successful_appointments >= 0),
  check (status in ('preferred', 'neutral', 'blocked'))
);

create index if not exists customer_partner_affinities_lookup_idx
  on app.customer_partner_affinities (customer_id, status, last_completed_at desc);

create table if not exists app.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references app.appointments(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (actor_type in ('system', 'admin', 'partner', 'customer', 'stripe', 'webhook'))
);

create index if not exists appointment_events_appointment_idx
  on app.appointment_events (appointment_id, created_at);

drop trigger if exists trg_partner_service_assignments_set_updated_at on app.partner_service_assignments;
create trigger trg_partner_service_assignments_set_updated_at
before update on app.partner_service_assignments
for each row execute function app.set_updated_at();

drop trigger if exists trg_partner_coverage_areas_set_updated_at on app.partner_coverage_areas;
create trigger trg_partner_coverage_areas_set_updated_at
before update on app.partner_coverage_areas
for each row execute function app.set_updated_at();

drop trigger if exists trg_partner_availability_rules_set_updated_at on app.partner_availability_rules;
create trigger trg_partner_availability_rules_set_updated_at
before update on app.partner_availability_rules
for each row execute function app.set_updated_at();

drop trigger if exists trg_partner_availability_exceptions_set_updated_at on app.partner_availability_exceptions;
create trigger trg_partner_availability_exceptions_set_updated_at
before update on app.partner_availability_exceptions
for each row execute function app.set_updated_at();

drop trigger if exists trg_booking_customers_set_updated_at on app.booking_customers;
create trigger trg_booking_customers_set_updated_at
before update on app.booking_customers
for each row execute function app.set_updated_at();

drop trigger if exists trg_appointments_set_updated_at on app.appointments;
create trigger trg_appointments_set_updated_at
before update on app.appointments
for each row execute function app.set_updated_at();

drop trigger if exists trg_appointment_payments_set_updated_at on app.appointment_payments;
create trigger trg_appointment_payments_set_updated_at
before update on app.appointment_payments
for each row execute function app.set_updated_at();

drop trigger if exists trg_customer_partner_affinities_set_updated_at on app.customer_partner_affinities;
create trigger trg_customer_partner_affinities_set_updated_at
before update on app.customer_partner_affinities
for each row execute function app.set_updated_at();

commit;
