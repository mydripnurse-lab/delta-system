import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type PartnerDirectoryMetrics = {
  range: { startDate: string; endDate: string; days: number };
  metrics: {
    impressions: number;
    profileClicks: number;
    bookingClicks: number;
    bookings: number;
    clickThroughRate: number;
    bookingConversionRate: number;
  };
  trend: Array<{ date: string; impressions: number; profileClicks: number; bookingClicks: number; bookings: number }>;
};

export type PartnerDirectoryAdminAnalytics = {
  days: 7 | 30 | 90;
  summary: {
    impressions: number;
    profileClicks: number;
    bookingClicks: number;
    clickThroughRate: number;
    profileToBookingRate: number;
    visiblePartners: number;
    totalPartners: number;
  };
  previous: {
    impressions: number;
    profileClicks: number;
    bookingClicks: number;
    clickThroughRate: number;
  };
  change: {
    impressions: number | null;
    profileClicks: number | null;
    bookingClicks: number | null;
    clickThroughRate: number;
  };
  trend: Array<{ date: string; impressions: number; profileClicks: number; bookingClicks: number }>;
  partners: Array<{
    id: string;
    applicationId: string;
    displayName: string;
    businessName: string;
    profilePhotoUrl: string;
    slug: string;
    websiteStatus: string;
    directoryStatus: string;
    impressions: number;
    profileClicks: number;
    bookingClicks: number;
    clickThroughRate: number;
    profileToBookingRate: number;
    availabilityConfigured: boolean;
    acceptanceRate: number;
    completedAppointments: number;
    organicScore: number;
  }>;
};

let schemaReady: Promise<void> | null = null;

export async function ensurePartnerDirectoryAnalyticsSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await ensureBookingEngineSchema();
    await getDbPool().query(`
      create table if not exists app.partner_directory_daily_metrics (
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        metric_date date not null default current_date,
        impressions bigint not null default 0,
        profile_clicks bigint not null default 0,
        booking_clicks bigint not null default 0,
        updated_at timestamptz not null default now(),
        primary key (partner_profile_id, metric_date),
        check (impressions >= 0 and profile_clicks >= 0 and booking_clicks >= 0)
      );
      create index if not exists partner_directory_metrics_date_idx
        on app.partner_directory_daily_metrics (metric_date desc, partner_profile_id);
    `);
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function recordPartnerDirectoryEvent(
  partnerProfileIds: string[],
  event: "impression" | "profile_click" | "booking_click",
) {
  await ensurePartnerDirectoryAnalyticsSchema();
  const ids = [...new Set(partnerProfileIds)].slice(0, 20);
  if (!ids.length) return;
  const column = event === "impression" ? "impressions" : event === "profile_click" ? "profile_clicks" : "booking_clicks";
  await getDbPool().query(
    `insert into app.partner_directory_daily_metrics (partner_profile_id, metric_date, ${column})
     select profile.id, current_date, 1
       from app.partner_profiles profile
      where profile.id = any($1::uuid[])
        and profile.directory_status = 'published'
     on conflict (partner_profile_id, metric_date) do update
       set ${column} = app.partner_directory_daily_metrics.${column} + 1,
           updated_at = now()`,
    [ids],
  );
}

function rate(clicks: number, impressions: number) {
  return impressions ? Number(((clicks / impressions) * 100).toFixed(1)) : 0;
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function utcDateOffset(daysAgo: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

export function partnerDirectoryDateRange(startDateRaw = "", endDateRaw = "") {
  const today = utcDateOffset(0);
  const fallbackStart = utcDateOffset(29);
  const requestedEnd = validDate(endDateRaw) ? endDateRaw : today;
  const endDate = requestedEnd > today ? today : requestedEnd;
  let startDate = validDate(startDateRaw) ? startDateRaw : fallbackStart;
  if (startDate > endDate) startDate = endDate;
  const maximumStart = new Date(`${endDate}T00:00:00.000Z`);
  maximumStart.setUTCDate(maximumStart.getUTCDate() - 729);
  const earliestAllowed = maximumStart.toISOString().slice(0, 10);
  if (startDate < earliestAllowed) startDate = earliestAllowed;
  const days = Math.round((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
  return { startDate, endDate, days };
}

export async function getPartnerDirectoryMetrics(profileId: string, startDateRaw = "", endDateRaw = ""): Promise<PartnerDirectoryMetrics> {
  await ensurePartnerDirectoryAnalyticsSchema();
  const range = partnerDirectoryDateRange(startDateRaw, endDateRaw);
  const result = await getDbPool().query<{
    date: string;
    impressions: string;
    profile_clicks: string;
    booking_clicks: string;
    bookings: string;
  }>(
    `with dates as (
       select generate_series($2::date, $3::date, interval '1 day')::date as metric_date
     ), attributed_bookings as (
       select appointment.created_at::date as metric_date, count(*)::bigint as bookings
         from app.appointments appointment
        where appointment.partner_profile_id = $1::uuid
          and appointment.created_at::date between $2::date and $3::date
          and appointment.metadata->'directory_attribution'->>'source' = 'partner_directory'
          and appointment.metadata->'directory_attribution'->>'partnerProfileId' = $1::text
          and appointment.status not in ('failed', 'cancelled', 'refunded')
        group by appointment.created_at::date
     )
     select dates.metric_date::text as date,
            coalesce(metric.impressions, 0)::text as impressions,
            coalesce(metric.profile_clicks, 0)::text as profile_clicks,
            coalesce(metric.booking_clicks, 0)::text as booking_clicks,
            coalesce(attributed_bookings.bookings, 0)::text as bookings
       from dates
       left join app.partner_directory_daily_metrics metric
         on metric.partner_profile_id = $1::uuid and metric.metric_date = dates.metric_date
       left join attributed_bookings on attributed_bookings.metric_date = dates.metric_date
      order by dates.metric_date`,
    [profileId, range.startDate, range.endDate],
  );
  const rows = result.rows.map((row) => ({
    date: row.date,
    impressions: Number(row.impressions || 0),
    profileClicks: Number(row.profile_clicks || 0),
    bookingClicks: Number(row.booking_clicks || 0),
    bookings: Number(row.bookings || 0),
  }));
  const metrics = rows.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    profileClicks: sum.profileClicks + row.profileClicks,
    bookingClicks: sum.bookingClicks + row.bookingClicks,
    bookings: sum.bookings + row.bookings,
  }), { impressions: 0, profileClicks: 0, bookingClicks: 0, bookings: 0 });
  return {
    range,
    metrics: {
      ...metrics,
      clickThroughRate: rate(metrics.profileClicks, metrics.impressions),
      bookingConversionRate: rate(metrics.bookings, metrics.bookingClicks),
    },
    trend: rows,
  };
}

export async function getPartnerDirectoryRankingSignals(profileIds: string[]): Promise<Map<string, { availabilityConfigured: boolean; acceptanceRate: number; completedAppointments: number; organicScore: number }>> {
  await ensureBookingEngineSchema();
  if (!profileIds.length) return new Map<string, { availabilityConfigured: boolean; acceptanceRate: number; completedAppointments: number; organicScore: number }>();
  const result = await getDbPool().query<{
    profile_id: string;
    availability_configured: boolean;
    accepted_count: string;
    declined_count: string;
    completed_count: string;
  }>(
    `select profile.id::text as profile_id,
            exists (
              select 1 from app.partner_availability_rules availability
               where availability.partner_profile_id = profile.id and availability.is_active = true
            ) as availability_configured,
            count(distinct appointment.id) filter (where exists (
              select 1 from app.appointment_events event
               where event.appointment_id = appointment.id and event.actor_type = 'partner'
                 and event.actor_id = profile.id::text and event.event_type = 'partner_acknowledged'
            ))::text as accepted_count,
            count(distinct appointment.id) filter (where exists (
              select 1 from app.appointment_events event
               where event.appointment_id = appointment.id and event.actor_type = 'partner'
                 and event.actor_id = profile.id::text and event.event_type = 'partner_declined'
            ))::text as declined_count,
            count(distinct appointment.id) filter (where appointment.status = 'completed')::text as completed_count
       from app.partner_profiles profile
       left join app.appointments appointment on appointment.partner_profile_id = profile.id
      where profile.id = any($1::uuid[])
      group by profile.id`,
    [profileIds],
  );
  return new Map(result.rows.map((row) => {
    const accepted = Number(row.accepted_count || 0);
    const declined = Number(row.declined_count || 0);
    const completed = Number(row.completed_count || 0);
    const acceptanceRate = accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : 100;
    const organicScore = Math.min(100, Math.round(
      (row.availability_configured ? 30 : 0) + acceptanceRate * 0.5 + Math.min(completed, 20),
    ));
    return [row.profile_id, { availabilityConfigured: row.availability_configured, acceptanceRate, completedAppointments: completed, organicScore }];
  }));
}

export async function getPartnerDirectoryAdminAnalytics(rawDays: number, stateCodes: string[] = []): Promise<PartnerDirectoryAdminAnalytics> {
  await ensurePartnerDirectoryAnalyticsSchema();
  const days: 7 | 30 | 90 = rawDays === 7 ? 7 : rawDays === 90 ? 90 : 30;
  const currentStart = utcDateOffset(days - 1);
  const previousStart = utcDateOffset(days * 2 - 1);
  const previousEnd = utcDateOffset(days);
  const normalizedStates = stateCodes.map((value) => value.trim().toUpperCase()).filter(Boolean);
  const profileValues: unknown[] = [currentStart, previousStart, previousEnd];
  const stateScopeSql = normalizedStates.length
    ? `where exists (
         select 1
           from app.partner_service_assignments assignment
           join app.partner_coverage_areas area on area.assignment_id = assignment.id
          where assignment.partner_profile_id = profile.id
            and assignment.status = 'active'
            and area.status = 'active'
            and upper(trim(area.state)) = any($4::text[])
       )`
    : "";
  if (normalizedStates.length) profileValues.push(normalizedStates);
  const result = await getDbPool().query<{
    id: string;
    application_id: string;
    display_name: string;
    business_name: string | null;
    profile_photo_url: string | null;
    slug: string;
    website_status: string;
    directory_status: string;
    current_impressions: string;
    current_profile_clicks: string;
    current_booking_clicks: string;
    previous_impressions: string;
    previous_profile_clicks: string;
    previous_booking_clicks: string;
  }>(
    `select profile.id::text,
            profile.application_id::text,
            profile.display_name,
            profile.business_name,
            profile.profile_photo_url,
            profile.slug,
            profile.website_status,
            profile.directory_status,
            coalesce(sum(metric.impressions) filter (where metric.metric_date >= $1::date), 0)::text as current_impressions,
            coalesce(sum(metric.profile_clicks) filter (where metric.metric_date >= $1::date), 0)::text as current_profile_clicks,
            coalesce(sum(metric.booking_clicks) filter (where metric.metric_date >= $1::date), 0)::text as current_booking_clicks,
            coalesce(sum(metric.impressions) filter (where metric.metric_date >= $2::date and metric.metric_date <= $3::date), 0)::text as previous_impressions,
            coalesce(sum(metric.profile_clicks) filter (where metric.metric_date >= $2::date and metric.metric_date <= $3::date), 0)::text as previous_profile_clicks,
            coalesce(sum(metric.booking_clicks) filter (where metric.metric_date >= $2::date and metric.metric_date <= $3::date), 0)::text as previous_booking_clicks
       from app.partner_profiles profile
       left join app.partner_directory_daily_metrics metric
         on metric.partner_profile_id = profile.id
        and metric.metric_date >= $2::date
      ${stateScopeSql}
      group by profile.id
      order by current_impressions desc, current_profile_clicks desc, profile.display_name`,
    profileValues,
  );
  const profileIds = result.rows.map((row) => row.id);
  const ranking = await getPartnerDirectoryRankingSignals(profileIds);
  const partners = result.rows.map((row) => {
    const impressions = Number(row.current_impressions || 0);
    const profileClicks = Number(row.current_profile_clicks || 0);
    const bookingClicks = Number(row.current_booking_clicks || 0);
    const signal = ranking.get(row.id) || { availabilityConfigured: false, acceptanceRate: 100, completedAppointments: 0, organicScore: 50 };
    return {
      id: row.id,
      applicationId: row.application_id,
      displayName: row.display_name,
      businessName: String(row.business_name || ""),
      profilePhotoUrl: String(row.profile_photo_url || ""),
      slug: row.slug,
      websiteStatus: row.website_status,
      directoryStatus: row.directory_status || "hidden",
      impressions,
      profileClicks,
      bookingClicks,
      clickThroughRate: rate(profileClicks, impressions),
      profileToBookingRate: rate(bookingClicks, profileClicks),
      ...signal,
    };
  });
  const current = partners.reduce((total, partner) => ({
    impressions: total.impressions + partner.impressions,
    profileClicks: total.profileClicks + partner.profileClicks,
    bookingClicks: total.bookingClicks + partner.bookingClicks,
  }), { impressions: 0, profileClicks: 0, bookingClicks: 0 });
  const previous = result.rows.reduce((total, row) => ({
    impressions: total.impressions + Number(row.previous_impressions || 0),
    profileClicks: total.profileClicks + Number(row.previous_profile_clicks || 0),
    bookingClicks: total.bookingClicks + Number(row.previous_booking_clicks || 0),
  }), { impressions: 0, profileClicks: 0, bookingClicks: 0 });
  const trendValues: unknown[] = [currentStart];
  const trendScopeSql = normalizedStates.length ? "and partner_profile_id = any($2::uuid[])" : "";
  if (normalizedStates.length) trendValues.push(profileIds);
  const trendResult = await getDbPool().query<{ date: string; impressions: string; profile_clicks: string; booking_clicks: string }>(
    `select metric_date::text as date,
            sum(impressions)::text as impressions,
            sum(profile_clicks)::text as profile_clicks,
            sum(booking_clicks)::text as booking_clicks
      from app.partner_directory_daily_metrics
      where metric_date >= $1::date
        ${trendScopeSql}
      group by metric_date
      order by metric_date`,
    trendValues,
  );
  const trendByDate = new Map<string, { date: string; impressions: number; profileClicks: number; bookingClicks: number }>(trendResult.rows.map((row) => [row.date, {
    date: row.date,
    impressions: Number(row.impressions || 0),
    profileClicks: Number(row.profile_clicks || 0),
    bookingClicks: Number(row.booking_clicks || 0),
  }]));
  const trend = Array.from({ length: days }, (_, index) => {
    const date = utcDateOffset(days - 1 - index);
    return trendByDate.get(date) || { date, impressions: 0, profileClicks: 0, bookingClicks: 0 };
  });
  const currentCtr = rate(current.profileClicks, current.impressions);
  const previousCtr = rate(previous.profileClicks, previous.impressions);
  return {
    days,
    summary: {
      ...current,
      clickThroughRate: currentCtr,
      profileToBookingRate: rate(current.bookingClicks, current.profileClicks),
      visiblePartners: partners.filter((partner) => partner.directoryStatus === "published").length,
      totalPartners: partners.length,
    },
    previous: { ...previous, clickThroughRate: previousCtr },
    change: {
      impressions: percentChange(current.impressions, previous.impressions),
      profileClicks: percentChange(current.profileClicks, previous.profileClicks),
      bookingClicks: percentChange(current.bookingClicks, previous.bookingClicks),
      clickThroughRate: Number((currentCtr - previousCtr).toFixed(1)),
    },
    trend,
    partners,
  };
}
