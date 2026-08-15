begin;

alter table app.partner_coverage_areas add column if not exists state_fips text;
alter table app.partner_coverage_areas add column if not exists county_fips text;
alter table app.partner_coverage_areas add column if not exists county_geoid text;
alter table app.partner_coverage_areas add column if not exists place_geoid text;
alter table app.partner_coverage_areas add column if not exists geography_source text;
alter table app.partner_coverage_areas add column if not exists geography_verified_at timestamptz;

create index if not exists partner_coverage_areas_geoid_idx
  on app.partner_coverage_areas (county_geoid, status, assignment_id)
  where county_geoid is not null;

alter table app.appointments add column if not exists state_fips text;
alter table app.appointments add column if not exists county_fips text;
alter table app.appointments add column if not exists county_geoid text;
alter table app.appointments add column if not exists place_name text;
alter table app.appointments add column if not exists place_geoid text;
alter table app.appointments add column if not exists latitude numeric(10,7);
alter table app.appointments add column if not exists longitude numeric(10,7);
alter table app.appointments add column if not exists geography_source text;
alter table app.appointments add column if not exists geography_verified_at timestamptz;

commit;
