begin;

alter table app.appointments
  add column if not exists hold_expires_at timestamptz;

create unique index if not exists appointments_partner_start_active_uq
  on app.appointments (partner_profile_id, starts_at)
  where partner_profile_id is not null
    and status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress');

create table if not exists app.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'processing',
  error text not null default '',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status in ('processing', 'processed', 'ignored', 'failed'))
);

create table if not exists app.booking_demand_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  service_id uuid not null references app.services(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  city text not null,
  county text not null,
  state text not null,
  postal_code text not null default '',
  source_url text not null default '',
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('new', 'reviewing', 'notified', 'covered', 'closed'))
);

create index if not exists booking_demand_requests_market_idx
  on app.booking_demand_requests (state, county, city, service_id, status, created_at desc);

drop trigger if exists trg_booking_demand_requests_set_updated_at on app.booking_demand_requests;
create trigger trg_booking_demand_requests_set_updated_at
before update on app.booking_demand_requests
for each row execute function app.set_updated_at();

commit;
