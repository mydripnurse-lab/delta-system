type PatientSource = Record<string, unknown>;

export type AppointmentPatientRecipient = {
  role: "primary_patient" | "additional_patient";
  sequence: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  contactKey: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): PatientSource {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PatientSource
    : {};
}

function splitName(value: unknown) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

export function normalizePatientEmail(value: unknown) {
  const email = text(value).toLowerCase();
  return email.includes("@") ? email : "";
}

export function normalizePatientPhone(value: unknown) {
  const raw = text(value);
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

function patientIdentity(value: unknown) {
  const source = record(value);
  const split = splitName(source.fullName || source.full_name || source.name);
  const firstName = text(source.firstName || source.first_name) || split.firstName;
  const lastName = text(source.lastName || source.last_name) || split.lastName;
  const fullName = text(source.fullName || source.full_name || source.name)
    || `${firstName} ${lastName}`.trim();
  const email = normalizePatientEmail(source.email);
  const phone = normalizePatientPhone(source.phone || source.phoneNumber || source.phone_number);
  const contactKey = email ? `email:${email}` : phone ? `phone:${phone}` : "";
  return { firstName, lastName, fullName, email, phone, contactKey };
}

/**
 * Produces the smallest safe fan-out list for GHL. Email wins as the identity
 * key, phone is the fallback, and repeated patients are emitted only once.
 */
export function buildAppointmentPatientRecipients(input: {
  primaryPatient?: unknown;
  additionalPatients?: unknown;
  includePrimary?: boolean;
}) {
  const candidates: Array<{ role: AppointmentPatientRecipient["role"]; value: unknown }> = [];
  if (input.includePrimary !== false && input.primaryPatient) {
    candidates.push({ role: "primary_patient", value: input.primaryPatient });
  }
  if (Array.isArray(input.additionalPatients)) {
    for (const value of input.additionalPatients) {
      candidates.push({ role: "additional_patient", value });
    }
  }

  const recipients: AppointmentPatientRecipient[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const candidate of candidates) {
    const identity = patientIdentity(candidate.value);
    if (!identity.contactKey || seen.has(identity.contactKey)) {
      skipped += 1;
      continue;
    }
    seen.add(identity.contactKey);
    recipients.push({
      ...identity,
      role: candidate.role,
      sequence: recipients.length + 1,
    });
  }
  return { recipients, skipped, candidateCount: candidates.length };
}

export function patientFanoutFields(input: {
  appointmentId: string;
  event: string;
  recipient: AppointmentPatientRecipient;
  recipientCount: number;
  skippedCount?: number;
}) {
  const recipient = input.recipient;
  const channels = [recipient.phone ? "sms" : "", recipient.email ? "email" : ""].filter(Boolean);
  return {
    notificationSchemaVersion: 1,
    notificationGroupType: "appointment",
    notificationGroupId: input.appointmentId,
    fanoutStrategy: "one_event_per_recipient",
    communicationScope: "all_patients",
    recipientSequence: recipient.sequence,
    recipientCount: input.recipientCount,
    skippedPatientRecipientsCount: Math.max(0, Number(input.skippedCount || 0)),
    recipientRole: recipient.role,
    recipientIsPrimary: recipient.role === "primary_patient",
    recipientDeduplicationKey: recipient.contactKey,
    notificationChannels: channels,
    sendSms: Boolean(recipient.phone),
    sendEmail: Boolean(recipient.email),
    contactAction: "upsert",
    createOrUpdateGhlContact: true,
    communicationPurpose: "transactional_appointment",
    marketingConsentStatus: "not_captured",
    allowMarketingAutomation: false,
    contactTags: ["MDN Patient", "MDN Appointment Participant"],
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    fullName: recipient.fullName,
    email: recipient.email,
    phone: recipient.phone,
    patientFirstName: recipient.firstName,
    patientLastName: recipient.lastName,
    patientEmail: recipient.email,
    patientPhone: recipient.phone,
    patient: {
      firstName: recipient.firstName,
      lastName: recipient.lastName,
      fullName: recipient.fullName,
      email: recipient.email,
      phone: recipient.phone,
      role: recipient.role,
    },
  };
}

export async function postPatientFanout(input: {
  webhookUrl: string;
  event: string;
  payloads: Array<Record<string, unknown>>;
}) {
  const deliveries = await Promise.all(input.payloads.map(async (payload) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(input.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-MDN-Event": input.event,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      return { sent: response.ok, status: response.status, reason: response.ok ? "" : `http_${response.status}` };
    } catch (error) {
      return { sent: false, status: 0, reason: error instanceof Error ? error.message : "request_failed" };
    } finally {
      clearTimeout(timeout);
    }
  }));
  const sentCount = deliveries.filter((delivery) => delivery.sent).length;
  return {
    sent: deliveries.length > 0 && sentCount === deliveries.length,
    sentCount,
    failedCount: deliveries.length - sentCount,
    deliveries,
  };
}
