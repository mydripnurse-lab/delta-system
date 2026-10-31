-- Personal portal photos are independent from clinic logos and public nurse photos.
-- Additive only: no changes to roles, appointments, prices or existing images.
begin;
set local lock_timeout = '5s';
alter table app.clinic_accounts add column if not exists profile_photo_url text not null default '';
alter table app.partner_profiles add column if not exists clinic_avatar_url text not null default '';
commit;
