import webpush from "web-push";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type PartnerPushEvent = "appointment_confirmation" | "appointment_reassigned" | "start_reminder" | "complete_reminder";
export type PartnerReminderAction = "accept" | "start" | "complete";

type PushPayload = {
  notificationId: string;
  title: string;
  message: string;
  url: string;
  tag: string;
  badgeCount: number;
};

function pushConfiguration() {
  const publicKey = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:support@mydripnurse.com").trim();
  return { publicKey, privateKey, subject, configured: Boolean(publicKey && privateKey) };
}

export function getPartnerPushPublicConfiguration() {
  const config = pushConfiguration();
  return { configured: config.configured, publicKey: config.configured ? config.publicKey : "" };
}

export async function savePartnerPushSubscription(input: {
  profileId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expirationTime: number | null;
  userAgent: string;
}) {
  await ensureBookingEngineSchema();
  await getDbPool().query(
    `insert into app.partner_push_subscriptions (
       partner_profile_id, endpoint, p256dh, auth_secret, expiration_time, user_agent
     ) values ($1::uuid, $2, $3, $4, $5, $6)
     on conflict (endpoint) do update set
       partner_profile_id = excluded.partner_profile_id,
       p256dh = excluded.p256dh,
       auth_secret = excluded.auth_secret,
       expiration_time = excluded.expiration_time,
       user_agent = excluded.user_agent,
       enabled = true,
       last_error = '',
       updated_at = now()`,
    [input.profileId, input.endpoint, input.p256dh, input.auth, input.expirationTime, input.userAgent.slice(0, 1000)],
  );
  await deliverUndeliveredPartnerNotifications(input.profileId);
}

export async function removePartnerPushSubscription(profileId: string, endpoint: string) {
  await ensureBookingEngineSchema();
  await getDbPool().query(
    `update app.partner_push_subscriptions
        set enabled = false, updated_at = now()
      where partner_profile_id = $1::uuid and endpoint = $2`,
    [profileId, endpoint],
  );
}

async function unreadCount(profileId: string) {
  const result = await getDbPool().query<{ count: string }>(
    `select count(*)::text as count
       from app.partner_portal_notifications
      where partner_profile_id = $1::uuid and read_at is null`,
    [profileId],
  );
  return Number(result.rows[0]?.count || 0);
}

async function deliverPush(profileId: string, payload: PushPayload) {
  const config = pushConfiguration();
  if (!config.configured) return { sent: 0, configured: false };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const subscriptions = await getDbPool().query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth_secret: string;
    expiration_time: string | null;
  }>(
    `select id, endpoint, p256dh, auth_secret, expiration_time::text
       from app.partner_push_subscriptions
      where partner_profile_id = $1::uuid and enabled = true`,
    [profileId],
  );
  let sent = 0;
  await Promise.all(subscriptions.rows.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiration_time ? Number(subscription.expiration_time) : null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
      }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: "high" });
      sent += 1;
      await getDbPool().query(
        `update app.partner_push_subscriptions
            set last_success_at = now(), last_error = '', updated_at = now()
          where id = $1::uuid`,
        [subscription.id],
      );
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      const message = error instanceof Error ? error.message : "Push delivery failed";
      await getDbPool().query(
        `update app.partner_push_subscriptions
            set enabled = case when $2::int in (404, 410) then false else enabled end,
                last_error = $3, updated_at = now()
          where id = $1::uuid`,
        [subscription.id, statusCode, message.slice(0, 1000)],
      );
    }
  }));
  return { sent, configured: true };
}

async function deliverNotificationRow(row: {
  id: string;
  partner_profile_id: string;
  event_key: string;
  title: string;
  message: string;
  action_url: string;
}) {
  const badgeCount = await unreadCount(row.partner_profile_id);
  const delivery = await deliverPush(row.partner_profile_id, {
    notificationId: row.id,
    title: row.title,
    message: row.message,
    url: row.action_url,
    tag: row.event_key,
    badgeCount,
  });
  if (delivery.sent > 0) {
    await getDbPool().query(
      `update app.partner_portal_notifications set delivered_at = coalesce(delivered_at, now()) where id = $1::uuid`,
      [row.id],
    );
  }
  return delivery;
}

export async function deliverUndeliveredPartnerNotifications(profileId: string) {
  await ensureBookingEngineSchema();
  const rows = await getDbPool().query<{
    id: string;
    partner_profile_id: string;
    event_key: string;
    title: string;
    message: string;
    action_url: string;
  }>(
    `select id, partner_profile_id, event_key, title, message, action_url
       from app.partner_portal_notifications
      where partner_profile_id = $1::uuid and read_at is null and delivered_at is null
      order by created_at asc
      limit 10`,
    [profileId],
  );
  for (const row of rows.rows) await deliverNotificationRow(row);
}

function notificationCopy(event: PartnerPushEvent, serviceName: string, startsAt: string, timezone: string, earnings?: number, currency = "USD") {
  const appointmentTime = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone,
  }).format(new Date(startsAt));
  if (event === "start_reminder") {
    return { title: "Appointment ready to start", message: `${serviceName} is scheduled for ${appointmentTime}. Open the visit and tap Start.` };
  }
  if (event === "complete_reminder") {
    return { title: "Complete your appointment", message: `When the ${serviceName} visit is finished, open it and tap Complete.` };
  }
  if (event === "appointment_reassigned") {
    const earningLabel = typeof earnings === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(earnings) : "";
    return { title: "New appointment · Action required", message: `${earningLabel ? `${earningLabel} + tips · ` : ""}${serviceName} on ${appointmentTime}. Accept or decline now.` };
  }
  const earningLabel = typeof earnings === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(earnings) : "";
  return { title: "New appointment · Action required", message: `${earningLabel ? `${earningLabel} + tips · ` : ""}${serviceName} on ${appointmentTime}. Accept or decline now.` };
}

export async function createPartnerAppointmentPush(appointmentId: string, event: PartnerPushEvent) {
  await ensureBookingEngineSchema();
  const appointment = await getDbPool().query<{
    partner_profile_id: string | null;
    service_name: string;
    starts_at: string;
    timezone: string;
    partner_earnings: string;
    currency: string;
  }>(
    `select appointment.partner_profile_id::text, service.name as service_name,
            appointment.starts_at::text, appointment.timezone,
            greatest(appointment.service_price - appointment.deposit_amount, 0)::text as partner_earnings,
            appointment.currency
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
      where appointment.id = $1::uuid
      limit 1`,
    [appointmentId],
  );
  const row = appointment.rows[0];
  if (!row?.partner_profile_id) return { created: false, reason: "partner_not_assigned" as const };
  const copy = notificationCopy(event, row.service_name, row.starts_at, row.timezone, Number(row.partner_earnings || 0), row.currency);
  const eventKey = `${event}:${appointmentId}:${row.partner_profile_id}`;
  const inserted = await getDbPool().query<{
    id: string;
    partner_profile_id: string;
    event_key: string;
    title: string;
    message: string;
    action_url: string;
  }>(
    `insert into app.partner_portal_notifications (
       partner_profile_id, appointment_id, event_key, event_type, title, message, action_url
     ) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
     on conflict (partner_profile_id, event_key) do nothing
     returning id, partner_profile_id::text, event_key, title, message, action_url`,
    [row.partner_profile_id, appointmentId, eventKey, event, copy.title, copy.message, `/partner-portal/appointments?appointment=${encodeURIComponent(appointmentId)}&offer=1`],
  );
  const notification = inserted.rows[0];
  if (!notification) return { created: false, reason: "duplicate" as const };
  const delivery = await deliverNotificationRow(notification);
  return { created: true, ...delivery };
}

export async function sendAdminPartnerAppointmentReminder(input: {
  appointmentId: string;
  action: PartnerReminderAction;
  adminUserId: string;
}) {
  await ensureBookingEngineSchema();
  const appointment = await getDbPool().query<{
    partner_profile_id: string | null;
    status: string;
    service_name: string;
    starts_at: string;
    timezone: string;
  }>(
    `select appointment.partner_profile_id::text, appointment.status,
            service.name as service_name, appointment.starts_at::text, appointment.timezone
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
      where appointment.id = $1::uuid
      limit 1`,
    [input.appointmentId],
  );
  const row = appointment.rows[0];
  if (!row) throw new Error("Appointment not found.");
  if (!row.partner_profile_id) throw new Error("This appointment does not have an assigned Partner.");
  const expectedStatus: Record<PartnerReminderAction, string> = {
    accept: "confirmed",
    start: "partner_acknowledged",
    complete: "in_progress",
  };
  if (row.status !== expectedStatus[input.action]) {
    throw new Error("The appointment has already moved beyond that step. Refresh the appointment before sending another reminder.");
  }
  const recentReminder = await getDbPool().query<{ id: string }>(
    `select id::text
       from app.partner_portal_notifications
      where appointment_id = $1::uuid
        and event_key like $2
        and created_at > now() - interval '1 minute'
      limit 1`,
    [input.appointmentId, `admin_reminder:${input.action}:%`],
  );
  if (recentReminder.rows[0]) throw new Error("A reminder for this step was sent less than one minute ago.");
  const event: Record<PartnerReminderAction, PartnerPushEvent> = {
    accept: "appointment_confirmation",
    start: "start_reminder",
    complete: "complete_reminder",
  };
  const copy = notificationCopy(event[input.action], row.service_name, row.starts_at, row.timezone);
  const inserted = await getDbPool().query<{
    id: string;
    partner_profile_id: string;
    event_key: string;
    title: string;
    message: string;
    action_url: string;
  }>(
    `insert into app.partner_portal_notifications (
       partner_profile_id, appointment_id, event_key, event_type, title, message, action_url
     ) values ($1::uuid, $2::uuid, 'admin_reminder:' || $3 || ':' || gen_random_uuid()::text, $4, $5, $6, $7)
     returning id, partner_profile_id::text, event_key, title, message, action_url`,
    [row.partner_profile_id, input.appointmentId, input.action, event[input.action], copy.title, copy.message, `/partner-portal/appointments?appointment=${encodeURIComponent(input.appointmentId)}`],
  );
  const notification = inserted.rows[0];
  await getDbPool().query(
    `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
     values ($1::uuid, 'admin_push_reminder', 'admin', $2, $3::jsonb)`,
    [input.appointmentId, input.adminUserId, JSON.stringify({ action: input.action, notificationId: notification.id })],
  );
  const delivery = await deliverNotificationRow(notification);
  return { action: input.action, notificationId: notification.id, ...delivery };
}

export async function runPartnerAppointmentPushReminders() {
  await ensureBookingEngineSchema();
  const candidates = await getDbPool().query<{ id: string; reminder: PartnerPushEvent }>(
    `select appointment.id::text,
            case when appointment.status = 'confirmed' then 'appointment_confirmation'
                 when appointment.status = 'partner_acknowledged' then 'start_reminder'
                 else 'complete_reminder' end as reminder
       from app.appointments appointment
      where appointment.partner_profile_id is not null and ((
        appointment.status = 'confirmed'
        and appointment.starts_at > now() - interval '24 hours'
      ) or (
        appointment.status = 'partner_acknowledged'
        and appointment.starts_at between now() - interval '10 minutes' and now() + interval '5 minutes'
      ) or (
        appointment.status = 'in_progress'
        and appointment.ends_at between now() - interval '24 hours' and now()
      ))
      order by appointment.starts_at asc
      limit 100`,
  );
  let created = 0;
  let sent = 0;
  for (const candidate of candidates.rows) {
    const result = await createPartnerAppointmentPush(candidate.id, candidate.reminder);
    if (result.created) created += 1;
    if (result.created && "sent" in result) sent += result.sent;
  }
  return { candidates: candidates.rowCount || 0, created, sent };
}
