alter table app.organization_settings
  add column if not exists cloudflare_cname_target text;

