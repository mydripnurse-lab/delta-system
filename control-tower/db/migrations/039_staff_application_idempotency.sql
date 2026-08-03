begin;

alter table app.staff_applications
  add column if not exists submission_key text;

create unique index if not exists staff_applications_org_submission_key_uq
  on app.staff_applications (organization_id, submission_key)
  where submission_key is not null;

commit;
