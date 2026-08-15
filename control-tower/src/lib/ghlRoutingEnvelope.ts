export type GhlWorkflowRouter =
  | "partner_applications"
  | "booking_appointments"
  | "care_rewards";

export type GhlPrimaryAudience =
  | "applicant"
  | "partner"
  | "customer"
  | "admin"
  | "invitee"
  | "inviter";

type StateOperatorContact = {
  id?: unknown;
  ghlUserId?: unknown;
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
};

type RoutingContext = {
  marketCountryCode?: unknown;
  marketState?: unknown;
  marketCounty?: unknown;
  marketCity?: unknown;
  platformFunded?: boolean;
  noEligiblePartners?: boolean;
  coverageAvailable?: boolean | null;
  availabilityAvailable?: boolean | null;
  eligiblePartnerCount?: unknown;
  stateOperator?: StateOperatorContact | null;
};

type PayloadRecord = Record<string, unknown>;

type RoutingDecision = {
  workflowRouter: GhlWorkflowRouter;
  primaryAudience: GhlPrimaryAudience;
  notifyApplicant?: boolean;
  notifyPartner?: boolean;
  notifyCustomer?: boolean;
  notifyAdmin?: boolean;
  notifyInvitee?: boolean;
  notifyInviter?: boolean;
  stateOperatorNotificationReason: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): PayloadRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PayloadRecord
    : {};
}

function eventRouting(event: string, context: RoutingContext): RoutingDecision {
  switch (event) {
    case "partner_application_received":
      return {
        workflowRouter: "partner_applications" as const,
        primaryAudience: "applicant" as const,
        notifyApplicant: true,
        notifyAdmin: true,
        stateOperatorNotificationReason: "",
      };
    case "partner_application_admin_notification":
      return {
        workflowRouter: "partner_applications" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "",
      };
    case "partner_account_ready":
      return {
        workflowRouter: "partner_applications" as const,
        primaryAudience: "partner" as const,
        notifyPartner: true,
        stateOperatorNotificationReason: "new_partner_approved_in_state",
      };
    case "booking.lead.created":
      return {
        workflowRouter: "booking_appointments" as const,
        // The lead is the GHL contact context, even though this event only
        // creates CRM data and alerts internal users.
        primaryAudience: "customer" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: context.noEligiblePartners
          ? context.coverageAvailable === false
            ? "booking_lead_without_coverage"
            : context.coverageAvailable === true && context.availabilityAvailable === false
              ? "booking_lead_without_availability"
              : "booking_lead_without_eligible_partner"
          : "",
      };
    case "new_booking":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "partner" as const,
        notifyPartner: true,
        // A single inbound payload lets GHL create/update the patient,
        // confirm the booking, notify the Partner and loop any additional
        // patients without charging for separate webhook requests.
        notifyCustomer: true,
        stateOperatorNotificationReason: "",
      };
    case "partner_confirmation_required":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "",
      };
    case "appointment_accepted":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "customer" as const,
        notifyCustomer: true,
        notifyPartner: context.platformFunded === true,
        stateOperatorNotificationReason: "",
      };
    case "appointment_declined":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "appointment_declined",
      };
    case "appointment_reassigned":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "partner" as const,
        notifyPartner: true,
        stateOperatorNotificationReason: "",
      };
    case "partner_rescheduled":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "appointment_rescheduled_by_partner",
      };
    case "appointment_completed":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "customer" as const,
        notifyCustomer: true,
        stateOperatorNotificationReason: "",
      };
    case "appointment_refunded":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "appointment_refunded",
      };
    case "customer.appointment.confirmed":
    case "customer.appointment.rescheduled":
    case "customer.appointment.deposit_refunded":
    case "customer.appointment.patient_invited":
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "customer" as const,
        notifyCustomer: true,
        stateOperatorNotificationReason: "",
      };
    case "client.referral.invite.created":
      return {
        workflowRouter: "care_rewards" as const,
        primaryAudience: "invitee" as const,
        notifyInvitee: true,
        stateOperatorNotificationReason: "",
      };
    case "client.referral.registered":
    case "client.referral.reward.earned":
      return {
        workflowRouter: "care_rewards" as const,
        primaryAudience: "inviter" as const,
        notifyInviter: true,
        stateOperatorNotificationReason: "",
      };
    default:
      return {
        workflowRouter: "booking_appointments" as const,
        primaryAudience: "admin" as const,
        notifyAdmin: true,
        stateOperatorNotificationReason: "unmapped_event_review",
      };
  }
}

/**
 * Flat, GHL-friendly routing fields. Keeping these properties at the top level
 * avoids fragile nested-field conditions in GoHighLevel workflows.
 */
export function ghlRoutingFieldsForEvent(eventValue: unknown, context: RoutingContext = {}) {
  const event = text(eventValue);
  const decision = eventRouting(event, context);
  const operator = context.stateOperator || {};
  const stateOperatorId = text(operator.id);
  const stateOperatorGhlUserId = text(operator.ghlUserId);
  const stateOperatorFullName = text(operator.fullName);
  const stateOperatorEmail = text(operator.email).toLowerCase();
  const stateOperatorPhone = text(operator.phone);
  const operatorContactAvailable = Boolean(
    stateOperatorId || stateOperatorEmail || stateOperatorPhone,
  );
  const operatorGhlUserConfigured = Boolean(stateOperatorGhlUserId);
  const operatorRequired = Boolean(decision.stateOperatorNotificationReason);
  const externalAudiences = [
    decision.notifyApplicant ? "applicant" : "",
    decision.notifyPartner ? "partner" : "",
    decision.notifyCustomer ? "customer" : "",
    decision.notifyInvitee ? "invitee" : "",
    decision.notifyInviter ? "inviter" : "",
  ].filter(Boolean);
  const secondaryAudience = externalAudiences.find((audience) => audience !== decision.primaryAudience) || "";
  const eligiblePartnerCount = Number(context.eligiblePartnerCount);
  const normalizedEligiblePartnerCount = Number.isFinite(eligiblePartnerCount)
    ? Math.max(0, Math.round(eligiblePartnerCount))
    : null;

  return {
    routingVersion: 1,
    communicationEvent: event,
    workflowRouter: decision.workflowRouter,
    primaryAudience: decision.primaryAudience,
    secondaryAudience,
    externalRecipientCount: externalAudiences.length,
    externalDeliveryMode: externalAudiences.length > 1
      ? "multi_contact"
      : externalAudiences.length === 1
        ? "single_contact"
        : "internal_only",
    requiresSecondaryContactWorkflow: externalAudiences.length > 1,
    notifyApplicant: decision.notifyApplicant === true,
    notifyPartner: decision.notifyPartner === true,
    notifyCustomer: decision.notifyCustomer === true,
    notifyAdmin: decision.notifyAdmin === true,
    notifyInvitee: decision.notifyInvitee === true,
    notifyInviter: decision.notifyInviter === true,
    notifyStateOperator: operatorRequired && operatorGhlUserConfigured,
    marketCountryCode: text(context.marketCountryCode) || "US",
    marketState: text(context.marketState),
    marketCounty: text(context.marketCounty),
    marketCity: text(context.marketCity),
    marketCoverageStatus: context.coverageAvailable === true
      ? "available"
      : context.coverageAvailable === false
        ? "unavailable"
        : "unknown",
    marketAvailabilityStatus: context.availabilityAvailable === true
      ? "available"
      : context.availabilityAvailable === false
        ? "unavailable"
        : "unknown",
    eligiblePartnerCount: normalizedEligiblePartnerCount,
    stateOperatorNotificationRequired: operatorRequired,
    stateOperatorNotificationReason: decision.stateOperatorNotificationReason,
    stateOperatorContactAvailable: operatorContactAvailable,
    stateOperatorGhlUserConfigured: operatorGhlUserConfigured,
    stateOperatorMatchStatus: operatorRequired
      ? operatorGhlUserConfigured
        ? "matched"
        : operatorContactAvailable
          ? "contact_only"
          : "not_configured"
      : "not_required",
    stateOperatorDeliveryRoute: operatorRequired
      ? operatorGhlUserConfigured ? "ghl_internal_user" : "admin_fallback"
      : "none",
    stateOperatorResolutionKey: [text(context.marketCountryCode) || "US", text(context.marketState)]
      .filter(Boolean)
      .join("|")
      .toLowerCase(),
    stateOperatorId,
    stateOperatorGhlUserId,
    stateOperatorFullName,
    stateOperatorEmail,
    stateOperatorPhone,
  };
}

function personFromPayload(payload: PayloadRecord, audience: GhlPrimaryAudience) {
  const applicant = record(payload.applicant);
  const partner = record(payload.partner);
  const lead = record(payload.lead);
  const leadPrimaryPatient = record(lead.primaryPatient);
  const customer = record(payload.patient || payload.customer || leadPrimaryPatient);
  const invitee = record(payload.invitee);
  const inviter = record(payload.inviter);
  const source = audience === "applicant" ? applicant
    : audience === "partner" ? partner
      : audience === "customer" ? customer
        : audience === "invitee" ? invitee
          : audience === "inviter" ? inviter
            : {};

  const firstName = text(
    source.firstName ||
    (audience === "partner" ? payload.partnerFirstName : "") ||
    (audience === "customer" ? payload.patientFirstName : "") ||
    payload.firstName,
  );
  const lastName = text(
    source.lastName ||
    (audience === "partner" ? payload.partnerLastName : "") ||
    (audience === "customer" ? payload.patientLastName : "") ||
    payload.lastName,
  );
  const fullName = text(
    source.fullName ||
    (audience === "partner" ? payload.partnerFullName : "") ||
    payload.fullName,
  ) || `${firstName} ${lastName}`.trim();
  const email = text(
    source.email ||
    (audience === "partner" ? payload.partnerEmail : "") ||
    (audience === "customer" ? payload.patientEmail : "") ||
    payload.email,
  ).toLowerCase();
  const phone = text(
    source.phone || source.phoneNumber ||
    (audience === "partner" ? payload.partnerPhone : "") ||
    (audience === "customer" ? payload.patientPhone : "") ||
    payload.phone || payload.phoneNumber,
  );
  const id = text(source.id || source.accountId || source.contactId);

  return { id, firstName, lastName, fullName, email, phone };
}

/**
 * Complete GHL envelope for the final payload. It exposes a normalized contact
 * at the top level so every router can map the current contact the same way.
 */
export function ghlRoutingFieldsForPayload(
  eventValue: unknown,
  payloadValue: unknown,
  context: RoutingContext = {},
) {
  const payload = record(payloadValue);
  const routing = ghlRoutingFieldsForEvent(eventValue, context);
  const recipient = personFromPayload(payload, routing.primaryAudience);
  const secondaryRecipient = routing.secondaryAudience
    ? personFromPayload(payload, routing.secondaryAudience as GhlPrimaryAudience)
    : { id: "", firstName: "", lastName: "", fullName: "", email: "", phone: "" };
  const additionalPatients = Array.isArray(payload.additionalPatients)
    ? payload.additionalPatients.filter((patient) => patient && typeof patient === "object")
    : [];
  const additionalPatientLoopRequired = text(eventValue) === "new_booking" && additionalPatients.length > 0;
  return {
    ...routing,
    primaryRecipientRole: routing.primaryAudience,
    primaryRecipientId: recipient.id,
    primaryRecipientFirstName: recipient.firstName,
    primaryRecipientLastName: recipient.lastName,
    primaryRecipientFullName: recipient.fullName,
    primaryRecipientEmail: recipient.email,
    primaryRecipientPhone: recipient.phone,
    primaryRecipientReady: Boolean(recipient.email || recipient.phone),
    secondaryRecipientRole: routing.secondaryAudience,
    secondaryRecipientId: secondaryRecipient.id,
    secondaryRecipientFirstName: secondaryRecipient.firstName,
    secondaryRecipientLastName: secondaryRecipient.lastName,
    secondaryRecipientFullName: secondaryRecipient.fullName,
    secondaryRecipientEmail: secondaryRecipient.email,
    secondaryRecipientPhone: secondaryRecipient.phone,
    secondaryRecipientReady: Boolean(secondaryRecipient.email || secondaryRecipient.phone),
    notifyAdditionalPatients: additionalPatientLoopRequired,
    additionalPatientLoopRequired,
    additionalPatientLoopPath: additionalPatientLoopRequired ? "additionalPatients" : "",
    additionalPatientRecipientCount: additionalPatients.length,
  };
}
