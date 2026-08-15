import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type WeeklyAvailabilityDay = {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

export type PartnerWeeklyAvailability = {
  timezone: string;
  days: WeeklyAvailabilityDay[];
  blockedDates: string[];
  blockedRanges: PartnerAvailabilityBlock[];
};

export type PartnerAvailabilityBlock = {
  date: string;
  startTime: string;
  endTime: string;
};

type AvailabilityRuleRow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

const DEFAULT_TIMEZONE = "America/New_York";

export const PARTNER_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Puerto_Rico",
] as const;

function clock(value: string) {
  return String(value || "").slice(0, 5);
}

async function getPartnerBlockedRanges(profileId: string, timezone: string) {
  const result = await getDbPool().query<{ date: string; start_time: string; end_time: string }>(
    `select (starts_at at time zone $2)::date::text as date,
            to_char(starts_at at time zone $2, 'HH24:MI') as start_time,
            case when (ends_at at time zone $2)::date > (starts_at at time zone $2)::date
              then '24:00' else to_char(ends_at at time zone $2, 'HH24:MI') end as end_time
       from app.partner_availability_exceptions
      where partner_profile_id = $1
        and service_id is null
        and kind = 'unavailable'
        and reason like 'Partner blocked%'
      order by starts_at`,
    [profileId, timezone],
  );
  return result.rows.map((row) => ({ date: row.date, startTime: row.start_time, endTime: row.end_time }));
}

export async function getPartnerWeeklyAvailability(profileId: string): Promise<PartnerWeeklyAvailability> {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<AvailabilityRuleRow>(
    `select day_of_week, start_time::text, end_time::text, timezone
       from app.partner_availability_rules
      where partner_profile_id = $1
        and service_id is null
        and is_active = true
      order by day_of_week, start_time`,
    [profileId],
  );
  const timezone = result.rows[0]?.timezone || DEFAULT_TIMEZONE;
  const blockedRanges = await getPartnerBlockedRanges(profileId, timezone);
  return {
    timezone,
    days: Array.from({ length: 7 }, (_, dayOfWeek) => {
      const rule = result.rows.find((row) => row.day_of_week === dayOfWeek);
      return {
        dayOfWeek,
        enabled: Boolean(rule),
        startTime: rule ? clock(rule.start_time) : "09:00",
        endTime: rule ? clock(rule.end_time) : "17:00",
      };
    }),
    blockedDates: blockedRanges.filter((range) => range.startTime === "00:00" && range.endTime === "24:00").map((range) => range.date),
    blockedRanges,
  };
}

export async function savePartnerWeeklyAvailability(opts: {
  profileId: string;
  timezone: string;
  days: WeeklyAvailabilityDay[];
  blockedDates?: string[];
  blockedRanges?: PartnerAvailabilityBlock[];
}) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `delete from app.partner_availability_rules
        where partner_profile_id = $1 and service_id is null`,
      [opts.profileId],
    );
    for (const day of opts.days) {
      if (!day.enabled) continue;
      await client.query(
        `insert into app.partner_availability_rules (
           partner_profile_id, service_id, timezone, day_of_week,
           start_time, end_time, is_active
         ) values ($1, null, $2, $3, $4::time, $5::time, true)`,
        [opts.profileId, opts.timezone, day.dayOfWeek, day.startTime, day.endTime],
      );
    }
    if (opts.blockedDates !== undefined || opts.blockedRanges !== undefined) {
      await client.query(
        `delete from app.partner_availability_exceptions
          where partner_profile_id = $1
            and service_id is null
            and kind = 'unavailable'
            and reason like 'Partner blocked%'`,
        [opts.profileId],
      );
      const fullDayRanges = [...new Set(opts.blockedDates || [])].sort().map((date) => ({ date, startTime: "00:00", endTime: "24:00" }));
      const ranges = [...fullDayRanges, ...(opts.blockedRanges || [])];
      for (const blockedRange of ranges) {
        await client.query(
          blockedRange.startTime === "00:00" && blockedRange.endTime === "24:00"
            ? `insert into app.partner_availability_exceptions (
             partner_profile_id, service_id, starts_at, ends_at, kind, reason
           ) values (
             $1, null,
             (($2::date + time '00:00') at time zone $3),
             ((($2::date + 1) + time '00:00') at time zone $3),
             'unavailable', 'Partner blocked day'
           )`
            : blockedRange.endTime === "24:00"
            ? `insert into app.partner_availability_exceptions (
             partner_profile_id, service_id, starts_at, ends_at, kind, reason
           ) values (
             $1, null,
             (($2::date + $3::time) at time zone $5),
             ((($2::date + 1) + time '00:00') at time zone $5),
             'unavailable', 'Partner blocked hours'
           )`
            : `insert into app.partner_availability_exceptions (
             partner_profile_id, service_id, starts_at, ends_at, kind, reason
           ) values (
             $1, null,
             (($2::date + $3::time) at time zone $5),
             (($2::date + $4::time) at time zone $5),
             'unavailable', 'Partner blocked hours'
           )`,
          blockedRange.startTime === "00:00" && blockedRange.endTime === "24:00"
            ? [opts.profileId, blockedRange.date, opts.timezone]
            : blockedRange.endTime === "24:00"
            ? [opts.profileId, blockedRange.date, blockedRange.startTime, blockedRange.endTime, opts.timezone]
            : [opts.profileId, blockedRange.date, blockedRange.startTime, blockedRange.endTime, opts.timezone],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return getPartnerWeeklyAvailability(opts.profileId);
}

async function profileIdForApplication(applicationId: string) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{ id: string }>(
    `select id from app.partner_profiles where application_id = $1 limit 1`,
    [applicationId],
  );
  const profileId = result.rows[0]?.id;
  if (!profileId) throw new Error("Complete the Partner profile before setting availability.");
  return profileId;
}

export async function getApplicationWeeklyAvailability(applicationId: string) {
  return getPartnerWeeklyAvailability(await profileIdForApplication(applicationId));
}

export async function saveApplicationWeeklyAvailability(opts: {
  applicationId: string;
  timezone: string;
  days: WeeklyAvailabilityDay[];
}) {
  const profileId = await profileIdForApplication(opts.applicationId);
  return savePartnerWeeklyAvailability({
    profileId,
    timezone: opts.timezone,
    days: opts.days,
  });
}
