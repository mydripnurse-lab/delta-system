import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

const DEFAULT_ADMIN_BASE_URL = "https://admin.mydripnurse.com";

function s(value: unknown) {
  return String(value ?? "").trim();
}

function validatedUrl(value: unknown, label: string, options?: { required?: boolean }) {
  const raw = s(value);
  if (!raw) {
    if (options?.required) throw new Error(`${label} is required.`);
    return "";
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && isLocal)) {
    throw new Error(`${label} must use HTTPS.`);
  }

  return url.toString().replace(/\/$/, "");
}

type SettingsRow = {
  organization_id: string;
  organization_name: string;
  form_key: string;
  enabled: boolean;
  webhook_url: string | null;
  applicant_received_webhook_url: string | null;
  admin_notification_webhook_url: string | null;
  partner_notification_webhook_url: string | null;
  lead_capture_webhook_url: string | null;
  appointment_created_webhook_url: string | null;
  new_booking_webhook_url: string | null;
  partner_confirmation_required_webhook_url: string | null;
  partner_rescheduled_webhook_url: string | null;
  appointment_accepted_webhook_url: string | null;
  appointment_declined_webhook_url: string | null;
  appointment_reassigned_webhook_url: string | null;
  appointment_completed_webhook_url: string | null;
  appointment_refunded_webhook_url: string | null;
  admin_base_url: string | null;
  affiliate_commission_rate: string | number | null;
  updated_at: string;
};

export type PartnerAdminWebhookSummary = {
  target: "account_ready" | "applicant_received" | "admin_notification" | "partner_notification" | "lead_capture" | "appointment_created" | "new_booking" | "partner_confirmation_required" | "partner_rescheduled" | "appointment_accepted" | "appointment_declined" | "appointment_reassigned" | "appointment_completed" | "appointment_refunded";
  label: string;
  configured: boolean;
  endpoint: string;
};

export type PartnerAdminNotificationSettings = {
  tenantId: string;
  tenantName: string;
  formKey: string;
  enabled: boolean;
  applicantReceivedWebhookUrl: string;
  adminNotificationWebhookUrl: string;
  partnerNotificationWebhookUrl: string;
  leadCaptureWebhookUrl: string;
  appointmentCreatedWebhookUrl: string;
  newBookingWebhookUrl: string;
  partnerConfirmationRequiredWebhookUrl: string;
  partnerRescheduledWebhookUrl: string;
  appointmentAcceptedWebhookUrl: string;
  appointmentDeclinedWebhookUrl: string;
  appointmentReassignedWebhookUrl: string;
  appointmentCompletedWebhookUrl: string;
  appointmentRefundedWebhookUrl: string;
  applicantReceivedWebhookConfigured: boolean;
  adminNotificationWebhookConfigured: boolean;
  partnerNotificationWebhookConfigured: boolean;
  leadCaptureWebhookConfigured: boolean;
  appointmentCreatedWebhookConfigured: boolean;
  newBookingWebhookConfigured: boolean;
  partnerConfirmationRequiredWebhookConfigured: boolean;
  partnerRescheduledWebhookConfigured: boolean;
  appointmentAcceptedWebhookConfigured: boolean;
  appointmentDeclinedWebhookConfigured: boolean;
  appointmentReassignedWebhookConfigured: boolean;
  appointmentCompletedWebhookConfigured: boolean;
  appointmentRefundedWebhookConfigured: boolean;
  webhooks: PartnerAdminWebhookSummary[];
  adminBaseUrl: string;
  affiliateCommissionRate: number;
  updatedAt: string;
};

function safeWebhookEndpoint(value: unknown) {
  const raw = s(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const path = url.pathname.length > 18
      ? `${url.pathname.slice(0, 10)}…${url.pathname.slice(-6)}`
      : url.pathname;
    return `${url.origin}${path}`;
  } catch {
    return "Stored securely";
  }
}

function safeSettings(row: SettingsRow): PartnerAdminNotificationSettings {
  return {
    tenantId: row.organization_id,
    tenantName: row.organization_name,
    formKey: row.form_key,
    enabled: Boolean(row.enabled),
    applicantReceivedWebhookUrl: s(row.applicant_received_webhook_url),
    adminNotificationWebhookUrl: s(row.admin_notification_webhook_url),
    partnerNotificationWebhookUrl: s(row.partner_notification_webhook_url),
    leadCaptureWebhookUrl: s(row.lead_capture_webhook_url),
    appointmentCreatedWebhookUrl: s(row.appointment_created_webhook_url),
    newBookingWebhookUrl: s(row.new_booking_webhook_url),
    partnerConfirmationRequiredWebhookUrl: s(row.partner_confirmation_required_webhook_url),
    partnerRescheduledWebhookUrl: s(row.partner_rescheduled_webhook_url),
    appointmentAcceptedWebhookUrl: s(row.appointment_accepted_webhook_url),
    appointmentDeclinedWebhookUrl: s(row.appointment_declined_webhook_url),
    appointmentReassignedWebhookUrl: s(row.appointment_reassigned_webhook_url),
    appointmentCompletedWebhookUrl: s(row.appointment_completed_webhook_url),
    appointmentRefundedWebhookUrl: s(row.appointment_refunded_webhook_url),
    applicantReceivedWebhookConfigured: Boolean(s(row.applicant_received_webhook_url)),
    adminNotificationWebhookConfigured: Boolean(s(row.admin_notification_webhook_url)),
    partnerNotificationWebhookConfigured: Boolean(s(row.partner_notification_webhook_url)),
    leadCaptureWebhookConfigured: Boolean(s(row.lead_capture_webhook_url)),
    appointmentCreatedWebhookConfigured: Boolean(s(row.appointment_created_webhook_url)),
    newBookingWebhookConfigured: Boolean(s(row.new_booking_webhook_url)),
    partnerConfirmationRequiredWebhookConfigured: Boolean(s(row.partner_confirmation_required_webhook_url)),
    partnerRescheduledWebhookConfigured: Boolean(s(row.partner_rescheduled_webhook_url)),
    appointmentAcceptedWebhookConfigured: Boolean(s(row.appointment_accepted_webhook_url)),
    appointmentDeclinedWebhookConfigured: Boolean(s(row.appointment_declined_webhook_url)),
    appointmentReassignedWebhookConfigured: Boolean(s(row.appointment_reassigned_webhook_url)),
    appointmentCompletedWebhookConfigured: Boolean(s(row.appointment_completed_webhook_url)),
    appointmentRefundedWebhookConfigured: Boolean(s(row.appointment_refunded_webhook_url)),
    webhooks: [
      { target: "account_ready", label: "Account-ready welcome", configured: Boolean(s(row.webhook_url)), endpoint: safeWebhookEndpoint(row.webhook_url) },
      { target: "applicant_received", label: "Application received", configured: Boolean(s(row.applicant_received_webhook_url)), endpoint: safeWebhookEndpoint(row.applicant_received_webhook_url) },
      { target: "admin_notification", label: "Administrator alert", configured: Boolean(s(row.admin_notification_webhook_url)), endpoint: safeWebhookEndpoint(row.admin_notification_webhook_url) },
      { target: "partner_notification", label: "Appointment lifecycle + refunds", configured: Boolean(s(row.partner_notification_webhook_url)), endpoint: safeWebhookEndpoint(row.partner_notification_webhook_url) },
      { target: "lead_capture", label: "Booking lead capture", configured: Boolean(s(row.lead_capture_webhook_url)), endpoint: safeWebhookEndpoint(row.lead_capture_webhook_url) },
      { target: "appointment_created", label: "Appointment created for GHL", configured: Boolean(s(row.appointment_created_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_created_webhook_url) },
      { target: "new_booking", label: "New booking", configured: Boolean(s(row.new_booking_webhook_url)), endpoint: safeWebhookEndpoint(row.new_booking_webhook_url) },
      { target: "partner_confirmation_required", label: "Partner confirmation required", configured: Boolean(s(row.partner_confirmation_required_webhook_url)), endpoint: safeWebhookEndpoint(row.partner_confirmation_required_webhook_url) },
      { target: "partner_rescheduled", label: "Partner rescheduled", configured: Boolean(s(row.partner_rescheduled_webhook_url)), endpoint: safeWebhookEndpoint(row.partner_rescheduled_webhook_url) },
      { target: "appointment_accepted", label: "Appointment accepted", configured: Boolean(s(row.appointment_accepted_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_accepted_webhook_url) },
      { target: "appointment_declined", label: "Appointment declined", configured: Boolean(s(row.appointment_declined_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_declined_webhook_url) },
      { target: "appointment_reassigned", label: "Appointment reassigned", configured: Boolean(s(row.appointment_reassigned_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_reassigned_webhook_url) },
      { target: "appointment_completed", label: "Appointment completed", configured: Boolean(s(row.appointment_completed_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_completed_webhook_url) },
      { target: "appointment_refunded", label: "Appointment refunded", configured: Boolean(s(row.appointment_refunded_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_refunded_webhook_url) },
    ],
    adminBaseUrl: s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL,
    affiliateCommissionRate: Number(row.affiliate_commission_rate ?? 2) || 2,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

const SETTINGS_SELECT = `
  select c.organization_id::text,
         o.name as organization_name,
         c.form_key,
         c.enabled,
         c.webhook_url,
         c.applicant_received_webhook_url,
         c.admin_notification_webhook_url,
         c.partner_notification_webhook_url,
         c.lead_capture_webhook_url,
         c.appointment_created_webhook_url,
         c.new_booking_webhook_url,
         c.partner_confirmation_required_webhook_url,
         c.partner_rescheduled_webhook_url,
         c.appointment_accepted_webhook_url,
         c.appointment_declined_webhook_url,
         c.appointment_reassigned_webhook_url,
         c.appointment_completed_webhook_url,
         c.appointment_refunded_webhook_url,
         c.admin_base_url,
         c.affiliate_commission_rate,
         c.updated_at::text
    from app.staff_form_configs c
    join app.organizations o on o.id = c.organization_id and o.slug = 'my-drip-nurse'
`;

export async function listPartnerAdminNotificationSettings() {
  await ensureStaffSchema();
  const query = await getDbPool().query<SettingsRow>(`${SETTINGS_SELECT} order by o.name asc`);
  return query.rows.map(safeSettings);
}

export async function savePartnerAdminNotificationSettings(input: {
  tenantId: string;
  applicantReceivedWebhookUrl?: string;
  adminNotificationWebhookUrl?: string;
  partnerNotificationWebhookUrl?: string;
  leadCaptureWebhookUrl?: string;
  appointmentCreatedWebhookUrl?: string;
  newBookingWebhookUrl?: string;
  partnerConfirmationRequiredWebhookUrl?: string;
  partnerRescheduledWebhookUrl?: string;
  appointmentAcceptedWebhookUrl?: string;
  appointmentDeclinedWebhookUrl?: string;
  appointmentReassignedWebhookUrl?: string;
  appointmentCompletedWebhookUrl?: string;
  appointmentRefundedWebhookUrl?: string;
  adminBaseUrl: string;
  clearApplicantWebhook?: boolean;
  clearAdminWebhook?: boolean;
  clearPartnerWebhook?: boolean;
  clearLeadCaptureWebhook?: boolean;
  clearAppointmentCreatedWebhook?: boolean;
  clearNewBookingWebhook?: boolean;
  clearPartnerConfirmationRequiredWebhook?: boolean;
  clearPartnerRescheduledWebhook?: boolean;
  clearAppointmentAcceptedWebhook?: boolean;
  clearAppointmentDeclinedWebhook?: boolean;
  clearAppointmentReassignedWebhook?: boolean;
  clearAppointmentCompletedWebhook?: boolean;
  clearAppointmentRefundedWebhook?: boolean;
  affiliateCommissionRate?: number;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");

  const applicantWebhook = validatedUrl(
    input.applicantReceivedWebhookUrl,
    "Applicant received webhook",
  );
  const adminWebhook = validatedUrl(
    input.adminNotificationWebhookUrl,
    "Admin notification webhook",
  );
  const partnerWebhook = validatedUrl(
    input.partnerNotificationWebhookUrl,
    "Partner notification webhook",
  );
  const leadCaptureWebhook = validatedUrl(
    input.leadCaptureWebhookUrl,
    "Lead capture webhook",
  );
  const appointmentCreatedWebhook = validatedUrl(
    input.appointmentCreatedWebhookUrl,
    "Appointment-created webhook",
  );
  const newBookingWebhook = validatedUrl(input.newBookingWebhookUrl, "New booking webhook");
  const partnerConfirmationRequiredWebhook = validatedUrl(input.partnerConfirmationRequiredWebhookUrl, "Partner confirmation required webhook");
  const partnerRescheduledWebhook = validatedUrl(input.partnerRescheduledWebhookUrl, "Partner rescheduled webhook");
  const appointmentAcceptedWebhook = validatedUrl(input.appointmentAcceptedWebhookUrl, "Appointment accepted webhook");
  const appointmentDeclinedWebhook = validatedUrl(input.appointmentDeclinedWebhookUrl, "Appointment declined webhook");
  const appointmentReassignedWebhook = validatedUrl(input.appointmentReassignedWebhookUrl, "Appointment reassigned webhook");
  const appointmentCompletedWebhook = validatedUrl(input.appointmentCompletedWebhookUrl, "Appointment completed webhook");
  const appointmentRefundedWebhook = validatedUrl(input.appointmentRefundedWebhookUrl, "Appointment refunded webhook");
  const adminBaseUrl = validatedUrl(input.adminBaseUrl, "Admin base URL", { required: true });
  const affiliateCommissionRate = Number(input.affiliateCommissionRate ?? 2);
  if (!Number.isFinite(affiliateCommissionRate) || affiliateCommissionRate < 0 || affiliateCommissionRate > 100) {
    throw new Error("Affiliate commission rate must be between 0 and 100.");
  }

  const query = await getDbPool().query<SettingsRow>(
    `update app.staff_form_configs c
       set applicant_received_webhook_url = case
              when $16::boolean then null
              when nullif($2::text, '') is not null then $2::text
              else c.applicant_received_webhook_url
            end,
            admin_notification_webhook_url = case
              when $17::boolean then null
              when nullif($3::text, '') is not null then $3::text
              else c.admin_notification_webhook_url
            end,
            partner_notification_webhook_url = case
              when $18::boolean then null
              when nullif($4::text, '') is not null then $4::text
              else c.partner_notification_webhook_url
            end,
            lead_capture_webhook_url = case
              when $19::boolean then null
              when nullif($5::text, '') is not null then $5::text
              else c.lead_capture_webhook_url
            end,
            appointment_created_webhook_url = case
              when $20::boolean then null
              when nullif($6::text, '') is not null then $6::text
              else c.appointment_created_webhook_url
            end,
            new_booking_webhook_url = case
              when $21::boolean then null
              when nullif($7::text, '') is not null then $7::text
              else c.new_booking_webhook_url
            end,
            partner_confirmation_required_webhook_url = case
              when $22::boolean then null
              when nullif($8::text, '') is not null then $8::text
              else c.partner_confirmation_required_webhook_url
            end,
            partner_rescheduled_webhook_url = case
              when $23::boolean then null
              when nullif($9::text, '') is not null then $9::text
              else c.partner_rescheduled_webhook_url
            end,
            appointment_accepted_webhook_url = case
              when $24::boolean then null
              when nullif($10::text, '') is not null then $10::text
              else c.appointment_accepted_webhook_url
            end,
            appointment_declined_webhook_url = case
              when $25::boolean then null
              when nullif($11::text, '') is not null then $11::text
              else c.appointment_declined_webhook_url
            end,
            appointment_reassigned_webhook_url = case
              when $26::boolean then null
              when nullif($12::text, '') is not null then $12::text
              else c.appointment_reassigned_webhook_url
            end,
            appointment_completed_webhook_url = case
              when $27::boolean then null
              when nullif($13::text, '') is not null then $13::text
              else c.appointment_completed_webhook_url
            end,
            appointment_refunded_webhook_url = case
              when $28::boolean then null
              when nullif($14::text, '') is not null then $14::text
              else c.appointment_refunded_webhook_url
            end,
            admin_base_url = $15,
            affiliate_commission_rate = $29,
            updated_at = now()
       from app.organizations o
      where c.organization_id = $1::uuid
        and o.id = c.organization_id
        and o.slug = 'my-drip-nurse'
      returning c.organization_id::text,
                o.name as organization_name,
                c.form_key,
                c.enabled,
                c.webhook_url,
                c.applicant_received_webhook_url,
                c.admin_notification_webhook_url,
                c.partner_notification_webhook_url,
                c.lead_capture_webhook_url,
                c.appointment_created_webhook_url,
                c.new_booking_webhook_url,
                c.partner_confirmation_required_webhook_url,
                c.partner_rescheduled_webhook_url,
                c.appointment_accepted_webhook_url,
                c.appointment_declined_webhook_url,
                c.appointment_reassigned_webhook_url,
                c.appointment_completed_webhook_url,
                c.appointment_refunded_webhook_url,
                c.admin_base_url,
                c.affiliate_commission_rate,
                c.updated_at::text`,
    [
      tenantId,
      applicantWebhook,
      adminWebhook,
      partnerWebhook,
      leadCaptureWebhook,
      appointmentCreatedWebhook,
      newBookingWebhook,
      partnerConfirmationRequiredWebhook,
      partnerRescheduledWebhook,
      appointmentAcceptedWebhook,
      appointmentDeclinedWebhook,
      appointmentReassignedWebhook,
      appointmentCompletedWebhook,
      appointmentRefundedWebhook,
      adminBaseUrl,
      Boolean(input.clearApplicantWebhook),
      Boolean(input.clearAdminWebhook),
      Boolean(input.clearPartnerWebhook),
      Boolean(input.clearLeadCaptureWebhook),
      Boolean(input.clearAppointmentCreatedWebhook),
      Boolean(input.clearNewBookingWebhook),
      Boolean(input.clearPartnerConfirmationRequiredWebhook),
      Boolean(input.clearPartnerRescheduledWebhook),
      Boolean(input.clearAppointmentAcceptedWebhook),
      Boolean(input.clearAppointmentDeclinedWebhook),
      Boolean(input.clearAppointmentReassignedWebhook),
      Boolean(input.clearAppointmentCompletedWebhook),
      Boolean(input.clearAppointmentRefundedWebhook),
      affiliateCommissionRate,
    ],
  );

  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");
  return safeSettings(row);
}

export type PartnerAdminWebhookTarget =
  | "applicant_received"
  | "admin_notification"
  | "partner_notification"
  | "lead_capture"
  | "appointment_created"
  | "new_booking"
  | "partner_confirmation_required"
  | "partner_rescheduled"
  | "appointment_accepted"
  | "appointment_declined"
  | "appointment_reassigned"
  | "appointment_completed"
  | "appointment_refunded";

export async function testPartnerAdminNotificationWebhook(input: {
  tenantId: string;
  target: PartnerAdminWebhookTarget;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");
  const lifecycleTargets = [
    "new_booking",
    "partner_confirmation_required",
    "partner_rescheduled",
    "appointment_accepted",
    "appointment_declined",
    "appointment_reassigned",
    "appointment_completed",
    "appointment_refunded",
  ] as const;
  if (input.target !== "appointment_created" && !(["applicant_received", "admin_notification", "partner_notification", "lead_capture", ...lifecycleTargets] as string[]).includes(input.target)) {
    throw new Error("Invalid webhook target.");
  }

  const query = await getDbPool().query<SettingsRow>(
    `${SETTINGS_SELECT} where c.organization_id = $1::uuid limit 1`,
    [tenantId],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");

  const lifecycleWebhookColumns: Record<(typeof lifecycleTargets)[number], keyof SettingsRow> = {
    new_booking: "new_booking_webhook_url",
    partner_confirmation_required: "partner_confirmation_required_webhook_url",
    partner_rescheduled: "partner_rescheduled_webhook_url",
    appointment_accepted: "appointment_accepted_webhook_url",
    appointment_declined: "appointment_declined_webhook_url",
    appointment_reassigned: "appointment_reassigned_webhook_url",
    appointment_completed: "appointment_completed_webhook_url",
    appointment_refunded: "appointment_refunded_webhook_url",
  };
  const webhookUrl = input.target === "applicant_received"
    ? s(row.applicant_received_webhook_url)
    : input.target === "admin_notification" ? s(row.admin_notification_webhook_url)
      : input.target === "partner_notification" ? s(row.partner_notification_webhook_url)
        : input.target === "appointment_created" ? s(row.appointment_created_webhook_url)
          : lifecycleTargets.includes(input.target as (typeof lifecycleTargets)[number])
            ? s(row[lifecycleWebhookColumns[input.target as (typeof lifecycleTargets)[number]]])
            : s(row.lead_capture_webhook_url);
  if (!webhookUrl) throw new Error("This webhook has not been configured yet.");

  const submittedAt = new Date().toISOString();
  const adminBaseUrl = s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL;
  const payload = input.target === "applicant_received"
    ? {
        event: "partner.application.received.test",
        success: true,
        test: true,
        submittedAt,
        applicant: {
          firstName: "Test",
          lastName: "Applicant",
          email: "test-applicant@mydripnurse.com",
          phone: "+1 555 010 0100",
          company: "My Drip Nurse Test",
        },
        coverage: [{ state: "Florida", county: "Orange County", locationId: "test-location-id" }],
      }
    : input.target === "admin_notification" ? {
        event: "partner.application.admin_notification.test",
        success: true,
        test: true,
        submittedAt,
        applicant: {
          fullName: "Test Applicant",
          email: "test-applicant@mydripnurse.com",
          company: "My Drip Nurse Test",
        },
        requestedCounties: ["Orange County, Florida"],
        adminProfileUrl: `${adminBaseUrl}/applications/test-application-id`,
      } : input.target === "partner_notification" ? {
        event: "partner.appointment.notification.test",
        test: true,
        submittedAt,
        partner: { displayName: "Fabian Castro", email: "fabianjcp57@hotmail.com" },
        appointment: {
          status: "confirmed",
          service: "Hydration",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          address: "Test address, Lufkin, TX",
        },
        notificationChannels: ["email", "sms"],
        note: "Use the event field in GHL to route email or SMS notifications.",
      } : input.target === "appointment_created" ? {
        event: "appointment.created.test",
        version: 1,
        success: true,
        test: true,
        idempotencyKey: "appointment.created.test",
        occurredAt: submittedAt,
        organization: { name: row.organization_name, id: row.organization_id },
        appointment: {
          id: "test-appointment-id",
          publicReference: "MDN-TEST123456",
          status: "payment_pending",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          timezone: "America/New_York",
          service: { id: "test-service-id", slug: "hydration", name: "Hydration", calendarPublicKey: "test-calendar", price: 219, currency: "USD", durationMinutes: 60 },
          payment: { status: "pending", servicePrice: 219, depositType: "percentage", depositValue: 35, depositAmount: 76.65, amountDueAtVisit: 142.35, currency: "USD" },
          serviceAddress: { addressLine1: "100 Main Street", city: "Orlando", county: "Orange County", state: "Florida", postalCode: "32801", countryCode: "US" },
          source: { url: "https://example.com/orlando/hydration", city: "Orlando", county: "Orange County", state: "Florida" },
        },
        patient: { fullName: "Test Patient", email: "test-patient@mydripnurse.com", phone: "+1 555 010 0100", dateOfBirth: "1980-01-01", weight: "180 lb", height: { feet: 5, inches: 10 } },
        additionalPatients: [],
        medicalScreening: { eligible: true, selected: ["none"] },
        partner: { id: "test-partner-id", displayName: "Fabian Castro", email: "fabianjcp57@hotmail.com", coverageAreas: [] },
        notificationChannels: ["email", "sms"],
        note: "Safe test only. No real appointment or patient record was sent.",
      } : lifecycleTargets.includes(input.target as (typeof lifecycleTargets)[number]) ? {
        event: `appointment.${input.target}.test`,
        eventType: input.target,
        version: 1,
        success: true,
        test: true,
        idempotencyKey: `appointment.${input.target}.test`,
        occurredAt: submittedAt,
        organization: { name: row.organization_name, id: row.organization_id },
        appointment: {
          id: "test-appointment-id",
          publicReference: "MDN-TEST123456",
          status: input.target === "appointment_completed" ? "completed"
            : input.target === "appointment_declined" ? "declined"
              : input.target === "appointment_refunded" ? "refunded"
                : input.target === "appointment_reassigned" ? "confirmed"
                  : "confirmed",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          timezone: "America/New_York",
          service: { id: "test-service-id", slug: "hydration", name: "Hydration", calendarPublicKey: "test-calendar", price: 219, currency: "USD", durationMinutes: 60 },
          payment: { status: "paid", servicePrice: 219, depositType: "percentage", depositValue: 35, depositAmount: 76.65, amountDueAtVisit: 142.35, currency: "USD" },
          serviceAddress: { addressLine1: "100 Main Street", city: "Orlando", county: "Orange County", state: "Florida", postalCode: "32801", countryCode: "US" },
          source: { url: "https://example.com/orlando/hydration", city: "Orlando", county: "Orange County", state: "Florida" },
        },
        patient: { fullName: "Test Patient", email: "test-patient@mydripnurse.com", phone: "+1 555 010 0100", dateOfBirth: "1980-01-01", weight: "180 lb", height: { feet: 5, inches: 10 }, bmi: 25.8 },
        additionalPatients: [],
        medicalScreening: { eligible: true, selected: ["none"] },
        partner: { id: "test-partner-id", displayName: "Fabian Castro", email: "fabianjcp57@hotmail.com", coverageAreas: [] },
        notificationChannels: ["email", "sms"],
        note: "Safe lifecycle webhook test. No real appointment or patient record was sent.",
      } : {
        event: "booking.lead.created.test",
        success: true,
        test: true,
        idempotencyKey: "test-lead-event",
        capturedAt: submittedAt,
        lead: {
          fullName: "Test Patient",
          email: "test-patient@mydripnurse.com",
          phone: "+1 555 010 0100",
          dateOfBirth: "1980-01-01",
        },
        screening: { eligible: true, selected: ["none"] },
        service: { name: "Hydration", publicKey: "test-calendar" },
        coverage: { city: "Orlando", county: "Orange County", state: "Florida", postalCode: "32801" },
        note: "Safe test only. No real patient record was sent.",
      };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const responseText = (await response.text()).slice(0, 800);
    if (!response.ok) {
      throw new Error(`Webhook test failed with HTTP ${response.status}.`);
    }
    return {
      ok: true,
      target: input.target,
      status: response.status,
      response: responseText,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Webhook test timed out after 10 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
