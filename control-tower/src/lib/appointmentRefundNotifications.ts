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

function additionalPatients(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    const split = splitName(record.fullName || record.full_name);
    return {
      ...record,
      firstName: text(record.firstName || record.first_name) || split.firstName,
      lastName: text(record.lastName || record.last_name) || split.lastName,
    };
  });
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function sendAppointmentRefundNotification(opts: {
  appointmentId: string;
  refundId: string;
  reason: string;
  replacementFound: boolean;
}) {
  await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
  const result = await getDbPool().query<{
    webhook_url: string | null;
    reference: string;
    service_name: string;
    starts_at: string;
    timezone: string;
    deposit_amount: string;
    currency: string;
    partner_name: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
	    metadata: unknown;
  }>(
    `select config.partner_notification_webhook_url as webhook_url,
            appointment.public_reference as reference, service.name as service_name,
            appointment.starts_at::text, appointment.timezone,
            appointment.deposit_amount::text, appointment.currency,
            partner.display_name as partner_name,
            customer.full_name as customer_name, customer.email as customer_email, customer.phone as customer_phone,
            appointment.address_line_1, appointment.address_line_2,
	            appointment.city, appointment.county, appointment.state, appointment.postal_code,
	            appointment.metadata
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.partner_profiles partner on partner.id = appointment.partner_profile_id
       left join app.staff_form_configs config on config.organization_id = appointment.organization_id
      where appointment.id = $1
      limit 1`,
    [opts.appointmentId],
  );
  const row = result.rows[0];
  const webhookUrl = text(row?.webhook_url);
	  if (!row || !webhookUrl) return { sent: false, reason: "not_configured" as const };
	  const metadata = record(row.metadata);
	  const patients = additionalPatients(metadata.additional_patients);
	  const customerName = splitName(row.customer_name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const eventName = "customer.appointment.deposit_refunded";
    const idempotencyKey = `${eventName}:${opts.refundId}`;
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
	      hasAdditionalPatients: patients.length > 0,
	      additionalPatientsCount: patients.length,
	      additionalPatients: patients,
        reason: opts.reason,
        replacementFound: opts.replacementFound,
        refund: { id: opts.refundId, amount: Number(row.deposit_amount || 0), currency: row.currency },
	      customer: { name: row.customer_name, fullName: row.customer_name, firstName: customerName.firstName, lastName: customerName.lastName, email: row.customer_email, phone: row.customer_phone },
        appointment: {
          reference: row.reference,
          publicReference: row.reference,
          service: row.service_name,
          startsAt: row.starts_at,
          timezone: row.timezone,
          location: {
            addressLine1: row.address_line_1,
            addressLine2: row.address_line_2,
            city: row.city,
            county: row.county,
            state: row.state,
            postalCode: row.postal_code,
          },
          address: [row.address_line_1, row.address_line_2, row.city, row.county, row.state, row.postal_code].filter(Boolean).join(", "),
        },
        partner: row.partner_name ? { name: row.partner_name, fullName: row.partner_name } : null,
      };
    Object.assign(payload, ghlRoutingFieldsForPayload(eventName, payload, {
      marketCountryCode: "US",
      marketState: row.state,
      marketCounty: row.county,
      marketCity: row.city,
      stateOperator: record(metadata.stateOperator || metadata.state_operator),
    }));
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
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
