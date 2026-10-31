begin;
alter table app.staff_form_configs add column if not exists clinic_communication_routes jsonb not null default '{}'::jsonb;
create table if not exists app.clinic_communication_events (
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references app.clinics(id),
 event_key text not null unique,
 event_type text not null,
 subject_id text,
 payload jsonb not null default '{}'::jsonb,
 dispatched_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists clinic_communication_events_clinic_idx on app.clinic_communication_events(clinic_id,created_at desc);
create table if not exists app.clinic_communication_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references app.clinic_communication_events(id),
 role text not null check(role in ('clinic','clinic_nurse','clinic_client')),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','not_configured')),
 attempts integer not null default 0,
 http_status integer,
 updated_at timestamptz not null default now(),
 unique(event_id,role)
);
create index if not exists clinic_communication_delivery_pending_idx on app.clinic_communication_deliveries(updated_at) where status in ('pending','failed','not_configured');
-- Capture lifecycle events atomically with the existing audit transaction; no polling or network calls.
create or replace function app.enqueue_clinic_communication() returns trigger language plpgsql as $$
begin
 if new.action in ('clinic_registered','clinic_approved','clinic_suspended','clinic_pending','clinic_published','clinic_unpublished','invitation_accepted','member_active','member_suspended','member_removed') then
   insert into app.clinic_communication_events(clinic_id,event_key,event_type,subject_id)
   values(new.clinic_id,'audit:'||new.id::text,new.action,new.subject_id) on conflict(event_key) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists clinic_communication_audit on app.clinic_audit;
create trigger clinic_communication_audit after insert on app.clinic_audit for each row execute function app.enqueue_clinic_communication();
commit;
