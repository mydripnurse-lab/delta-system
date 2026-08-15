import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type PublicAppointmentConfirmation = {
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  service: string;
  servicePrice: number;
  depositAmount: number;
  currency: string;
  paymentStatus: string;
  patient: {
    name: string;
    email: string;
    phone: string;
  };
  hasAdditionalPatients: boolean;
  additionalPatientsCount: number;
  additionalPatients: Array<{ name: string; email: string; phone: string }>;
  location: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    county: string;
    state: string;
    postalCode: string;
    countryCode: string;
  };
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function person(value: unknown) {
  const record = stringRecord(value);
  return {
    name: text(record.fullName || `${text(record.firstName)} ${text(record.lastName)}`),
    email: text(record.email),
    phone: text(record.phone),
  };
}

/**
 * Returns only the appointment information a customer needs after checkout.
 * The public reference is the only lookup key exposed in the URL.
 */
export async function getPublicAppointmentConfirmation(reference: string): Promise<PublicAppointmentConfirmation | null> {
  const normalizedReference = text(reference);
  if (!normalizedReference || normalizedReference.length > 80) return null;
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    reference: string;
    status: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    service_name: string;
    service_price: string;
    deposit_amount: string;
    currency: string;
    payment_status: string | null;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    country_code: string;
    metadata: unknown;
  }>(
    `select appointment.public_reference as reference, appointment.status,
            appointment.starts_at::text, appointment.ends_at::text, appointment.timezone,
            service.name as service_name, appointment.service_price::text,
            appointment.deposit_amount::text, appointment.currency,
            payment.status as payment_status,
            customer.full_name as customer_name, customer.email as customer_email,
            customer.phone as customer_phone,
            appointment.address_line_1, appointment.address_line_2,
            appointment.city, appointment.county, appointment.state,
            appointment.postal_code, appointment.country_code, appointment.metadata
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.appointment_payments payment on payment.appointment_id = appointment.id
      where appointment.public_reference = $1
      limit 1`,
    [normalizedReference],
  );
  const row = result.rows[0];
  if (!row) return null;

  const metadata = stringRecord(row.metadata);
  const additionalPatients = Array.isArray(metadata.additional_patients)
    ? metadata.additional_patients.map(person).filter((item) => item.name || item.email || item.phone)
    : [];
  return {
    reference: row.reference,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    service: row.service_name,
    servicePrice: amount(row.service_price),
    depositAmount: amount(row.deposit_amount),
    currency: row.currency,
    paymentStatus: text(row.payment_status) || (row.status === "confirmed" ? "paid" : "pending"),
    patient: {
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
    },
    hasAdditionalPatients: additionalPatients.length > 0,
    additionalPatientsCount: additionalPatients.length,
    additionalPatients,
    location: {
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      city: row.city,
      county: row.county,
      state: row.state,
      postalCode: row.postal_code,
      countryCode: row.country_code,
    },
  };
}
