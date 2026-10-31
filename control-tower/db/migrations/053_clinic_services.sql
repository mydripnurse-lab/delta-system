begin;
alter table app.clinic_service_prices add column if not exists availability_status text not null default 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='app.clinic_service_prices'::regclass and conname='clinic_service_availability_check') then
    alter table app.clinic_service_prices add constraint clinic_service_availability_check check (availability_status in ('active','paused','out_of_stock'));
  end if;
end $$;
create table if not exists app.clinic_service_suggestions (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references app.clinics(id) on delete cascade,
 submitted_by text not null,
 suggestion_type text not null check (suggestion_type in ('service','recipe','other')),
 name text not null,
 ingredients text[] not null default '{}',
 details text not null default '',
 status text not null default 'pending' check (status in ('pending','reviewing','approved','declined')),
 created_at timestamptz not null default now()
);
create index if not exists clinic_service_suggestions_created_idx on app.clinic_service_suggestions(created_at desc);
create index if not exists clinic_service_suggestions_clinic_idx on app.clinic_service_suggestions(clinic_id,created_at desc);
commit;
