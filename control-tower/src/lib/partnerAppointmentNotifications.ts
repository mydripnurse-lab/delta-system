import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";

export type NotificationEvent = "created" | "confirmed" | "partner_acknowledged" | "visit_started" | "visit_completed" | "rescheduled" | "reassigned" | "partner_declined";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function sendPartnerAppointmentNotification(appointmentId: string, event: NotificationEvent) {
  try {
    await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "schema_unavailable" };
  }
  let result;
  try {
    result = await getDbPool().query<{
    webhook_url: string | null;
    reference: string;
    status: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    service_name: string;
    amount_due_at_visit: string;
    currency: string;
    partner_name: string;
    partner_email: string;
    partner_slug: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
  }>(
    `select config.partner_notification_webhook_url as webhook_url,
            appointment.public_reference as reference, appointment.status,
            appointment.starts_at::text, appointment.ends_at::text, appointment.timezone,
            appointment.address_line_1, appointment.address_line_2,
            appointment.city, appointment.county, appointment.state, appointment.postal_code,
            service.name as service_name,
            greatest(appointment.service_price - appointment.deposit_amount, 0)::text as amount_due_at_visit,
            appointment.currency, partner.display_name as partner_name,
            partner.email as partner_email, partner.slug as partner_slug,
            customer.full_name as customer_name, customer.email as customer_email,
            customer.phone as customer_phone
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       left join app.partner_profiles partner on partner.id = coalesce(
         appointment.partner_profile_id,
         (select nullif(declined.actor_id, '')::uuid
            from app.appointment_events declined
           where declined.appointment_id = appointment.id
             and declined.event_type = 'partner_declined'
             and declined.actor_type = 'partner'
           order by declined.created_at desc
           limit 1)
       )
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.staff_form_configs config on config.organization_id = appointment.organization_id
      where appointment.id = $1
      limit 1`,
      [appointmentId],
    );
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "query_failed" };
  }
  const row = result.rows[0];
  const webhookUrl = text(row?.webhook_url);
  if (!row || !webhookUrl) return { sent: false, reason: "not_configured" as const };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        event: `partner.appointment.${event}`,
        source: "my-drip-nurse-booking-engine",
        sentAt: new Date().toISOString(),
        notificationChannels: ["email", "sms"],
        partner: { name: row.partner_name, email: row.partner_email, slug: row.partner_slug },
        customer: { name: row.customer_name, email: row.customer_email, phone: row.customer_phone },
        appointment: {
          reference: row.reference,
          status: row.status,
          service: row.service_name,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          timezone: row.timezone,
          address: [row.address_line_1, row.address_line_2, row.city, row.county, row.state, row.postal_code].filter(Boolean).join(", "),
          amountDueAtVisit: Number(row.amount_due_at_visit || 0),
          currency: row.currency,
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { sent: false, reason: `http_${response.status}` as const };
    return { sent: true, status: response.status };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}
