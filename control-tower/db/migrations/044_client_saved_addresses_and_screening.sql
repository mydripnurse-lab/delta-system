alter table app.client_auth_tokens
  add column if not exists redirect_to text not null default '';

create table if not exists app.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references app.client_accounts(id) on delete cascade,
  label text not null default 'Home',
  address_line_1 text not null,
  address_line_2 text not null default '',
  city text not null,
  county text not null,
  state text not null,
  postal_code text not null,
  country_code text not null default 'US',
  mapbox_feature_id text not null,
  verified_label text not null,
  longitude double precision not null,
  latitude double precision not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_addresses_account_idx
  on app.client_addresses (client_account_id, is_default desc, created_at asc);

create unique index if not exists client_addresses_one_default_idx
  on app.client_addresses (client_account_id) where is_default;
