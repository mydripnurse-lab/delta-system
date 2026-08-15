import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";
import { ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function splitName(value: unknown) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function patient(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const split = splitName(record.fullName || record.full_name);
  const firstName = text(record.firstName || record.first_name) || split.firstName;
  const lastName = text(record.lastName || record.last_name) || split.lastName;
  return { ...record, firstName, lastName };
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Sends one customer-facing event to the Admin-configured automation webhook.
 * GHL can use notificationChannels to send the appointment details by email
 * and SMS. This is deliberately a customer-contact event; the Partner offer
 * uses a separate contact event because GHL workflows have one contact context.
 */
export async function sendCustomerAppointmentNotification(
  appointmentId: string,
  event: "confirmed" | "rescheduled",
  options: { previousStartsAt?: string | null; previousEndsAt?: string | null; reason?: string } = {},
) {
  try {
    await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
    const result = await getDbPool().query<{
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
      country_code: string;
      service_name: string;
      service_price: string;
      deposit_amount: string;
      currency: string;
      customer_name: string;
      customer_email: string;
      customer_phone: string;
      metadata: unknown;
    }>(
      `select config.partner_notification_webhook_url as webhook_url,
              appointment.public_reference as reference, appointment.status,
              appointment.starts_at::text, appointment.ends_at::text, appointment.timezone,
              appointment.address_line_1, appointment.address_line_2,
              appointment.city, appointment.county, appointment.state,
              appointment.postal_code, appointment.country_code,
              service.name as service_name, appointment.service_price::text,
              appointment.deposit_amount::text, appointment.currency,
              customer.full_name as customer_name, customer.email as customer_email,
              customer.phone as customer_phone, appointment.metadata
         from app.appointments appointment
         join app.services service on service.id = appointment.service_id
         join app.booking_customers customer on customer.id = appointment.customer_id
         left join app.staff_form_configs config on config.organization_id = appointment.organization_id
        where appointment.id = $1
        limit 1`,
      [appointmentId],
    );
    const row = result.rows[0];
    const webhookUrl = text(row?.webhook_url);
    if (!row || !webhookUrl) return { sent: false, reason: "not_configured" as const };
    const metadata = record(row.metadata);
    const additionalPatients = Array.isArray(metadata.additional_patients)
      ? metadata.additional_patients.map(patient)
      : [];
    const customerName = splitName(row.customer_name);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const eventName = `customer.appointment.${event}`;
      const idempotencyKey = `${eventName}:${appointmentId}:${row.starts_at}`;
      const payload = {
          event: eventName,
          eventId: idempotencyKey,
          idempotencyKey,
          version: 1,
          test: false,
          source: "my-drip-nurse-booking-engine",
          sentAt: new Date().toISOString(),
          notificationChannels: ["email", "sms"],
          firstName: customerName.firstName,
          lastName: customerName.lastName,
          patientFirstName: customerName.firstName,
          patientLastName: customerName.lastName,
          patientPhone: row.customer_phone,
          hasAdditionalPatients: additionalPatients.length > 0,
          additionalPatientsCount: additionalPatients.length,
          additionalPatients,
          customer: {
            name: row.customer_name,
            fullName: row.customer_name,
            firstName: customerName.firstName,
            lastName: customerName.lastName,
            email: row.customer_email,
            phone: row.customer_phone,
          },
          appointment: {
            reference: row.reference,
            publicReference: row.reference,
            status: row.status,
            service: row.service_name,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            timezone: row.timezone,
            location: {
              addressLine1: row.address_line_1,
              addressLine2: row.address_line_2,
              city: row.city,
              county: row.county,
              state: row.state,
              postalCode: row.postal_code,
              countryCode: row.country_code,
            },
            servicePrice: Number(row.service_price || 0),
            depositAmount: Number(row.deposit_amount || 0),
            currency: row.currency,
            hasAdditionalPatients: additionalPatients.length > 0,
            additionalPatientsCount: additionalPatients.length,
            additionalPatients,
            ...(event === "rescheduled" ? {
              rescheduledFrom: {
                startsAt: options.previousStartsAt || null,
                endsAt: options.previousEndsAt || null,
              },
              changeReason: text(options.reason),
            } : {}),
          },
        };
      Object.assign(payload, ghlRoutingFieldsForPayload(eventName, payload, {
        marketCountryCode: row.country_code,
        marketState: row.state,
        marketCounty: row.county,
        marketCity: row.city,
        stateOperator: record(metadata.stateOperator || metadata.state_operator),
      }));
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-MDN-Event": eventName,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) return { sent: false, reason: `http_${response.status}` as const };
      return { sent: true, status: response.status };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : "request_failed" };
  }
}
