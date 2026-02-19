alter table app.organization_settings
  add column if not exists ads_alerts_enabled boolean not null default true;

