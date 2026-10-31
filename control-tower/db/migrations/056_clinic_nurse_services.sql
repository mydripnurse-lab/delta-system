begin;
-- NULL preserves legacy all-services memberships. An explicit empty array offers none.
-- Selections are scoped to the clinic; independent nurse assignments remain unchanged.
alter table app.clinic_memberships add column if not exists service_ids uuid[];
commit;
