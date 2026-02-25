-- Purpose: Persist UI language preference per user

alter table app.users
  add column if not exists preferred_locale text not null default 'en-US';

update app.users
set preferred_locale = 'en-US'
where preferred_locale is null or btrim(preferred_locale) = '';
