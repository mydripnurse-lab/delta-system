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
};

function copyForEvent(eventType: string, serviceName: string | null) {
  const service = serviceName || "your service";
  switch (eventType) {
    case "partner_reassigned":
      return { title: "New appointment assigned", message: `A ${service} appointment has been assigned to you and is waiting for your confirmation.` };
    case "appointment_confirmed":
    case "slot_held":
      return { title: "New appointment", message: `A new ${service} appointment is waiting for your confirmation.` };
    default:
      return { title: "New appointment", message: `A new ${service} appointment is waiting for your confirmation.` };
  }
}

export async function listPartnerPortalNotifications(profileId: string, limit = 30) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    id: string;
    event_type: string;
    created_at: string;
    appointment_id: string;
    public_reference: string | null;
    service_name: string | null;
    starts_at: string | null;
    status: string | null;
  }>(
    `with pending_notifications as (
       select distinct on (appointment.id)
              event.id, event.event_type, event.created_at::text,
              appointment.id as appointment_id, appointment.public_reference,
              service.name as service_name, appointment.starts_at::text, appointment.status
         from app.appointment_events event
         join app.appointments appointment on appointment.id = event.appointment_id
         left join app.services service on service.id = appointment.service_id
        where appointment.partner_profile_id = $1::uuid
          and appointment.status in ('payment_pending', 'confirmed')
          and event.event_type in ('appointment_confirmed', 'slot_held', 'partner_reassigned')
        order by appointment.id, event.created_at desc
      )
      select id, event_type, created_at, appointment_id, public_reference,
             service_name, starts_at, status
        from pending_notifications
       order by created_at desc
       limit $2`,
    [profileId, Math.min(Math.max(limit, 1), 100)],
  );
  return result.rows.map((row) => {
    const copy = copyForEvent(row.event_type, row.service_name);
    return {
      id: row.id,
      eventType: row.event_type,
      createdAt: row.created_at,
      ...copy,
      appointmentId: row.appointment_id,
      reference: row.public_reference,
      serviceName: row.service_name,
      startsAt: row.starts_at,
      status: row.status,
    } satisfies PartnerPortalNotification;
  });
}
