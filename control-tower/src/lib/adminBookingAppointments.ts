import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type AdminBookingAppointment = {
  id: string;
  reference: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  selectionMode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDateOfBirth: string;
  additionalPatients: Array<{ fullName: string; email: string; phone: string; dateOfBirth: string }>;
  address: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  partnerName: string;
  partnerEmail: string;
  servicePrice: number;
  depositAmount: number;
  currency: string;
  paymentStatus: string;
  paymentIntentId: string;
  partnerDeclineReason: string;
  pushDeviceCount: number;
  lastReminderAt: string;
  bookedFromDirectory: boolean;
  bookingSource: "partner_directory" | "direct_or_other";
  directoryAttributedAt: string;
  createdAt: string;
};

const STATUS_FILTERS = new Set([
  "payment_pending",
  "confirmed",
  "partner_acknowledged",
  "in_progress",
  "completed",
  "partner_declined",
  "cancelled",
  "refunded",
  "failed",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

export async function listAdminBookingAppointments(options: {
  search?: string;
  status?: string;
  limit?: number;
} = {}) {
  await ensureBookingEngineSchema();
  const values: unknown[] = [];
  const conditions: string[] = [];
  const search = text(options.search);
  const status = text(options.status);
  const limit = Math.min(500, Math.max(1, Number(options.limit || 250)));

  if (STATUS_FILTERS.has(status)) {
    values.push(status);
    conditions.push(`appointment.status = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    conditions.push(`(
      appointment.public_reference ilike ${parameter}
      or appointment.id::text ilike ${parameter}
      or customer.full_name ilike ${parameter}
      or customer.email ilike ${parameter}
      or service.name ilike ${parameter}
      or coalesce(partner.display_name, '') ilike ${parameter}
      or appointment.city ilike ${parameter}
      or appointment.county ilike ${parameter}
      or appointment.state ilike ${parameter}
    )`);
  }

  values.push(limit);
  const result = await getDbPool().query<{
    id: string;
    public_reference: string;
    service_name: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    status: string;
    selection_mode: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    metadata: {
      primary_patient?: { dateOfBirth?: string };
      additional_patients?: Array<{ fullName?: string; email?: string; phone?: string; dateOfBirth?: string }>;
      directory_attribution?: { source?: string; partnerProfileId?: string; attributedAt?: string };
    } | null;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    partner_name: string | null;
    partner_email: string | null;
    service_price: string;
    deposit_amount: string;
    currency: string;
    payment_status: string | null;
    payment_intent_id: string | null;
    partner_decline_reason: string;
    push_device_count: string;
    last_reminder_at: string | null;
    created_at: string;
  }>(
    `select appointment.id,
            appointment.public_reference,
            service.name as service_name,
            appointment.starts_at::text,
            appointment.ends_at::text,
            appointment.timezone,
            appointment.status,
            appointment.selection_mode,
            customer.full_name as customer_name,
            customer.email as customer_email,
            customer.phone as customer_phone,
            appointment.metadata,
            appointment.address_line_1,
            appointment.address_line_2,
            appointment.city,
            appointment.county,
            appointment.state,
            appointment.postal_code,
            partner.display_name as partner_name,
            partner.email as partner_email,
            appointment.service_price::text,
            appointment.deposit_amount::text,
            appointment.currency,
            payment.status as payment_status,
            payment.payment_intent_id,
            appointment.partner_decline_reason,
            (select count(*)::text
               from app.partner_push_subscriptions push_subscription
              where push_subscription.partner_profile_id = appointment.partner_profile_id
                and push_subscription.enabled = true) as push_device_count,
            (select max(notification.created_at)::text
               from app.partner_portal_notifications notification
              where notification.appointment_id = appointment.id
                and notification.event_key like 'admin_reminder:%') as last_reminder_at,
            appointment.created_at::text
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
       left join app.partner_profiles partner on partner.id = appointment.partner_profile_id
       left join app.appointment_payments payment on payment.appointment_id = appointment.id
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by appointment.starts_at desc
      limit $${values.length}`,
    values,
  );

  return result.rows.map((row): AdminBookingAppointment => {
    const bookedFromDirectory = row.metadata?.directory_attribution?.source === "partner_directory";
    return {
      id: row.id,
      reference: row.public_reference,
      serviceName: row.service_name,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      status: row.status,
      selectionMode: row.selection_mode,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      customerPhone: row.customer_phone,
      customerDateOfBirth: row.metadata?.primary_patient?.dateOfBirth || "",
      additionalPatients: (row.metadata?.additional_patients || []).map((patient) => ({
        fullName: patient.fullName || "Additional patient",
        email: patient.email || "",
        phone: patient.phone || "",
        dateOfBirth: patient.dateOfBirth || "",
      })),
      address: [row.address_line_1, row.address_line_2].filter(Boolean).join(", "),
      city: row.city,
      county: row.county,
      state: row.state,
      postalCode: row.postal_code,
      partnerName: text(row.partner_name),
      partnerEmail: text(row.partner_email),
      servicePrice: number(row.service_price),
      depositAmount: number(row.deposit_amount),
      currency: row.currency,
      paymentStatus: text(row.payment_status) || "pending",
      paymentIntentId: text(row.payment_intent_id),
      partnerDeclineReason: text(row.partner_decline_reason),
      pushDeviceCount: number(row.push_device_count),
      lastReminderAt: text(row.last_reminder_at),
      bookedFromDirectory,
      bookingSource: bookedFromDirectory ? "partner_directory" : "direct_or_other",
      directoryAttributedAt: bookedFromDirectory ? text(row.metadata?.directory_attribution?.attributedAt) : "",
      createdAt: row.created_at,
    };
  });
}
