begin;
-- Nursing remains independent of administrative access. No existing grant changes.
alter table app.clinic_memberships add column if not exists can_manage_clinic boolean not null default false;
create index if not exists clinic_team_page_idx on app.clinic_memberships(clinic_id,created_at desc,id);
commit;
