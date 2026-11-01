begin;
-- Website-only appearance. Existing portal branding and business data remain unchanged.
alter table app.clinics add column if not exists website_settings jsonb not null default '{}'::jsonb;
commit;
