begin;
-- Ownership alone never makes someone a bookable nurse. Explicit opt-in only.
alter table app.clinic_memberships add column if not exists owner_practice_enabled boolean not null default false;
commit;
