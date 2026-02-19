alter table app.organization_settings
  add column if not exists ads_alert_webhook_url text,
  add column if not exists ads_alert_sms_enabled boolean not null default false,
  add column if not exists ads_alert_sms_to text;

