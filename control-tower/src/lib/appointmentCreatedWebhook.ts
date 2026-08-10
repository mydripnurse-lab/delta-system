import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

type LifecycleEvent =
  | "new_booking"
  | "partner_confirmation_required"
  | "partner_rescheduled"
  | "appointment_accepted"
  | "appointment_declined"
  | "appointment_reassigned"
  | "appointment_completed"
  | "appointment_refunded";

type AppointmentRow = {
  id: string; organization_id: string; organization_name: string; public_reference: string;
  status: string; selection_mode: string; starts_at: string; ends_at: string; timezone: string;
  address_line_1: string; address_line_2: string; city: string; county: string; state: string;
  postal_code: string; country_code: string; source_url: string; source_city: string;
  source_county: string; source_state: string; service_price: string | number;
  deposit_type: string; deposit_value: string | number; deposit_amount: string | number;
  currency: string; created_at: string; service_id: string; service_slug: string;
  service_name: string; calendar_public_key: string; duration_minutes: number;
  customer_full_name: string; customer_email: string; customer_phone: string;
  customer_metadata: unknown; payment_status: string | null; payment_amount: string | number | null;
  payment_currency: string | null; paid_at: string | null; partner_id: string | null;
  partner_ghl_user_id: string | null; partner_email: string | null; partner_display_name: string | null;
  partner_business_name: string | null; partner_slug: string | null; partner_public_title: string | null;
  partner_professional_credentials: string | null; partner_profile_photo_url: string | null;
  partner_website_status: string | null; partner_coverage: unknown; appointment_metadata: unknown;
  new_booking_webhook_url: string | null; partner_confirmation_required_webhook_url: string | null;
  partner_rescheduled_webhook_url: string | null; appointment_accepted_webhook_url: string | null;
  appointment_declined_webhook_url: string | null; appointment_reassigned_webhook_url: string | null;
  appointment_completed_webhook_url: string | null; appointment_refunded_webhook_url: string | null;
  partner_notification_webhook_url: string | null; appointment_created_webhook_url: string | null;
};

const eventConfig: Record<LifecycleEvent, { type: string; field: keyof AppointmentRow; fallback?: keyof AppointmentRow }> = {
  new_booking: { type: "new_booking", field: "new_booking_webhook_url", fallback: "appointment_created_webhook_url" },
  partner_confirmation_required: { type: "partner_confirmation_required", field: "partner_confirmation_required_webhook_url", fallback: "partner_notification_webhook_url" },
  partner_rescheduled: { type: "partner_rescheduled", field: "partner_rescheduled_webhook_url", fallback: "partner_notification_webhook_url" },
  appointment_accepted: { type: "appointment_accepted", field: "appointment_accepted_webhook_url", fallback: "partner_notification_webhook_url" },
  appointment_declined: { type: "appointment_declined", field: "appointment_declined_webhook_url", fallback: "partner_notification_webhook_url" },
  appointment_reassigned: { type: "appointment_reassigned", field: "appointment_reassigned_webhook_url", fallback: "partner_notification_webhook_url" },
  appointment_completed: { type: "appointment_completed", field: "appointment_completed_webhook_url", fallback: "partner_notification_webhook_url" },
  appointment_refunded: { type: "appointment_refunded", field: "appointment_refunded_webhook_url", fallback: "partner_notification_webhook_url" },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return String(value ?? "").trim(); }
function amount(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function iso(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString(); }
function validWebhookUrl(value: unknown) {
  const raw = text(value); if (!raw) return "";
  try { const url = new URL(raw); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; }
}
function excerpt(value: string, max = 1000) { return value.slice(0, max); }

function bmi(patient: Record<string, unknown>) {
  const weight = amount(patient.weight ?? patient.weightLb ?? patient.weight_lbs);
  const height = record(patient.height);
  const feet = amount(height.feet ?? patient.heightFeet ?? patient.height_feet);
  const inches = amount(height.inches ?? patient.heightInches ?? patient.height_inches);
  const totalInches = feet * 12 + inches;
  return weight > 0 && totalInches > 0 ? Math.round((weight * 703 / (totalInches * totalInches)) * 10) / 10 : null;
}
function withBmi(value: unknown) {
  const patient = record(value); const calculated = bmi(patient);
  return calculated == null ? patient : { ...patient, bmi: calculated };
}

async function loadAppointment(appointmentId: string) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const result = await pool.query<AppointmentRow>(
    `select a.id::text, a.organization_id::text, o.name as organization_name, a.public_reference,
            a.status, a.selection_mode, a.starts_at::text, a.ends_at::text, a.timezone,
            a.address_line_1, a.address_line_2, a.city, a.county, a.state, a.postal_code, a.country_code,
            a.source_url, a.source_city, a.source_county, a.source_state, a.service_price,
            a.deposit_type, a.deposit_value, a.deposit_amount, a.currency, a.created_at::text,
            a.metadata as appointment_metadata, s.id::text as service_id, s.slug as service_slug,
            s.name as service_name, c.public_key as calendar_public_key, c.duration_minutes,
            customer.full_name as customer_full_name, customer.email as customer_email, customer.phone as customer_phone,
            customer.metadata as customer_metadata, payment.status as payment_status,
            payment.amount as payment_amount, payment.currency as payment_currency, payment.paid_at::text,
            partner.id::text as partner_id, partner.ghl_user_id, partner.email as partner_email,
            partner.display_name as partner_display_name, partner.business_name as partner_business_name,
            partner.slug as partner_slug, partner.public_title as partner_public_title,
            partner.professional_credentials as partner_professional_credentials,
            partner.profile_photo_url as partner_profile_photo_url, partner.website_status as partner_website_status,
            coalesce((select jsonb_agg(jsonb_build_object('state', area.state, 'county', area.county, 'city', area.city, 'postalCodes', area.postal_codes)
              order by lower(area.state), lower(area.county), lower(coalesce(area.city, '')))
              from app.partner_service_assignments assignment
              join app.partner_coverage_areas area on area.assignment_id = assignment.id and area.status = 'active'
              where assignment.partner_profile_id = a.partner_profile_id and assignment.service_id = a.service_id and assignment.status = 'active'), '[]'::jsonb) as partner_coverage,
            cfg.new_booking_webhook_url, cfg.partner_confirmation_required_webhook_url, cfg.partner_rescheduled_webhook_url,
            cfg.appointment_accepted_webhook_url, cfg.appointment_declined_webhook_url, cfg.appointment_reassigned_webhook_url,
            cfg.appointment_completed_webhook_url, cfg.appointment_refunded_webhook_url,
            cfg.partner_notification_webhook_url, cfg.appointment_created_webhook_url
       from app.appointments a join app.organizations o on o.id = a.organization_id
       join app.booking_customers customer on customer.id = a.customer_id
       join app.services s on s.id = a.service_id join app.service_calendars c on c.id = a.service_calendar_id
       left join app.partner_profiles partner on partner.id = a.partner_profile_id
       left join app.appointment_payments payment on payment.appointment_id = a.id
       left join app.staff_form_configs cfg on cfg.organization_id = a.organization_id
      where a.id = $1::uuid limit 1`, [appointmentId],
  );
  return { pool, row: result.rows[0] };
}

export async function sendAppointmentLifecycleWebhook(appointmentId: string, event: LifecycleEvent) {
  const { pool, row } = await loadAppointment(appointmentId);
  if (!row) return { sent: false as const, reason: "appointment_not_found" as const };
  const config = eventConfig[event];
  const webhookUrl = validWebhookUrl(row[config.field]) || (config.fallback ? validWebhookUrl(row[config.fallback]) : "");
  if (!webhookUrl) return { sent: false as const, reason: "not_configured" as const };

  const metadata = record(row.appointment_metadata);
  const primary = record(metadata.primary_patient);
  const patient = Object.keys(primary).length ? primary : { fullName: row.customer_full_name, email: row.customer_email, phone: row.customer_phone, ...record(row.customer_metadata) };
  const servicePrice = amount(row.service_price); const depositAmount = amount(row.deposit_amount);
  const payload = {
    event, eventType: event, version: 1, test: false,
    idempotencyKey: `appointment.${event}:${row.organization_id}:${row.id}`, occurredAt: new Date().toISOString(),
    organization: { id: row.organization_id, name: row.organization_name, slug: "my-drip-nurse" },
    appointment: {
      id: row.id, publicReference: row.public_reference, status: row.status, selectionMode: row.selection_mode,
      startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), timezone: row.timezone,
      serviceAddress: { addressLine1: row.address_line_1, addressLine2: row.address_line_2, city: row.city, county: row.county, state: row.state, postalCode: row.postal_code, countryCode: row.country_code },
      source: { url: row.source_url, city: row.source_city, county: row.source_county, state: row.source_state },
      service: { id: row.service_id, slug: row.service_slug, name: row.service_name, calendarPublicKey: row.calendar_public_key, price: servicePrice, currency: row.currency, durationMinutes: row.duration_minutes },
      payment: { status: row.payment_status || "pending", servicePrice, depositType: row.deposit_type, depositValue: amount(row.deposit_value), depositAmount, amountDueAtVisit: Math.max(0, Math.round((servicePrice - depositAmount) * 100) / 100), currency: row.payment_currency || row.currency, paidAt: row.paid_at ? iso(row.paid_at) : null },
    },
    patient: withBmi(patient), additionalPatients: list(metadata.additional_patients).map(withBmi), medicalScreening: record(metadata.medical_screening),
    partner: row.partner_id ? { id: row.partner_id, ghlUserId: row.partner_ghl_user_id, displayName: row.partner_display_name, businessName: row.partner_business_name, email: row.partner_email, slug: row.partner_slug, publicTitle: row.partner_public_title, professionalCredentials: row.partner_professional_credentials, profilePhotoUrl: row.partner_profile_photo_url, websiteStatus: row.partner_website_status, coverageAreas: row.partner_coverage } : null,
    notificationChannels: ["email", "sms"], attribution: record(metadata.attribution || metadata.source),
  };

  const reserved = await pool.query<{ id: string }>(
    `insert into app.appointment_webhook_events (organization_id, appointment_id, event_type, idempotency_key, webhook_url, status)
     values ($1::uuid, $2::uuid, $3, $4, $5, 'pending') on conflict (organization_id, appointment_id, event_type) do nothing returning id`,
    [row.organization_id, row.id, `appointment.${event}`, payload.idempotencyKey, webhookUrl],
  );
  if (!reserved.rows[0]) return { sent: false as const, reason: "already_reserved" as const };
  const eventId = reserved.rows[0].id; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/json", "x-mdn-event": event }, body: JSON.stringify(payload), cache: "no-store", signal: controller.signal });
    const responseText = await response.text();
    await pool.query(`update app.appointment_webhook_events set status=$2, http_status=$3, response_excerpt=$4, error_message='', sent_at=case when $2='sent' then now() else null end, updated_at=now() where id=$1`, [eventId, response.ok ? "sent" : "failed", response.status, excerpt(responseText)]);
    return { sent: response.ok as boolean, httpStatus: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook request failed.";
    await pool.query(`update app.appointment_webhook_events set status='failed', error_message=$2, updated_at=now() where id=$1`, [eventId, excerpt(message)]);
    console.error(`Appointment ${event} webhook request failed`, error); return { sent: false as const, reason: "request_failed" as const };
  } finally { clearTimeout(timeout); }
}

export async function sendAppointmentCreatedWebhook(appointmentId: string) {
  return sendAppointmentLifecycleWebhook(appointmentId, "new_booking");
}
