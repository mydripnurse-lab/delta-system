begin;

insert into app.staff_application_location_steps (
  application_id,
  location_id,
  state,
  county
)
select
  application.id,
  trim(county->>'locationId'),
  trim(county->>'state'),
  trim(county->>'county')
from app.staff_applications application
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(application.request_payload->'counties') = 'array'
      then application.request_payload->'counties'
    else '[]'::jsonb
  end
) as county
where nullif(trim(county->>'locationId'), '') is not null
  and nullif(trim(county->>'state'), '') is not null
  and nullif(trim(county->>'county'), '') is not null
on conflict (application_id, location_id) do nothing;

commit;
