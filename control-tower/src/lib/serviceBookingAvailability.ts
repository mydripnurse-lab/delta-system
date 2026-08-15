import { getDbPool } from "@/lib/db";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { BOOKING_MINIMUM_NOTICE_MINUTES } from "@/lib/bookingPolicy";
import {
  resolveCanonicalCountyByName,
  resolveCanonicalGeographyByCoordinates,
  type CanonicalGeography,
} from "@/lib/canonicalGeography";

export type BookingCoverageInput = {
  state: string;
  county: string;
  city: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
};

export type BookingPartnerOption = {
  id: string;
  slug: string;
  displayName: string;
  businessName: string;
  profilePhotoUrl: string;
};

export type BookingAvailabilitySlot = {
  startsAt: string;
  endsAt: string;
  timezone: string;
  partners: BookingPartnerOption[];
};

export type BookingAvailability = {
  calendar: {
    publicKey: string;
    serviceSlug: string;
    serviceName: string;
    durationMinutes: number;
    currency: string;
    price: number;
    depositType: "percentage" | "fixed";
    depositValue: number;
    minimumNoticeMinutes: number;
  };
  geography: Pick<CanonicalGeography,
    | "stateName"
    | "stateCode"
    | "stateFips"
    | "countyName"
    | "countyFips"
    | "countyGeoid"
    | "placeName"
    | "placeGeoid"
    | "source"
    | "confidence"
  >;
  coverageAvailable: boolean;
  slots: BookingAvailabilitySlot[];
};

type AvailabilityRow = {
  public_key: string;
  service_slug: string;
  service_name: string;
  duration_minutes: number;
  currency: string;
  price: string;
  deposit_type: "percentage" | "fixed";
  deposit_value: string;
  minimum_notice_minutes: number;
  eligible_count: number | string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    timezone: string;
    partnerId: string;
    partnerSlug: string;
    displayName: string;
    businessName: string;
    profilePhotoUrl: string;
    loadScore: number;
  }> | null;
};

function normalizeLocation(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipio|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const STATE_CODES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks",
  kentucky: "ky", louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma",
  michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt",
  nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd",
  ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri",
  "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut",
  vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi",
  wyoming: "wy", "district of columbia": "dc", "puerto rico": "pr",
};

function stateCandidates(value: string) {
  const normalized = normalizeLocation(value);
  const code = STATE_CODES[normalized];
  const name = Object.entries(STATE_CODES).find(([, candidate]) => candidate === normalized)?.[0];
  return [...new Set([normalized, code, name].filter(Boolean))] as string[];
}

async function resolveBookingGeography(coverage: BookingCoverageInput) {
  const hasLatitude = Number.isFinite(coverage.latitude);
  const hasLongitude = Number.isFinite(coverage.longitude);
  if (hasLatitude !== hasLongitude) {
    throw new Error("A complete verified location is required to confirm county coverage.");
  }
  if (hasLatitude && hasLongitude) {
    return resolveCanonicalGeographyByCoordinates({
      latitude: Number(coverage.latitude),
      longitude: Number(coverage.longitude),
    });
  }
  const canonical = await resolveCanonicalCountyByName({
    state: coverage.state,
    county: coverage.county,
  });
  if (!canonical) {
    throw new Error("This address could not be matched to an official U.S. county or Puerto Rico municipio.");
  }
  return canonical;
}

export async function loadBookingAvailability(opts: {
  publicKey: string;
  date: string;
  coverage: BookingCoverageInput;
  requestedPartnerId?: string;
}): Promise<BookingAvailability | null> {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  await pool.query(`
    with expired as (
      update app.appointments
         set status = 'failed',
             cancellation_reason = 'Payment hold expired.',
             hold_expires_at = null,
             updated_at = now()
       where status = 'payment_pending'
         and hold_expires_at is not null
         and hold_expires_at <= now()
       returning id
    )
    update app.appointment_payments payment
       set status = 'failed',
           failure_message = 'Payment hold expired.',
           updated_at = now()
      from expired
     where payment.appointment_id = expired.id
       and payment.status in ('pending', 'processing')
  `);
  const geography = await resolveBookingGeography(opts.coverage);
  const states = stateCandidates(geography.stateName);
  const county = normalizeLocation(geography.countyName);
  const result = await pool.query<AvailabilityRow>(
    `with calendar as (
       select c.id, c.public_key, c.duration_minutes, c.slot_interval_minutes,
              c.buffer_before_minutes, c.buffer_after_minutes,
              c.minimum_notice_minutes, c.maximum_advance_days, c.daily_capacity,
              s.id as service_id, s.slug as service_slug, s.name as service_name,
              s.price::text, s.currency, s.deposit_type, s.deposit_value::text
         from app.service_calendars c
         join app.services s on s.id = c.service_id
        where c.public_key = $1
          and c.status = 'active'
          and s.is_active = true
        limit 1
     ), eligible as (
       select distinct a.id as assignment_id, a.partner_profile_id, a.priority_weight,
              p.slug as partner_slug, p.display_name,
              coalesce(p.business_name, '') as business_name,
              coalesce(p.profile_photo_url, '') as profile_photo_url
         from calendar c
         join app.partner_service_assignments a
           on a.service_id = c.service_id and a.status = 'active'
         join app.partner_profiles p
           on p.id = a.partner_profile_id
        where exists (
            select 1
              from app.partner_coverage_areas area
             where area.assignment_id = a.id
               and area.status = 'active'
               and (
                 area.county_geoid = $3
                 or (
                   area.county_geoid is null
                   and lower(trim(regexp_replace(area.state, '[^a-zA-Z0-9]+', ' ', 'g'))) = any($4::text[])
                   and lower(trim(regexp_replace(
                         regexp_replace(area.county, '\\m(county|parish|borough|municipio|municipality|census area)\\M', '', 'gi'),
                         '[^a-zA-Z0-9]+', ' ', 'g'
                       ))) = $5
                 )
               )
          )
          and ($6::uuid is null or a.partner_profile_id = $6::uuid)
     ), recurring_slots as (
       select e.partner_profile_id, e.partner_slug, e.display_name,
              e.business_name, e.profile_photo_url, e.priority_weight,
              r.timezone, slot.starts_at,
              slot.starts_at + make_interval(mins => c.duration_minutes) as ends_at
         from calendar c
         join eligible e on true
         join app.partner_availability_rules r
           on r.partner_profile_id = e.partner_profile_id
          and (r.service_id is null or r.service_id = c.service_id)
          and r.is_active = true
          and r.day_of_week = extract(dow from $2::date)::smallint
          and (r.effective_from is null or r.effective_from <= $2::date)
          and (r.effective_until is null or r.effective_until >= $2::date)
         cross join lateral generate_series(
           (($2::date + r.start_time) at time zone r.timezone),
           (($2::date + r.end_time) at time zone r.timezone) - make_interval(mins => c.duration_minutes),
           make_interval(mins => c.slot_interval_minutes)
         ) as slot(starts_at)
     ), added_slots as (
       select e.partner_profile_id, e.partner_slug, e.display_name,
              e.business_name, e.profile_photo_url, e.priority_weight,
              coalesce(r.timezone, 'America/New_York') as timezone,
              x.starts_at, x.ends_at
         from calendar c
         join eligible e on true
         join app.partner_availability_exceptions x
           on x.partner_profile_id = e.partner_profile_id
          and (x.service_id is null or x.service_id = c.service_id)
          and x.kind = 'available'
          and (x.starts_at at time zone coalesce(
                (select ar.timezone
                   from app.partner_availability_rules ar
                  where ar.partner_profile_id = e.partner_profile_id
                  order by (ar.service_id = c.service_id) desc nulls last
                  limit 1),
                'America/New_York'
              ))::date = $2::date
         left join lateral (
           select ar.timezone
             from app.partner_availability_rules ar
            where ar.partner_profile_id = e.partner_profile_id
            order by (ar.service_id = c.service_id) desc nulls last
            limit 1
         ) r on true
     ), candidate_slots as (
       select * from recurring_slots
       union
       select * from added_slots
     ), open_slots as (
       select distinct cs.*,
              (
                select count(*)::numeric / cs.priority_weight
                  from app.appointments load
                 where load.partner_profile_id = cs.partner_profile_id
                   and load.status in ('confirmed', 'partner_acknowledged', 'in_progress', 'completed')
                   and load.starts_at >= now() - interval '30 days'
                   and load.starts_at < now() + interval '30 days'
              ) as load_score
         from candidate_slots cs
         join calendar c on true
        where cs.starts_at >= now() + make_interval(mins => greatest(c.minimum_notice_minutes, ${BOOKING_MINIMUM_NOTICE_MINUTES}))
          and cs.starts_at < now() + make_interval(days => c.maximum_advance_days)
          and not exists (
            select 1
              from app.partner_availability_exceptions x
             where x.partner_profile_id = cs.partner_profile_id
               and (x.service_id is null or x.service_id = c.service_id)
               and x.kind = 'unavailable'
               and x.starts_at < cs.ends_at
               and x.ends_at > cs.starts_at
          )
          and not exists (
            select 1
              from app.appointments booked
             where booked.partner_profile_id = cs.partner_profile_id
               and booked.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress')
               and (booked.status <> 'payment_pending' or booked.hold_expires_at is null or booked.hold_expires_at > now())
               and booked.starts_at < cs.ends_at + make_interval(mins => c.buffer_after_minutes)
               and booked.ends_at > cs.starts_at - make_interval(mins => c.buffer_before_minutes)
          )
          and (
            c.daily_capacity is null
            or (
              select count(*)
                from app.appointments daily
               where daily.service_calendar_id = c.id
                 and daily.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress', 'completed')
                 and (daily.status <> 'payment_pending' or daily.hold_expires_at is null or daily.hold_expires_at > now())
                 and (daily.starts_at at time zone cs.timezone)::date = $2::date
            ) < c.daily_capacity
          )
     )
       select c.public_key, c.service_slug, c.service_name, c.duration_minutes,
            c.currency, c.price, c.deposit_type, c.deposit_value,
            c.minimum_notice_minutes,
            (select count(*) from eligible)::int as eligible_count,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'startsAt', os.starts_at,
                  'endsAt', os.ends_at,
                  'timezone', os.timezone,
                  'partnerId', os.partner_profile_id,
                  'partnerSlug', os.partner_slug,
                  'displayName', os.display_name,
                  'businessName', os.business_name,
                  'profilePhotoUrl', os.profile_photo_url,
                  'loadScore', os.load_score
                ) order by os.starts_at, os.load_score, os.display_name
              ) filter (where os.partner_profile_id is not null),
              '[]'::jsonb
            ) as slots
       from calendar c
       left join open_slots os on true
      group by c.public_key, c.service_slug, c.service_name, c.duration_minutes,
               c.currency, c.price, c.deposit_type, c.deposit_value,
               c.minimum_notice_minutes`,
    [opts.publicKey, opts.date, geography.countyGeoid, states, county, opts.requestedPartnerId || null],
  );
  const row = result.rows[0];
  if (!row) return null;

  const grouped = new Map<string, BookingAvailabilitySlot>();
  for (const slot of row.slots || []) {
    const startsAt = new Date(slot.startsAt).toISOString();
    const endsAt = new Date(slot.endsAt).toISOString();
    const key = `${startsAt}:${endsAt}:${slot.timezone}`;
    const current = grouped.get(key) || { startsAt, endsAt, timezone: slot.timezone, partners: [] };
    current.partners.push({
      id: slot.partnerId,
      slug: slot.partnerSlug,
      displayName: slot.displayName,
      businessName: slot.businessName,
      profilePhotoUrl: slot.profilePhotoUrl,
    });
    grouped.set(key, current);
  }

  return {
    calendar: {
      publicKey: row.public_key,
      serviceSlug: row.service_slug,
      serviceName: row.service_name,
      durationMinutes: row.duration_minutes,
      currency: row.currency,
      price: number(row.price),
      depositType: row.deposit_type,
      depositValue: number(row.deposit_value),
      minimumNoticeMinutes: Math.max(row.minimum_notice_minutes, BOOKING_MINIMUM_NOTICE_MINUTES),
    },
    geography: {
      stateName: geography.stateName,
      stateCode: geography.stateCode,
      stateFips: geography.stateFips,
      countyName: geography.countyName,
      countyFips: geography.countyFips,
      countyGeoid: geography.countyGeoid,
      placeName: geography.placeName,
      placeGeoid: geography.placeGeoid,
      source: geography.source,
      confidence: geography.confidence,
    },
    coverageAvailable: number(row.eligible_count) > 0,
    slots: [...grouped.values()],
  };
}
