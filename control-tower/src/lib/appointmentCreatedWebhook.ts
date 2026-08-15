import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { ghlRoutingFieldsForEvent, ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";

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
  partner_first_name: string | null; partner_last_name: string | null; partner_phone: string | null;
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
function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}
function amount(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function iso(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString(); }
function currency(value: number, code: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(value); }
  catch { return `$${value.toFixed(2)}`; }
}
function appointmentTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone }).format(new Date(value));
  } catch { return value; }
}
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
type PersonFallback = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
};

function splitPersonName(value: unknown) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePerson(value: unknown, fallback: PersonFallback = {}) {
  const person = record(value);
  const suppliedFullName = firstText(person.fullName, person.full_name, fallback.fullName);
  const splitName = splitPersonName(suppliedFullName);
  const firstName = firstText(person.firstName, person.first_name, fallback.firstName, splitName.firstName);
  const lastName = firstText(person.lastName, person.last_name, fallback.lastName, splitName.lastName);
  const fullName = firstText(
    suppliedFullName,
    [firstName, lastName].filter(Boolean).join(" "),
  );
  const email = firstText(person.email, fallback.email);
  const phone = firstText(person.phone, person.phoneNumber, person.phone_number, fallback.phone);

  return {
    ...person,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    fullName,
    full_name: fullName,
    email,
    phone,
    phoneNumber: phone,
    phone_number: phone,
  };
}

function withBmi(value: unknown, fallback: PersonFallback = {}) {
  const patient = normalizePerson(value, fallback);
  const calculated = bmi(patient);
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
            partner.id::text as partner_id, partner.ghl_user_id as partner_ghl_user_id, partner.email as partner_email,
            partner.display_name as partner_display_name, partner.business_name as partner_business_name,
            partner_application.first_name as partner_first_name,
            partner_application.last_name as partner_last_name,
            partner_application.phone as partner_phone,
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
       left join app.staff_applications partner_application on partner_application.id = partner.application_id
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
  const directoryAttribution = record(metadata.directory_attribution);
  const bookedFromDirectory = directoryAttribution.source === "partner_directory"
    && text(directoryAttribution.partnerProfileId) === text(row.partner_id);
  const primary = record(metadata.primary_patient);
  const patientSource = Object.keys(primary).length ? primary : record(row.customer_metadata);
  const patient = withBmi(patientSource, {
    fullName: row.customer_full_name,
    email: row.customer_email,
    phone: row.customer_phone,
  });
  const additionalPatients = list(metadata.additional_patients).map((person) => withBmi(person));
  const partnerPerson = normalizePerson({}, {
    firstName: row.partner_first_name,
    lastName: row.partner_last_name,
    fullName: row.partner_display_name,
    email: row.partner_email,
    phone: row.partner_phone,
  });
  const partner = row.partner_id ? {
    id: row.partner_id,
    ghlUserId: row.partner_ghl_user_id,
    displayName: row.partner_display_name,
    businessName: row.partner_business_name,
    ...partnerPerson,
    slug: row.partner_slug,
    publicTitle: row.partner_public_title,
    professionalCredentials: row.partner_professional_credentials,
    profilePhotoUrl: row.partner_profile_photo_url,
    websiteStatus: row.partner_website_status,
    coverageAreas: row.partner_coverage,
  } : null;
  const servicePrice = amount(row.service_price); const depositAmount = amount(row.deposit_amount);
  const estimatedEarnings = Math.max(0, Math.round((servicePrice - depositAmount) * 100) / 100);
  const clientReward = record(metadata.client_reward);
  const rewardBenefit = firstText(clientReward.benefit, record(metadata.referral_reward).applied ? "deposit_waiver" : "none");
  const platformFunded = clientReward.platformFunded === true;
  const platformFundedPartnerAmount = platformFunded
    ? amount(clientReward.platformFundedPartnerAmount) || estimatedEarnings
    : 0;
  const clientAmountDueAtVisit = platformFunded ? 0 : estimatedEarnings;
  const platformFundingStatus = platformFunded
    ? firstText(clientReward.platformFundingStatus, "owed_after_completion")
    : "not_applicable";
  const earningsCurrency = row.payment_currency || row.currency;
  const earningsDisplay = `${currency(estimatedEarnings, earningsCurrency)} + tips`;
  const appointmentDateTimeFormatted = appointmentTime(row.starts_at, row.timezone);
  const appointmentOfferUrl = `https://partners.mydripnurse.com/partner-portal/appointments?appointment=${encodeURIComponent(row.id)}&offer=1`;
  const actionRequired = event === "new_booking" || event === "partner_confirmation_required" || event === "appointment_reassigned";
  const smsMessage = actionRequired
    ? `My Drip Nurse: Hi ${partner?.firstName || "Partner"}, a new appointment is available. Earn ${earningsDisplay}. ${row.service_name} · ${appointmentDateTimeFormatted}. Review and accept or decline: ${appointmentOfferUrl}`
    : event === "appointment_accepted" && platformFunded
      ? `My Drip Nurse: Your ${row.service_name} appointment is accepted. This visit is funded by My Drip Nurse. We pay ${currency(platformFundedPartnerAmount, earningsCurrency)} after completion; collect $0 from the patient.`
      : "";
  const payload = {
    event, eventType: event, version: 2, test: false,
    ...ghlRoutingFieldsForEvent(event, {
      marketCountryCode: row.country_code,
      marketState: row.state,
      marketCounty: row.county,
      marketCity: row.city,
      platformFunded,
      stateOperator: record(metadata.stateOperator || metadata.state_operator),
    }),
    idempotencyKey: `appointment.${event}:${row.organization_id}:${row.id}`, occurredAt: new Date().toISOString(),
    organization: { id: row.organization_id, name: row.organization_name, slug: "my-drip-nurse" },
    appointment: {
      id: row.id, publicReference: row.public_reference, status: row.status, selectionMode: row.selection_mode,
      startsAt: iso(row.starts_at), endsAt: iso(row.ends_at), timezone: row.timezone,
      serviceAddress: { addressLine1: row.address_line_1, addressLine2: row.address_line_2, city: row.city, county: row.county, state: row.state, postalCode: row.postal_code, countryCode: row.country_code },
      source: { url: row.source_url, city: row.source_city, county: row.source_county, state: row.source_state },
      service: { id: row.service_id, slug: row.service_slug, name: row.service_name, calendarPublicKey: row.calendar_public_key, price: servicePrice, currency: row.currency, durationMinutes: row.duration_minutes },
      payment: {
        status: row.payment_status || "pending",
        servicePrice,
        depositType: row.deposit_type,
        depositValue: amount(row.deposit_value),
        depositAmount,
        amountDueAtVisit: estimatedEarnings,
        clientAmountDueAtVisit,
        estimatedEarnings,
        platformFunded,
        platformFundedPartnerAmount,
        partnerPayoutSource: platformFunded ? "my_drip_nurse" : "patient",
        platformFundingStatus,
        rewardBenefit,
        tipsEligible: true,
        tipsIncluded: false,
        earningsDisplay,
        currency: earningsCurrency,
        paidAt: row.paid_at ? iso(row.paid_at) : null,
      },
    },
    patient,
    firstName: patient.firstName,
    lastName: patient.lastName,
    hasAdditionalPatients: additionalPatients.length > 0,
    additionalPatientsCount: additionalPatients.length,
    additionalPatients,
    medicalScreening: record(metadata.medical_screening),
    partner,
    patientFirstName: patient.firstName,
    patientLastName: patient.lastName,
    patientPhone: patient.phone,
    patient_first_name: patient.first_name,
    patient_last_name: patient.last_name,
    patient_phone: patient.phone_number,
    partnerFirstName: partner?.firstName ?? "",
    partnerLastName: partner?.lastName ?? "",
    partnerFullName: partner?.fullName ?? "",
    partnerDisplayName: partner?.displayName ?? "",
    partnerBusinessName: partner?.businessName ?? "",
    partnerEmail: partner?.email ?? "",
    partnerPhone: partner?.phone ?? "",
    partnerId: partner?.id ?? "",
    partnerGhlUserId: partner?.ghlUserId ?? "",
    partnerSlug: partner?.slug ?? "",
    partnerPublicTitle: partner?.publicTitle ?? "",
    partnerProfessionalCredentials: partner?.professionalCredentials ?? "",
    partnerProfilePhotoUrl: partner?.profilePhotoUrl ?? "",
    partnerWebsiteStatus: partner?.websiteStatus ?? "",
    partnerWebsiteUrl: partner?.slug ? `https://partners.mydripnurse.com/${partner.slug}` : "",
    partnerCoverageAreas: partner?.coverageAreas ?? [],
    partnerAssigned: Boolean(partner?.id),
    partner_first_name: partner?.first_name ?? "",
    partner_last_name: partner?.last_name ?? "",
    partner_full_name: partner?.full_name ?? "",
    partner_email: partner?.email ?? "",
    partner_phone: partner?.phone_number ?? "",
    serviceName: row.service_name,
    appointmentDateTimeFormatted,
    actionRequired,
    estimatedEarnings,
    estimatedEarningsFormatted: currency(estimatedEarnings, earningsCurrency),
    earningsCurrency,
    tipsEligible: true,
    tipsIncluded: false,
    earningsDisplay,
    clientReward: Object.keys(clientReward).length ? clientReward : null,
    rewardBenefit,
    platformFunded,
    platformFundedPartnerAmount,
    clientAmountDueAtVisit,
    partnerPayoutSource: platformFunded ? "my_drip_nurse" : "patient",
    platformFundingStatus,
    appointmentOfferUrl,
    actionUrl: appointmentOfferUrl,
    smsMessage,
    offer: {
      type: "appointment_offer",
      actionRequired,
      estimatedEarnings,
      estimatedEarningsFormatted: currency(estimatedEarnings, earningsCurrency),
      currency: earningsCurrency,
      tipsEligible: true,
      tipsIncluded: false,
      earningsDisplay,
      actionUrl: appointmentOfferUrl,
      acceptOrDeclineUrl: appointmentOfferUrl,
    },
    notificationChannels: ["email", "sms"],
    attribution: {
      ...record(metadata.attribution || metadata.source),
      bookingSource: bookedFromDirectory ? "partner_directory" : "direct_or_other",
      bookedFromDirectory,
      directoryPartnerProfileId: bookedFromDirectory ? text(directoryAttribution.partnerProfileId) : "",
      directoryAttributedAt: bookedFromDirectory ? text(directoryAttribution.attributedAt) : "",
    },
    bookingSource: bookedFromDirectory ? "partner_directory" : "direct_or_other",
    bookedFromDirectory,
    directoryAttribution: bookedFromDirectory ? directoryAttribution : null,
  };
  Object.assign(payload, ghlRoutingFieldsForPayload(event, payload, {
    marketCountryCode: row.country_code,
    marketState: row.state,
    marketCounty: row.county,
    marketCity: row.city,
    platformFunded,
    stateOperator: record(metadata.stateOperator || metadata.state_operator),
  }));

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
