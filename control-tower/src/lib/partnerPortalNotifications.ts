import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type PartnerPortalNotification = {
  id: string;
  eventType: string;
  createdAt: string;
  title: string;
  message: string;
  appointmentId: string | null;
  reference: string | null;
  serviceName: string | null;
  startsAt: string | null;
  status: string | null;
  actionUrl: string;
  readAt: string | null;
};

function copyForEvent(eventType: string, serviceName: string | null) {
  const service = serviceName || "your service";
  switch (eventType) {
    case "partner_reassigned":
      return { title: "New appointment · Action required", message: `A ${service} appointment is ready. Review the offer and respond now.` };
    case "appointment_confirmed":
    case "slot_held":
      return { title: "New appointment · Action required", message: `A new ${service} appointment is ready. Review the offer and respond now.` };
    default:
      return { title: "New appointment · Action required", message: `A new ${service} appointment is ready. Review the offer and respond now.` };
  }
}

export async function listPartnerPortalNotifications(profileId: string, limit = 30) {
  await ensureBookingEngineSchema();
  await getDbPool().query(
    `insert into app.partner_portal_notifications (
       partner_profile_id, appointment_id, event_key, event_type, title, message, action_url, created_at
     )
     select distinct on (appointment.id) appointment.partner_profile_id, appointment.id, 'legacy:' || event.id::text,
            case when event.event_type = 'partner_reassigned' then 'appointment_reassigned' else 'appointment_confirmation' end,
            'New appointment · Action required',
            'A ' || coalesce(service.name, 'service') || ' appointment is ready. Review the offer and respond now.',
            '/partner-portal/appointments?appointment=' || appointment.id::text || '&offer=1',
            event.created_at
       from app.appointment_events event
       join app.appointments appointment on appointment.id = event.appointment_id
       left join app.services service on service.id = appointment.service_id
      where appointment.partner_profile_id = $1::uuid
        and appointment.status in ('payment_pending', 'confirmed')
        and event.event_type in ('appointment_confirmed', 'slot_held', 'partner_reassigned')
     order by appointment.id, event.created_at desc
     on conflict (partner_profile_id, event_key) do nothing`,
    [profileId],
  );
  await getDbPool().query(
    `update app.partner_portal_notifications notification
        set read_at = coalesce(notification.read_at, now())
       from app.appointments appointment
      where notification.partner_profile_id = $1::uuid
        and notification.appointment_id = appointment.id
        and notification.read_at is null
        and (
          (notification.event_type in ('appointment_confirmation', 'appointment_reassigned') and appointment.status not in ('payment_pending', 'confirmed'))
          or (notification.event_type = 'start_reminder' and appointment.status <> 'partner_acknowledged')
          or (notification.event_type = 'complete_reminder' and appointment.status <> 'in_progress')
        )`,
    [profileId],
  );
  const result = await getDbPool().query<{
    id: string;
    event_type: string;
    created_at: string;
    appointment_id: string;
    public_reference: string | null;
    service_name: string | null;
    starts_at: string | null;
    status: string | null;
    title: string;
    message: string;
    action_url: string;
    read_at: string | null;
  }>(
    `select notification.id::text, notification.event_type, notification.created_at::text,
            notification.title, notification.message, notification.action_url, notification.read_at::text,
            appointment.id::text as appointment_id, appointment.public_reference,
            service.name as service_name, appointment.starts_at::text, appointment.status
       from app.partner_portal_notifications notification
       left join app.appointments appointment on appointment.id = notification.appointment_id
       left join app.services service on service.id = appointment.service_id
      where notification.partner_profile_id = $1::uuid
      order by notification.created_at desc
      limit $2`,
    [profileId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => {
    return {
      id: row.id,
      eventType: row.event_type,
      createdAt: row.created_at,
      title: row.title || copyForEvent(row.event_type, row.service_name).title,
      message: row.message || copyForEvent(row.event_type, row.service_name).message,
      appointmentId: row.appointment_id,
      reference: row.public_reference,
      serviceName: row.service_name,
      startsAt: row.starts_at,
      status: row.status,
      actionUrl: row.action_url || (row.appointment_id ? `/partner-portal/appointments?appointment=${encodeURIComponent(row.appointment_id)}` : "/partner-portal"),
      readAt: row.read_at,
    } satisfies PartnerPortalNotification;
  });
}

export async function markPartnerPortalNotificationsRead(profileId: string, notificationIds: string[]) {
  await ensureBookingEngineSchema();
  const ids = notificationIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return 0;
  await getDbPool().query(
    `update app.partner_portal_notifications
        set read_at = coalesce(read_at, now())
      where partner_profile_id = $1::uuid and id = any($2::uuid[])`,
    [profileId, ids],
  );
  const count = await getDbPool().query<{ count: string }>(
    `select count(*)::text as count from app.partner_portal_notifications where partner_profile_id = $1::uuid and read_at is null`,
    [profileId],
  );
  return Number(count.rows[0]?.count || 0);
}
