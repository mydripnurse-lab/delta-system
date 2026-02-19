alter table app.organization_settings
  add column if not exists cloudflare_api_token text;

