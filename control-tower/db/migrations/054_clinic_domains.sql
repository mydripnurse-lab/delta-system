begin;
create table if not exists app.clinic_domains (
 clinic_id uuid primary key references app.clinics(id) on delete cascade,
 hostname text not null unique check (hostname = lower(hostname) and length(hostname) <= 253),
 verification_token text not null,
 status text not null default 'pending' check (status in ('pending','active','disconnecting')),
 provider_attached boolean not null default false,
 dns_records jsonb not null default '[]'::jsonb,
 last_checked_at timestamptz,
 verified_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
commit;
