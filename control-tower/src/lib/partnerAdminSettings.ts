import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";
import { patientFanoutFields } from "@/lib/appointmentPatientFanout";

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
  client_referral_webhook_url: string | null;
  client_referral_registered_webhook_url: string | null;
  client_referral_reward_earned_webhook_url: string | null;
  account_security_webhook_url: string | null;
  admin_base_url: string | null;
  affiliate_commission_rate: string | number | null;
  updated_at: string;
};

export type PartnerAdminWebhookSummary = {
  target: PartnerAdminWebhookTarget;
  label: string;
  configured: boolean;
  endpoint: string;
};

export type PartnerAdminCommunicationRouter =
  | "application_received"
  | "account_ready"
  | "lead_capture"
  | "new_booking"
  | "partner_rescheduled"
  | "appointment_accepted"
  | "appointment_declined"
  | "appointment_reassigned"
  | "appointment_completed"
  | "appointment_refunded"
  | "client_referral"
  | "client_referral_registered"
  | "client_referral_reward_earned"
  | "account_security";

export type PartnerAdminCommunicationEvent = {
  target: PartnerAdminWebhookTarget;
  label: string;
  event: string;
};

export type PartnerAdminCommunicationSummary = {
  id: PartnerAdminCommunicationRouter;
  category: "Partner onboarding" | "Bookings" | "Appointment updates" | "Care rewards" | "Account security";
  name: string;
  workflowName: string;
  description: string;
  configured: boolean;
  endpoint: string;
  webhookUrl: string;
  events: PartnerAdminCommunicationEvent[];
};

export type PartnerAdminNotificationSettings = {
  tenantId: string;
  tenantName: string;
  formKey: string;
  enabled: boolean;
  accountReadyWebhookUrl: string;
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
  clientReferralWebhookUrl: string;
  clientReferralRegisteredWebhookUrl: string;
  clientReferralRewardEarnedWebhookUrl: string;
  accountSecurityWebhookUrl: string;
  accountReadyWebhookConfigured: boolean;
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
  clientReferralWebhookConfigured: boolean;
  clientReferralRegisteredWebhookConfigured: boolean;
  clientReferralRewardEarnedWebhookConfigured: boolean;
  accountSecurityWebhookConfigured: boolean;
  communications: PartnerAdminCommunicationSummary[];
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

function routerIsConfigured(endpoint: string, destinations: unknown[]) {
  return Boolean(endpoint) && destinations.every((destination) => s(destination) === endpoint);
}

function safeSettings(row: SettingsRow): PartnerAdminNotificationSettings {
  const applicationReceivedUrl = s(row.applicant_received_webhook_url)
    || s(row.admin_notification_webhook_url);
  const accountReadyUrl = s(row.webhook_url);
  const accountSecurityUrl = s(row.account_security_webhook_url);
  const applicationReceivedConfigured = routerIsConfigured(applicationReceivedUrl, [
    row.applicant_received_webhook_url,
    row.admin_notification_webhook_url,
  ]);
  const separatedCommunications: PartnerAdminCommunicationSummary[] = [
    { id: "application_received", category: "Partner onboarding", name: "Application received", workflowName: "MDN | Partner | Application Received", description: "Acknowledges the applicant and alerts the internal Admin team.", configured: applicationReceivedConfigured, endpoint: safeWebhookEndpoint(applicationReceivedUrl), webhookUrl: applicationReceivedUrl, events: [{ target: "applicant_received", label: "Application submitted", event: "partner_application_received" }] },
    { id: "account_ready", category: "Partner onboarding", name: "Account-ready welcome", workflowName: "MDN | Partner | Account-ready Welcome", description: "Runs after approval and account provisioning with the activation link.", configured: Boolean(accountReadyUrl), endpoint: safeWebhookEndpoint(accountReadyUrl), webhookUrl: accountReadyUrl, events: [{ target: "account_ready", label: "Account ready", event: "partner_account_ready" }] },
    { id: "lead_capture", category: "Bookings", name: "Lead captured", workflowName: "MDN | Booking | Lead Captured", description: "Receives an unfinished booking lead and its coverage and availability context.", configured: Boolean(s(row.lead_capture_webhook_url)), endpoint: safeWebhookEndpoint(row.lead_capture_webhook_url), webhookUrl: s(row.lead_capture_webhook_url), events: [{ target: "lead_capture", label: "Lead captured", event: "booking.lead.created" }] },
    { id: "new_booking", category: "Bookings", name: "New booking", workflowName: "MDN | Booking | New Booking", description: "Receives a paid booking with the patient, assigned professional and additional patients.", configured: Boolean(s(row.new_booking_webhook_url)), endpoint: safeWebhookEndpoint(row.new_booking_webhook_url), webhookUrl: s(row.new_booking_webhook_url), events: [{ target: "new_booking", label: "New booking", event: "new_booking" }] },
    { id: "partner_rescheduled", category: "Appointment updates", name: "Professional rescheduled", workflowName: "MDN | Appointment | Rescheduled", description: "Notifies the applicable workflow when the professional changes the visit time.", configured: Boolean(s(row.partner_rescheduled_webhook_url)), endpoint: safeWebhookEndpoint(row.partner_rescheduled_webhook_url), webhookUrl: s(row.partner_rescheduled_webhook_url), events: [{ target: "partner_rescheduled", label: "Professional rescheduled", event: "partner_rescheduled" }] },
    { id: "appointment_accepted", category: "Appointment updates", name: "Appointment accepted", workflowName: "MDN | Appointment | Accepted", description: "Sends the assigned professional profile to the customer workflow.", configured: Boolean(s(row.appointment_accepted_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_accepted_webhook_url), webhookUrl: s(row.appointment_accepted_webhook_url), events: [{ target: "appointment_accepted", label: "Appointment accepted", event: "appointment_accepted" }] },
    { id: "appointment_declined", category: "Appointment updates", name: "Appointment declined", workflowName: "MDN | Appointment | Declined", description: "Triggers the decline and reassignment communication flow.", configured: Boolean(s(row.appointment_declined_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_declined_webhook_url), webhookUrl: s(row.appointment_declined_webhook_url), events: [{ target: "appointment_declined", label: "Appointment declined", event: "appointment_declined" }] },
    { id: "appointment_reassigned", category: "Appointment updates", name: "Appointment reassigned", workflowName: "MDN | Appointment | Reassigned", description: "Sends the visit to the newly assigned professional workflow.", configured: Boolean(s(row.appointment_reassigned_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_reassigned_webhook_url), webhookUrl: s(row.appointment_reassigned_webhook_url), events: [{ target: "appointment_reassigned", label: "Appointment reassigned", event: "appointment_reassigned" }] },
    { id: "appointment_completed", category: "Appointment updates", name: "Appointment completed", workflowName: "MDN | Appointment | Completed", description: "Starts post-visit communication after completion.", configured: Boolean(s(row.appointment_completed_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_completed_webhook_url), webhookUrl: s(row.appointment_completed_webhook_url), events: [{ target: "appointment_completed", label: "Appointment completed", event: "appointment_completed" }] },
    { id: "appointment_refunded", category: "Appointment updates", name: "Appointment refunded", workflowName: "MDN | Appointment | Refunded", description: "Sends refund-specific customer and operations context.", configured: Boolean(s(row.appointment_refunded_webhook_url)), endpoint: safeWebhookEndpoint(row.appointment_refunded_webhook_url), webhookUrl: s(row.appointment_refunded_webhook_url), events: [{ target: "appointment_refunded", label: "Appointment refunded", event: "appointment_refunded" }] },
    { id: "client_referral", category: "Care rewards", name: "Personal invitation", workflowName: "MDN | Rewards | Invitation", description: "Delivers a new personal referral invitation.", configured: Boolean(s(row.client_referral_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_webhook_url), webhookUrl: s(row.client_referral_webhook_url), events: [{ target: "client_referral", label: "Personal invitation", event: "client.referral.invite.created" }] },
    { id: "client_referral_registered", category: "Care rewards", name: "Referral registered", workflowName: "MDN | Rewards | Referral Registered", description: "Records verified referral progress in its own workflow.", configured: Boolean(s(row.client_referral_registered_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_registered_webhook_url), webhookUrl: s(row.client_referral_registered_webhook_url), events: [{ target: "client_referral_registered", label: "Referral registered", event: "client.referral.registered" }] },
    { id: "client_referral_reward_earned", category: "Care rewards", name: "Reward earned", workflowName: "MDN | Rewards | Reward Earned", description: "Triggers the earned-reward workflow independently.", configured: Boolean(s(row.client_referral_reward_earned_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_reward_earned_webhook_url), webhookUrl: s(row.client_referral_reward_earned_webhook_url), events: [{ target: "client_referral_reward_earned", label: "Reward earned", event: "client.referral.reward.earned" }] },
    { id: "account_security", category: "Account security", name: "Phone verification", workflowName: "MDN | Care | Account Security SMS", description: "Sends Care phone-verification codes through a dedicated GHL workflow.", configured: Boolean(accountSecurityUrl), endpoint: safeWebhookEndpoint(accountSecurityUrl), webhookUrl: accountSecurityUrl, events: [{ target: "account_security", label: "Phone verification code", event: "account_security_challenge_requested" }] },
  ];

  return {
    tenantId: row.organization_id,
    tenantName: row.organization_name,
    formKey: row.form_key,
    enabled: Boolean(row.enabled),
    accountReadyWebhookUrl: s(row.webhook_url),
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
    clientReferralWebhookUrl: s(row.client_referral_webhook_url),
    clientReferralRegisteredWebhookUrl: s(row.client_referral_registered_webhook_url),
    clientReferralRewardEarnedWebhookUrl: s(row.client_referral_reward_earned_webhook_url),
    accountSecurityWebhookUrl: accountSecurityUrl,
    accountReadyWebhookConfigured: Boolean(s(row.webhook_url)),
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
    clientReferralWebhookConfigured: Boolean(s(row.client_referral_webhook_url)),
    clientReferralRegisteredWebhookConfigured: Boolean(s(row.client_referral_registered_webhook_url)),
    clientReferralRewardEarnedWebhookConfigured: Boolean(s(row.client_referral_reward_earned_webhook_url)),
    accountSecurityWebhookConfigured: Boolean(accountSecurityUrl),
    communications: separatedCommunications,
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
      { target: "client_referral", label: "Client referral invitations", configured: Boolean(s(row.client_referral_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_webhook_url) },
      { target: "client_referral_registered", label: "Client referral registered", configured: Boolean(s(row.client_referral_registered_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_registered_webhook_url) },
      { target: "client_referral_reward_earned", label: "Client referral reward earned", configured: Boolean(s(row.client_referral_reward_earned_webhook_url)), endpoint: safeWebhookEndpoint(row.client_referral_reward_earned_webhook_url) },
      { target: "account_security", label: "Care account security SMS", configured: Boolean(accountSecurityUrl), endpoint: safeWebhookEndpoint(accountSecurityUrl) },
    ],
    adminBaseUrl: s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL,
    affiliateCommissionRate: Number(row.affiliate_commission_rate ?? 3) || 3,
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
         c.client_referral_webhook_url,
         c.client_referral_registered_webhook_url,
         c.client_referral_reward_earned_webhook_url,
         c.account_security_webhook_url,
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
  accountReadyWebhookUrl?: string;
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
  clientReferralWebhookUrl?: string;
  adminBaseUrl: string;
  clearAccountReadyWebhook?: boolean;
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
  clearClientReferralWebhook?: boolean;
  affiliateCommissionRate?: number;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");

  const accountReadyWebhook = validatedUrl(
    input.accountReadyWebhookUrl,
    "Account-ready webhook",
  );
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
  const clientReferralWebhook = validatedUrl(input.clientReferralWebhookUrl, "Client referral webhook");
  const adminBaseUrl = validatedUrl(input.adminBaseUrl, "Admin base URL", { required: true });
  const affiliateCommissionRate = Number(input.affiliateCommissionRate ?? 3);
  if (!Number.isFinite(affiliateCommissionRate) || affiliateCommissionRate < 0 || affiliateCommissionRate > 100) {
    throw new Error("Affiliate commission rate must be between 0 and 100.");
  }

  await getDbPool().query(
    `update app.staff_form_configs c
        set client_referral_webhook_url = case
              when $3::boolean then null
              when nullif($2::text, '') is not null then $2::text
              else c.client_referral_webhook_url
            end,
            updated_at = now()
      where c.organization_id = $1::uuid`,
    [tenantId, clientReferralWebhook, Boolean(input.clearClientReferralWebhook)],
  );

  const query = await getDbPool().query<SettingsRow>(
    `update app.staff_form_configs c
       set webhook_url = case
              when $31::boolean then null
              when nullif($30::text, '') is not null then $30::text
              else c.webhook_url
            end,
            applicant_received_webhook_url = case
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
                c.client_referral_webhook_url,
                c.client_referral_registered_webhook_url,
                c.client_referral_reward_earned_webhook_url,
                c.account_security_webhook_url,
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
      accountReadyWebhook,
      Boolean(input.clearAccountReadyWebhook),
    ],
  );

  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");
  return safeSettings(row);
}

export async function savePartnerAdminCommunicationRouter(input: {
  tenantId: string;
  router: PartnerAdminCommunicationRouter;
  webhookUrl?: string;
  clear?: boolean;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");
  const routerColumns: Partial<Record<PartnerAdminCommunicationRouter, keyof SettingsRow>> = {
    account_ready: "webhook_url",
    lead_capture: "lead_capture_webhook_url",
    new_booking: "new_booking_webhook_url",
    partner_rescheduled: "partner_rescheduled_webhook_url",
    appointment_accepted: "appointment_accepted_webhook_url",
    appointment_declined: "appointment_declined_webhook_url",
    appointment_reassigned: "appointment_reassigned_webhook_url",
    appointment_completed: "appointment_completed_webhook_url",
    appointment_refunded: "appointment_refunded_webhook_url",
    client_referral: "client_referral_webhook_url",
    client_referral_registered: "client_referral_registered_webhook_url",
    client_referral_reward_earned: "client_referral_reward_earned_webhook_url",
    account_security: "account_security_webhook_url",
  };
  if (input.router !== "application_received" && !routerColumns[input.router]) {
    throw new Error("Invalid communication router.");
  }

  const clear = Boolean(input.clear);
  const webhookUrl = clear
    ? null
    : validatedUrl(input.webhookUrl, "GHL inbound webhook", { required: true });

  if (input.router === "application_received") {
    await getDbPool().query(
      `update app.staff_form_configs
          set applicant_received_webhook_url = $2,
              admin_notification_webhook_url = $2,
              updated_at = now()
        where organization_id = $1::uuid`,
      [tenantId, webhookUrl],
    );
  } else {
    const column = routerColumns[input.router];
    if (!column) throw new Error("Invalid communication router.");
    await getDbPool().query(
      `update app.staff_form_configs
          set ${column} = $2,
              updated_at = now()
        where organization_id = $1::uuid`,
      [tenantId, webhookUrl],
    );
  }

  const query = await getDbPool().query<SettingsRow>(
    `${SETTINGS_SELECT} where c.organization_id = $1::uuid limit 1`,
    [tenantId],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");
  return safeSettings(row);
}

export type PartnerAdminWebhookTarget =
  | "account_ready"
  | "applicant_received"
  | "admin_notification"
  | "partner_notification"
  | "additional_patient_invitation"
  | "lead_capture"
  | "appointment_created"
  | "new_booking"
  | "partner_confirmation_required"
  | "partner_rescheduled"
  | "appointment_accepted"
  | "appointment_declined"
  | "appointment_reassigned"
  | "appointment_completed"
  | "appointment_refunded"
  | "client_referral"
  | "client_referral_registered"
  | "client_referral_reward_earned"
  | "account_security";

function webhookUrlForTarget(row: SettingsRow, target: PartnerAdminWebhookTarget) {
  const exact = {
    account_ready: row.webhook_url,
    applicant_received: row.applicant_received_webhook_url,
    admin_notification: row.admin_notification_webhook_url,
    partner_notification: row.partner_notification_webhook_url,
    additional_patient_invitation: row.partner_notification_webhook_url,
    lead_capture: row.lead_capture_webhook_url,
    appointment_created: row.appointment_created_webhook_url,
    new_booking: row.new_booking_webhook_url,
    partner_confirmation_required: row.partner_confirmation_required_webhook_url,
    partner_rescheduled: row.partner_rescheduled_webhook_url,
    appointment_accepted: row.appointment_accepted_webhook_url,
    appointment_declined: row.appointment_declined_webhook_url,
    appointment_reassigned: row.appointment_reassigned_webhook_url,
    appointment_completed: row.appointment_completed_webhook_url,
    appointment_refunded: row.appointment_refunded_webhook_url,
    client_referral: row.client_referral_webhook_url,
    client_referral_registered: row.client_referral_registered_webhook_url,
    client_referral_reward_earned: row.client_referral_reward_earned_webhook_url,
    account_security: row.account_security_webhook_url,
  } satisfies Record<PartnerAdminWebhookTarget, string | null>;
  return s(exact[target]);
}

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
  if (input.target !== "appointment_created" && !(["account_ready", "applicant_received", "admin_notification", "partner_notification", "additional_patient_invitation", "lead_capture", "client_referral", "client_referral_registered", "client_referral_reward_earned", "account_security", ...lifecycleTargets] as string[]).includes(input.target)) {
    throw new Error("Invalid webhook target.");
  }

  const query = await getDbPool().query<SettingsRow>(
    `${SETTINGS_SELECT} where c.organization_id = $1::uuid limit 1`,
    [tenantId],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");

  // Resolve the exact column consumed by the corresponding live emitter.
  // Saving a Communication router fans one canonical URL into all of its
  // event columns; this lookup also keeps Safe Test accurate for legacy rows.
  const webhookUrl = webhookUrlForTarget(row, input.target);
  if (!webhookUrl) throw new Error("This webhook has not been configured yet.");

  const submittedAt = new Date().toISOString();
  const adminBaseUrl = s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL;
  const safeOfferUrl = "https://partners.mydripnurse.com/partner-portal/appointments?appointment=test-appointment-id&offer=1";
  const safeEarnings = 131.4;
  const safeEarningsFormatted = "$131.40";
  const safeEarningsDisplay = "$131.40 + tips";
  const safeSmsMessage = `My Drip Nurse: New appointment. Earn ${safeEarningsDisplay}. Hydration · tomorrow at 10:00 AM EDT. Accept or decline: ${safeOfferUrl}`;
  const safePatientInvitationUrl = "https://care.mydripnurse.com/register?next=%2Fappointments&invite=1&email=additional-patient%40mydripnurse.com";
  const safeAdditionalPatient = {
    role: "additional_patient" as const,
    sequence: 1,
    firstName: "Additional",
    lastName: "Patient",
    fullName: "Additional Patient",
    email: "additional-patient@mydripnurse.com",
    phone: "+15550100101",
    contactKey: "email:additional-patient@mydripnurse.com",
  };
  const safeLeadPrimaryPatient = {
    firstName: "Test",
    first_name: "Test",
    lastName: "Patient",
    last_name: "Patient",
    fullName: "Test Patient",
    full_name: "Test Patient",
    email: "test-patient@mydripnurse.com",
    phone: "+15550100100",
    phoneNumber: "+15550100100",
    phone_number: "+15550100100",
    dateOfBirth: "1980-01-01",
    weight: "180 lb",
    height: { feet: 5, inches: 10 },
  };
  const safeLeadAdditionalPatient = {
    firstName: "Additional",
    first_name: "Additional",
    lastName: "Patient",
    last_name: "Patient",
    fullName: "Additional Patient",
    full_name: "Additional Patient",
    email: "additional-patient@mydripnurse.com",
    phone: "+15550100101",
    phoneNumber: "+15550100101",
    phone_number: "+15550100101",
    dateOfBirth: "1985-02-02",
  };
  const safeLeadPartner = {
    id: "safe-test-partner-id",
    displayName: "Fabian Castro",
    businessName: "Fabian Wellness",
    firstName: "Fabian",
    first_name: "Fabian",
    lastName: "Castro",
    last_name: "Castro",
    fullName: "Fabian Castro",
    full_name: "Fabian Castro",
    email: "fabianjcp57@hotmail.com",
    phone: "+15550100200",
    phoneNumber: "+15550100200",
    phone_number: "+15550100200",
  };
  const payload = input.target === "account_security"
    ? {
        event: "account_security_challenge_requested",
        eventId: "safe-test-account-security-code",
        idempotencyKey: "account_security_challenge_requested:safe-test",
        version: 1,
        success: true,
        test: true,
        purpose: "phone_verification",
        delivery: { channel: "sms", provider: "ghl" },
        audience: { role: "client" },
        recipient: {
          accountId: "safe-test-client-id",
          firstName: "Test",
          lastName: "Client",
          fullName: "Test Client",
          phone: "+15550100100",
        },
        security: { code: "123456", expiresInMinutes: 10 },
        copy: {
          sms: "My Drip Nurse: Your phone verification code is 123456. It expires in 10 minutes. Do not share this code.",
        },
        occurredAt: submittedAt,
        note: "Safe SMS mapping test only. No phone number or password was changed.",
      }
    : input.target === "client_referral_reward_earned"
    ? {
        event: "client.referral.reward.earned",
        version: 1,
        success: true,
        test: true,
        idempotencyKey: "client.referral.reward.earned.test:safe-test",
        occurredAt: submittedAt,
        goal: 10,
        registeredCount: 10,
        remainingCount: 0,
        inviter: {
          accountId: "safe-test-client-account-id",
          fullName: "Test Client",
          email: "test-client@mydripnurse.com",
          phone: "+15550100200",
        },
        invitee: {
          fullName: "Test Friend",
          phone: "+15550100300",
          email: "test-friend@mydripnurse.com",
        },
        rewardEarned: true,
        reward: {
          status: "available",
          type: "next_appointment_deposit_waiver",
          description: "The My Drip Nurse deposit is waived once on the inviter's next eligible appointment.",
        },
        note: "Safe reward-earned test only. No referral progress or Care reward was changed.",
      }
    : input.target === "client_referral_registered"
    ? {
        event: "client.referral.registered",
        version: 1,
        success: true,
        test: true,
        idempotencyKey: "client.referral.registered.test:safe-test",
        occurredAt: submittedAt,
        goal: 10,
        registeredCount: 1,
        remainingCount: 9,
        inviter: {
          accountId: "safe-test-client-account-id",
          fullName: "Test Client",
          email: "test-client@mydripnurse.com",
          phone: "+15550100200",
        },
        invitee: {
          fullName: "Test Friend",
          phone: "+15550100300",
          email: "test-friend@mydripnurse.com",
        },
        rewardEarned: false,
        note: "Safe referral-registration test only. No referral progress or Care reward was changed.",
      }
    : input.target === "client_referral"
    ? {
        event: "client.referral.invite.created",
        version: 1,
        success: true,
        test: true,
        idempotencyKey: "client.referral.invite.created.test:safe-test",
        occurredAt: submittedAt,
        firstName: "Test",
        lastName: "Friend",
        fullName: "Test Friend",
        phone: "+1 555 010 0300",
        email: "test-friend@mydripnurse.com",
        registrationUrl: "https://care.mydripnurse.com/register?referral=SAFE-TEST-NOT-A-REAL-CODE",
        smsMessage: "My Drip Nurse: Test Client invited you to join My Drip Nurse Care. Create your free account: https://care.mydripnurse.com/register?referral=SAFE-TEST-NOT-A-REAL-CODE",
        goal: 10,
        registeredCount: 0,
        remainingCount: 10,
        inviter: { accountId: "safe-test-client-account-id", fullName: "Test Client", firstName: "Test", email: "test-client@mydripnurse.com", phone: "+1 555 010 0200" },
        invitee: { firstName: "Test", lastName: "Friend", fullName: "Test Friend", phone: "+1 555 010 0300", email: "test-friend@mydripnurse.com" },
        note: "Safe referral test only. No invitation, Care account or reward was created.",
      }
    : input.target === "additional_patient_invitation"
    ? {
        event: "customer.appointment.patient_invited",
        eventType: "customer.appointment.patient_invited",
        eventId: "customer.appointment.patient_invited:safe-test-appointment-id:email:additional-patient@mydripnurse.com",
        idempotencyKey: "customer.appointment.patient_invited:safe-test-appointment-id:email:additional-patient@mydripnurse.com",
        version: 1,
        test: true,
        source: "safe_test",
        occurredAt: submittedAt,
        ...patientFanoutFields({
          appointmentId: "safe-test-appointment-id",
          event: "customer.appointment.patient_invited",
          recipient: safeAdditionalPatient,
          recipientCount: 1,
        }),
        appointmentId: "safe-test-appointment-id",
        appointmentReference: "MDN-TEST123456",
        serviceName: "Hydration",
        appointmentStartsAt: new Date(Date.now() + 86_400_000).toISOString(),
        appointmentDateTimeFormatted: "tomorrow at 10:00 AM EDT",
        appointmentTimezone: "America/New_York",
        primaryPatientFullName: "Test Patient",
        careAccessUrl: safePatientInvitationUrl,
        actionUrl: safePatientInvitationUrl,
        emailSubject: "Test Patient included you in a My Drip Nurse appointment",
        smsMessage: `My Drip Nurse: Test Patient included you in a Hydration appointment tomorrow at 10:00 AM EDT. View your appointment: ${safePatientInvitationUrl}`,
        emailTemplateKey: "additional_patient_invitation",
        smsTemplateKey: "additional_patient_invitation",
        requiredGhlActions: ["find_or_create_contact", "apply_tags", "send_sms_if_enabled", "send_email_if_enabled"],
        appointment: {
          id: "safe-test-appointment-id",
          publicReference: "MDN-TEST123456",
          serviceName: "Hydration",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          timezone: "America/New_York",
        },
        note: "Safe GHL mapping test only. No patient, appointment or Care account was created.",
      }
    : input.target === "account_ready"
    ? {
        event: "partner_account_ready",
        eventId: "safe-test-application-id",
        applicationId: "safe-test-application-id",
        success: true,
        test: true,
        payloadSource: "safe_test",
        accountReady: true,
        onboardingLinkReady: true,
        provisioningStatus: "completed",
        calendarSetupSucceeded: true,
        calendarSetupStatus: "ready_for_partner_availability",
        availabilityConfigured: false,
        availabilityRequiredForApproval: false,
        firstName: "Test",
        lastName: "Partner",
        fullName: "Test Partner",
        email: "test-partner@mydripnurse.com",
        phone: "+15550100100",
        company: "My Drip Nurse Test Partner",
        publicTitle: "Registered Nurse",
        professionalCredentials: "RN, BSN",
        biography: "Safe test profile used only to map the account-ready workflow in GHL.",
        profilePhotoUrl: "https://partners.mydripnurse.com/partner-portal-icon-192.png",
        profilePhotoFileId: "safe-test-profile-photo-file-id",
        profilePhotoLocationId: "safe-test-location-id",
        profileConsentAt: submittedAt,
        referralCode: "",
        countyNames: "Orange County",
        countyStateNames: "Orange County, Florida",
        totalCounties: 1,
        primaryLocationId: "safe-test-location-id",
        counties: [{ state: "Florida", county: "Orange County", locationId: "safe-test-location-id" }],
        partnerUserId: "safe-test-partner-user-id",
        loginUrl: "https://partners.mydripnurse.com/login",
        partnerPortalUrl: "https://partners.mydripnurse.com/login",
        welcomeLandingPageUrl: "https://partners.mydripnurse.com/partner-activate?token=SAFE-TEST-NOT-A-REAL-TOKEN",
        activationLinkExpiresInDays: 7,
        partnerSlug: "test-partner",
        partnerWebsiteUrl: "https://partners.mydripnurse.com/test-partner",
        partnerWebsiteStatus: "ready",
        groupCalendarId: "safe-test-calendar-group-id",
        groupCalendarUrl: "https://calendar.google.com/calendar/u/0/r",
        locations: [{ state: "Florida", county: "Orange County", locationId: "safe-test-location-id" }],
        acceptedAt: submittedAt,
        submittedAt,
        note: "Safe account-ready test only. No real Partner account or activation link was created.",
      }
    : input.target === "applicant_received" ? {
        event: "partner_application_received",
        success: true,
        test: true,
        submittedAt,
        applicationId: "safe-test-application-id",
        firstName: "Test",
        lastName: "Applicant",
        fullName: "Test Applicant",
        email: "test-applicant@mydripnurse.com",
        phone: "+1 555 010 0100",
        company: "My Drip Nurse Test",
        publicTitle: "Registered Nurse",
        professionalCredentials: "RN, BSN",
        biography: "Safe test profile used only to map the application workflow in GHL.",
        profilePhotoUrl: "https://partners.mydripnurse.com/partner-portal-icon-192.png",
        profilePhotoFileId: "safe-test-profile-photo-file-id",
        profilePhotoLocationId: "safe-test-location-id",
        profileConsentAt: submittedAt,
        referralCode: "",
        primaryLocationId: "safe-test-location-id",
        counties: [{ state: "Florida", county: "Orange County", locationId: "safe-test-location-id" }],
        countyNames: "Orange County",
        countyStateNames: "Orange County, Florida",
        totalCounties: 1,
        status: "submitted",
        processing: true,
        adminProfileUrl: `${adminBaseUrl}/applications/safe-test-application-id`,
        payloadSource: "safe_test",
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
        event: "partner_application_admin_notification",
        success: true,
        test: true,
        submittedAt,
        applicationId: "safe-test-application-id",
        firstName: "Test",
        lastName: "Applicant",
        fullName: "Test Applicant",
        email: "test-applicant@mydripnurse.com",
        phone: "+1 555 010 0100",
        company: "My Drip Nurse Test",
        publicTitle: "Registered Nurse",
        professionalCredentials: "RN, BSN",
        biography: "Safe test profile used only to map the administrator workflow in GHL.",
        profilePhotoUrl: "https://partners.mydripnurse.com/partner-portal-icon-192.png",
        profilePhotoFileId: "safe-test-profile-photo-file-id",
        profilePhotoLocationId: "safe-test-location-id",
        profileConsentAt: submittedAt,
        referralCode: "",
        primaryLocationId: "safe-test-location-id",
        counties: [{ state: "Florida", county: "Orange County", locationId: "safe-test-location-id" }],
        countyNames: "Orange County",
        countyStateNames: "Orange County, Florida",
        totalCounties: 1,
        status: "submitted",
        processing: true,
        payloadSource: "safe_test",
        applicant: {
          fullName: "Test Applicant",
          email: "test-applicant@mydripnurse.com",
          company: "My Drip Nurse Test",
        },
        requestedCounties: ["Orange County, Florida"],
        adminProfileUrl: `${adminBaseUrl}/applications/test-application-id`,
      } : input.target === "partner_notification" ? {
        event: "partner.appointment.notification.test",
        version: 2,
        test: true,
        submittedAt,
        firstName: "Test",
        lastName: "Patient",
        patientFirstName: "Test",
        patientLastName: "Patient",
        hasAdditionalPatients: true,
        additionalPatientsCount: 1,
        additionalPatients: [{
          firstName: "Additional",
          lastName: "Patient",
          fullName: "Additional Patient",
          email: "additional-patient@mydripnurse.com",
          phone: "+1 555 010 0101",
          dateOfBirth: "1985-02-02",
        }],
        partner: { displayName: "Fabian Castro", email: "fabianjcp57@hotmail.com" },
        customer: { name: "Test Patient", firstName: "Test", lastName: "Patient", email: "test-patient@mydripnurse.com", phone: "+1 555 010 0100" },
        actionRequired: true,
        estimatedEarnings: safeEarnings,
        estimatedEarningsFormatted: safeEarningsFormatted,
        earningsCurrency: "USD",
        tipsEligible: true,
        tipsIncluded: false,
        earningsDisplay: safeEarningsDisplay,
        appointmentOfferUrl: safeOfferUrl,
        actionUrl: safeOfferUrl,
        smsMessage: safeSmsMessage,
        offer: { type: "appointment_offer", actionRequired: true, estimatedEarnings: safeEarnings, estimatedEarningsFormatted: safeEarningsFormatted, currency: "USD", tipsEligible: true, tipsIncluded: false, earningsDisplay: safeEarningsDisplay, actionUrl: safeOfferUrl, acceptOrDeclineUrl: safeOfferUrl },
        appointment: {
          status: "confirmed",
          service: "Hydration",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          address: "Test address, Lufkin, TX",
          amountDueAtVisit: safeEarnings,
          estimatedEarnings: safeEarnings,
          tipsEligible: true,
          tipsIncluded: false,
          earningsDisplay: safeEarningsDisplay,
          currency: "USD",
        },
        notificationChannels: ["email", "sms"],
        note: "Use the event field in GHL to route email or SMS notifications.",
      } : input.target === "appointment_created" ? {
        event: "appointment.created.test",
        version: 2,
        success: true,
        test: true,
        idempotencyKey: "appointment.created.test",
        occurredAt: submittedAt,
        organization: { name: row.organization_name, id: row.organization_id },
        firstName: "Test",
        lastName: "Patient",
        patientFirstName: "Test",
        patientLastName: "Patient",
        hasAdditionalPatients: true,
        additionalPatientsCount: 1,
        actionRequired: false,
        estimatedEarnings: safeEarnings,
        estimatedEarningsFormatted: safeEarningsFormatted,
        earningsCurrency: "USD",
        tipsEligible: true,
        tipsIncluded: false,
        earningsDisplay: safeEarningsDisplay,
        appointmentOfferUrl: safeOfferUrl,
        actionUrl: safeOfferUrl,
        smsMessage: "",
        offer: { type: "appointment_offer", actionRequired: false, estimatedEarnings: safeEarnings, estimatedEarningsFormatted: safeEarningsFormatted, currency: "USD", tipsEligible: true, tipsIncluded: false, earningsDisplay: safeEarningsDisplay, actionUrl: safeOfferUrl, acceptOrDeclineUrl: safeOfferUrl },
        appointment: {
          id: "test-appointment-id",
          publicReference: "MDN-TEST123456",
          status: "payment_pending",
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          timezone: "America/New_York",
          service: { id: "test-service-id", slug: "hydration", name: "Hydration", calendarPublicKey: "test-calendar", price: 219, currency: "USD", durationMinutes: 60 },
          payment: { status: "pending", servicePrice: 219, depositType: "percentage", depositValue: 40, depositAmount: 87.6, amountDueAtVisit: safeEarnings, estimatedEarnings: safeEarnings, tipsEligible: true, tipsIncluded: false, earningsDisplay: safeEarningsDisplay, currency: "USD" },
          serviceAddress: { addressLine1: "100 Main Street", city: "Orlando", county: "Orange County", state: "Florida", postalCode: "32801", countryCode: "US" },
          source: { url: "https://example.com/orlando/hydration", city: "Orlando", county: "Orange County", state: "Florida" },
        },
        patient: { firstName: "Test", lastName: "Patient", fullName: "Test Patient", email: "test-patient@mydripnurse.com", phone: "+1 555 010 0100", dateOfBirth: "1980-01-01", weight: "180 lb", height: { feet: 5, inches: 10 } },
        additionalPatients: [{ firstName: "Additional", lastName: "Patient", fullName: "Additional Patient", email: "additional-patient@mydripnurse.com", phone: "+1 555 010 0101", dateOfBirth: "1985-02-02" }],
        medicalScreening: { eligible: true, selected: ["none"] },
        partner: { id: "test-partner-id", displayName: "Fabian Castro", email: "fabianjcp57@hotmail.com", coverageAreas: [] },
        notificationChannels: ["email", "sms"],
        note: "Safe test only. No real appointment or patient record was sent.",
      } : lifecycleTargets.includes(input.target as (typeof lifecycleTargets)[number]) ? {
        event: input.target,
        eventType: input.target,
        version: 2,
        success: true,
        test: true,
        idempotencyKey: `appointment.${input.target}.test`,
        occurredAt: submittedAt,
        organization: { name: row.organization_name, id: row.organization_id },
        firstName: "Test",
        lastName: "Patient",
        patientFirstName: "Test",
        patientLastName: "Patient",
        hasAdditionalPatients: true,
        additionalPatientsCount: 1,
        partnerFirstName: "Fabian",
        partnerLastName: "Castro",
        partnerFullName: "Fabian Castro",
        partnerDisplayName: "Fabian Castro",
        partnerBusinessName: "Fabian Wellness",
        partnerEmail: "fabianjcp57@hotmail.com",
        partnerPhone: "+1 555 010 0200",
        partnerId: "test-partner-id",
        partnerGhlUserId: "test-ghl-user-id",
        partnerSlug: "fabian-wellness",
        partnerPublicTitle: "Registered Nurse",
        partnerProfessionalCredentials: "RN",
        partnerProfilePhotoUrl: "https://partners.mydripnurse.com/partner-portal-icon-192.png",
        partnerWebsiteStatus: "published",
        partnerWebsiteUrl: "https://partners.mydripnurse.com/fabian-wellness",
        partnerCoverageAreas: [{ state: "Florida", county: "Orange County", city: "Orlando", postalCodes: ["32801"] }],
        partnerAssigned: true,
        partner_first_name: "Fabian",
        partner_last_name: "Castro",
        partner_full_name: "Fabian Castro",
        partner_email: "fabianjcp57@hotmail.com",
        partner_phone: "+1 555 010 0200",
        serviceName: "Hydration",
        appointmentDateTimeFormatted: "tomorrow at 10:00 AM EDT",
        actionRequired: input.target === "new_booking" || input.target === "partner_confirmation_required" || input.target === "appointment_reassigned",
        estimatedEarnings: safeEarnings,
        estimatedEarningsFormatted: safeEarningsFormatted,
        earningsCurrency: "USD",
        tipsEligible: true,
        tipsIncluded: false,
        earningsDisplay: safeEarningsDisplay,
        appointmentOfferUrl: safeOfferUrl,
        actionUrl: safeOfferUrl,
        smsMessage: input.target === "new_booking" || input.target === "partner_confirmation_required" || input.target === "appointment_reassigned" ? `My Drip Nurse: Hi Fabian, a new appointment is available. Earn ${safeEarningsDisplay}. Hydration · tomorrow at 10:00 AM EDT. Review and accept or decline: ${safeOfferUrl}` : "",
        offer: { type: "appointment_offer", actionRequired: input.target === "new_booking" || input.target === "partner_confirmation_required" || input.target === "appointment_reassigned", estimatedEarnings: safeEarnings, estimatedEarningsFormatted: safeEarningsFormatted, currency: "USD", tipsEligible: true, tipsIncluded: false, earningsDisplay: safeEarningsDisplay, actionUrl: safeOfferUrl, acceptOrDeclineUrl: safeOfferUrl },
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
          payment: { status: "paid", servicePrice: 219, depositType: "percentage", depositValue: 40, depositAmount: 87.6, amountDueAtVisit: safeEarnings, estimatedEarnings: safeEarnings, tipsEligible: true, tipsIncluded: false, earningsDisplay: safeEarningsDisplay, currency: "USD" },
          serviceAddress: { addressLine1: "100 Main Street", city: "Orlando", county: "Orange County", state: "Florida", postalCode: "32801", countryCode: "US" },
          source: { url: "https://example.com/orlando/hydration", city: "Orlando", county: "Orange County", state: "Florida" },
        },
        patient: { firstName: "Test", lastName: "Patient", fullName: "Test Patient", email: "test-patient@mydripnurse.com", phone: "+1 555 010 0100", dateOfBirth: "1980-01-01", weight: "180 lb", height: { feet: 5, inches: 10 }, bmi: 25.8 },
        additionalPatients: [{ firstName: "Additional", lastName: "Patient", fullName: "Additional Patient", email: "additional-patient@mydripnurse.com", phone: "+1 555 010 0101", dateOfBirth: "1985-02-02", bmi: 24.1 }],
        medicalScreening: { eligible: true, selected: ["none"] },
        partner: { id: "test-partner-id", ghlUserId: "test-ghl-user-id", firstName: "Fabian", lastName: "Castro", fullName: "Fabian Castro", displayName: "Fabian Castro", businessName: "Fabian Wellness", email: "fabianjcp57@hotmail.com", phone: "+1 555 010 0200", phoneNumber: "+1 555 010 0200", slug: "fabian-wellness", publicTitle: "Registered Nurse", professionalCredentials: "RN", profilePhotoUrl: "https://partners.mydripnurse.com/partner-portal-icon-192.png", websiteStatus: "published", coverageAreas: [{ state: "Florida", county: "Orange County", city: "Orlando", postalCodes: ["32801"] }] },
        notificationChannels: ["email", "sms"],
        note: "Safe lifecycle webhook test. No real appointment or patient record was sent.",
      } : {
        event: "booking.lead.created",
        version: 1,
        success: true,
        test: true,
        idempotencyKey: "booking.lead.created.test:safe-test",
        clientIdempotencyKey: "safe-test-client-key",
        capturedAt: submittedAt,
        bookingAttemptCount: 1,
        deduplicatedLead: true,
        followUpDelayMinutes: 10,
        organization: { id: row.organization_id, name: row.organization_name, slug: "my-drip-nurse" },
        firstName: "Test",
        lastName: "Patient",
        patientFirstName: "Test",
        patientLastName: "Patient",
        patientPhone: "+15550100100",
        patient_first_name: "Test",
        patient_last_name: "Patient",
        patient_phone: "+15550100100",
        partnerFirstName: "Fabian",
        partnerLastName: "Castro",
        partnerPhone: "+15550100200",
        partner_first_name: "Fabian",
        partner_last_name: "Castro",
        partner_phone: "+15550100200",
        hasAdditionalPatients: true,
        additionalPatientsCount: 1,
        additionalPatients: [safeLeadAdditionalPatient],
        lead: {
          primaryPatient: safeLeadPrimaryPatient,
          hasAdditionalPatients: true,
          additionalPatientsCount: 1,
          additionalPatients: [safeLeadAdditionalPatient],
          medicalScreening: { eligible: true, selected: ["none"], completedAt: submittedAt },
        },
        service: {
          id: "safe-test-service-id",
          slug: "hydration",
          name: "Hydration",
          calendarPublicKey: "safe-test-calendar",
          price: 219,
          currency: "USD",
        },
        coverage: {
          addressLine1: "100 Main Street",
          addressLine2: "",
          city: "Orlando",
          county: "Orange County",
          state: "Florida",
          postalCode: "32801",
          countryCode: "US",
        },
        appointmentRequest: {
          requestedDate: new Date(Date.now() + 86_400_000).toISOString(),
          timezone: "America/New_York",
          requestedPartnerId: "safe-test-partner-id",
          requestedPartner: safeLeadPartner,
          eligiblePartners: [safeLeadPartner],
        },
        source: {
          sourceUrl: "https://care.mydripnurse.com/book",
          pageUrl: "https://care.mydripnurse.com/book",
          referrer: "https://mydripnurse.com/",
          attribution: { source: "safe_test", medium: "ghl_mapping" },
        },
        note: "Safe lead test only. No real patient, lead or appointment record was created.",
      };

  const routedPayload = {
    ...payload,
    ...ghlRoutingFieldsForPayload(s((payload as { event?: unknown }).event), payload, {
      marketCountryCode: "US",
      marketState: "Florida",
      marketCounty: "Orange County",
      marketCity: input.target === "account_ready" || input.target === "applicant_received" || input.target === "admin_notification"
        ? ""
        : "Orlando",
      platformFunded: input.target === "appointment_accepted" && Boolean((payload as { platformFunded?: unknown }).platformFunded),
      noEligiblePartners: false,
      coverageAvailable: input.target === "lead_capture" ? true : null,
      availabilityAvailable: input.target === "lead_capture" ? true : null,
      eligiblePartnerCount: input.target === "lead_capture" ? 1 : null,
    }),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(routedPayload),
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
      testReceiver: /test request received/i.test(responseText),
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
