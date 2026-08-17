import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type PublicAppointmentConfirmation = {
  reference: string;
  status: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  service: string;
  serviceImageUrl: string;
  serviceImageAlt: string;
  servicePrice: number;
  depositAmount: number;
  amountDueAtVisit: number;
  currency: string;
  paymentStatus: string;
  professional: {
    name: string;
    photoUrl: string;
    publicTitle: string;
    credentials: string;
    accepted: boolean;
  };
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
    latitude?: number;
    longitude?: number;
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
    service_image_url: string;
    service_image_alt: string;
    latitude: string;
    longitude: string;
    professional_name: string | null;
    professional_photo_url: string | null;
    professional_public_title: string | null;
    professional_credentials: string | null;
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
            , service.image_url as service_image_url, service.image_alt as service_image_alt,
            appointment.latitude, appointment.longitude,
            nullif(trim(coalesce(professional.display_name, '')), '') as professional_name,
            coalesce(
              nullif(trim(coalesce(professional.profile_photo_url, '')), ''),
              case when coalesce(professional.profile_photo_data, '') <> ''
                then '/api/public/partner-profile-photo/' || professional.id::text else '' end
            ) as professional_photo_url,
            nullif(trim(coalesce(professional.public_title, '')), '') as professional_public_title,
            nullif(trim(coalesce(professional.professional_credentials, '')), '') as professional_credentials
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.partner_profiles professional on professional.id = appointment.partner_profile_id
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
  const metadataClientReward = stringRecord((metadata as Record<string, unknown>)?.client_reward);
  const metadataAmountDueAtVisit = Number(metadataClientReward.clientAmountDueAtVisit);
  const computedAmountDueAtVisit = metadataAmountDueAtVisit && Number.isFinite(metadataAmountDueAtVisit)
    ? metadataAmountDueAtVisit
    : amount(row.service_price) - amount(row.deposit_amount);
  return {
    reference: row.reference,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    service: row.service_name,
    serviceImageUrl: text(row.service_image_url) || "/brand/care-mobile-iv-at-home.jpeg",
    serviceImageAlt: text(row.service_image_alt) || row.service_name,
    servicePrice: amount(row.service_price),
    depositAmount: amount(row.deposit_amount),
    amountDueAtVisit: Math.max(0, computedAmountDueAtVisit),
    currency: row.currency,
    paymentStatus: text(row.payment_status) || (row.status === "confirmed" ? "paid" : "pending"),
    professional: {
      name: text(row.professional_name) || "My Drip Nurse care professional",
      photoUrl: text(row.professional_photo_url),
      publicTitle: text(row.professional_public_title) || "Mobile wellness professional",
      credentials: text(row.professional_credentials),
      accepted: ["partner_acknowledged", "in_progress", "completed"].includes(row.status),
    },
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
      latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : undefined,
      longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : undefined,
    },
  };
}
