begin;
-- Internal activity only. No historical backfill, cron, or external delivery.
-- Keep the existing nurse inbox schema available without running DDL on reads.
create table if not exists app.partner_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
  appointment_id uuid references app.appointments(id) on delete cascade,
  event_key text not null,
  event_type text not null,
  title text not null,
  message text not null,
  action_url text not null default '/partner-portal',
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(partner_profile_id,event_key)
);
create index if not exists partner_portal_notifications_inbox_idx on app.partner_portal_notifications(partner_profile_id,read_at,created_at desc);
alter table app.appointments add column if not exists partner_decline_reason text not null default '', add column if not exists declined_at timestamptz;
create table if not exists app.clinic_portal_notifications (
  id bigserial primary key,
  clinic_id uuid not null references app.clinics(id) on delete cascade,
  appointment_id uuid not null references app.appointments(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);
create index if not exists clinic_portal_notifications_feed_idx on app.clinic_portal_notifications(clinic_id,id desc);
create index if not exists clinic_portal_notifications_appointment_idx on app.clinic_portal_notifications(appointment_id);
create table if not exists app.clinic_notification_reads (
  notification_id bigint not null references app.clinic_portal_notifications(id) on delete cascade,
  email text not null,
  read_at timestamptz not null default now(),
  primary key(notification_id,email)
);
create index if not exists appointments_clinic_schedule_idx on app.appointments(clinic_id,starts_at,id) where clinic_id is not null;
create index if not exists appointments_clinic_staff_schedule_idx on app.appointments(clinic_id,partner_profile_id,starts_at,id) where clinic_id is not null;
create index if not exists clinic_memberships_staff_page_idx on app.clinic_memberships(clinic_id,partner_profile_id) where role='nurse';

create or replace function app.capture_clinic_appointment_notification() returns trigger language plpgsql as $$
declare kind text;
begin
  if new.clinic_id is null then return new; end if;
  if TG_OP='INSERT' then kind := 'appointment_created';
  elsif new.clinic_id is distinct from old.clinic_id then kind := 'appointment_created';
  elsif new.partner_profile_id is distinct from old.partner_profile_id then kind := 'appointment_reassigned';
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then kind := 'appointment_rescheduled';
  elsif new.status is distinct from old.status then kind := 'appointment_' || new.status;
  else return new;
  end if;
  insert into app.clinic_portal_notifications(clinic_id,appointment_id,event_type) values(new.clinic_id,new.id,kind);
  return new;
end $$;
drop trigger if exists clinic_appointment_notification on app.appointments;
create trigger clinic_appointment_notification after insert or update on app.appointments for each row execute function app.capture_clinic_appointment_notification();

create or replace function app.capture_clinic_appointment_alert() returns trigger language plpgsql as $$
begin
  if new.event_type in ('partner_declined','deposit_refund_failed') then
    insert into app.clinic_portal_notifications(clinic_id,appointment_id,event_type)
    select a.clinic_id,a.id,new.event_type from app.appointments a where a.id=new.appointment_id and a.clinic_id is not null;
  end if;
  return new;
end $$;
drop trigger if exists clinic_appointment_alert on app.appointment_events;
create trigger clinic_appointment_alert after insert on app.appointment_events for each row execute function app.capture_clinic_appointment_alert();
commit;
