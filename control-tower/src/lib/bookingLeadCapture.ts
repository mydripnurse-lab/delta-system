import { createHash } from "node:crypto";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";
import { ghlRoutingFieldsForEvent, ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";
import { attributionSessionSummary, recordBookingAttributionTouchpoint } from "@/lib/bookingAttribution";

type LeadPerson = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  weight?: string;
  height?: string;
};

type LeadAddress = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode?: string;
  longitude?: number;
  latitude?: number;
};

type EligiblePartner = {
  id: string;
  displayName: string;
  businessName: string;
  profilePhotoUrl?: string;
};

export type BookingLeadCaptureInput = {
  publicKey: string;
  idempotencyKey: string;
  requestedDate?: string;
  timezone?: string;
  requestedPartnerId?: string;
  customer: LeadPerson;
  attendees?: LeadPerson[];
  address: LeadAddress;
  medicalScreening: {
    selected: string[];
    noneSelected: boolean;
    completedAt?: string;
  };
  sourceUrl?: string;
  pageUrl?: string;
  referrer?: string;
  attribution?: Record<string, string>;
  visitorId?: string;
  sessionId?: string;
  eligiblePartners?: EligiblePartner[];
  availabilityDiagnostics?: {
    availabilityChecked: boolean;
    coverageAvailable?: boolean | null;
    availableSlotCount: number;
  };
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

function splitPersonName(value: unknown) {
  const parts = text(value).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function webhookPerson(person: LeadPerson) {
  const firstName = text(person.firstName);
  const lastName = text(person.lastName);
  const phone = text(person.phone);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return {
    ...person,
    firstName,
    first_name: firstName,
    lastName,
    last_name: lastName,
    fullName,
    full_name: fullName,
    email: text(person.email),
    phone,
    phoneNumber: phone,
    phone_number: phone,
  };
}

function validWebhookUrl(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

function uniquePartners(value: EligiblePartner[] | undefined) {
  const seen = new Set<string>();
  return (value || []).filter((partner) => {
    const id = text(partner.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((partner) => ({
    id: text(partner.id),
    displayName: text(partner.displayName),
    businessName: text(partner.businessName),
    profilePhotoUrl: text(partner.profilePhotoUrl),
  }));
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normalizedPhone(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function canonicalLeadIdentity(input: BookingLeadCaptureInput) {
  const email = normalizedEmail(input.customer.email);
  const phone = normalizedPhone(input.customer.phone);
  // Phone is required by the booking flow and remains stable across reloads,
  // dates, services and addresses. Email is retained for matching and audit.
  const identity = phone ? `phone:${phone}` : `email:${email}`;
  return {
    email,
    phone,
    key: createHash("sha256").update(identity).digest("hex"),
  };
}

/**
 * Captures or refreshes one canonical lead per person. Delivery is deferred
 * until ten minutes after the latest activity and is handled by the durable
 * cron queue below, never by the customer's booking request.
 */
export async function captureBookingLead(input: BookingLeadCaptureInput) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const calendar = await pool.query<{
    organization_id: string;
    organization_name: string;
    service_id: string;
    service_slug: string;
    service_name: string;
    public_key: string;
    price: string;
    currency: string;
    deposit_type: "percentage" | "fixed";
    deposit_value: string;
  }>(
    `select s.organization_id::text,
            o.name as organization_name,
            s.id::text as service_id,
            s.slug as service_slug,
            s.name as service_name,
            c.public_key,
            s.price::text,
            s.currency,
            s.deposit_type,
            s.deposit_value::text
       from app.service_calendars c
       join app.services s on s.id = c.service_id
       join app.organizations o on o.id = s.organization_id
      where c.public_key = $1
      limit 1`,
    [input.publicKey],
  );
  const row = calendar.rows[0];
  if (!row) throw new Error("The service calendar was not found.");

  const requestedPartnerResult = isUuid(input.requestedPartnerId)
    ? await pool.query<{
        id: string;
        display_name: string;
        business_name: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
      }>(
        `select pp.id::text as id,
                pp.display_name,
                pp.business_name,
                pp.email,
                application.first_name,
                application.last_name,
                application.phone
           from app.partner_profiles pp
           left join app.staff_applications application on application.id = pp.application_id
          where pp.id = $1::uuid
            and pp.organization_id = $2::uuid
          limit 1`,
        [input.requestedPartnerId, row.organization_id],
      )
    : { rows: [] };
  const requestedPartnerRow = requestedPartnerResult.rows[0];
  const partnerDisplayName = text(requestedPartnerRow?.display_name);
  const splitPartnerName = splitPersonName(partnerDisplayName);
  const partnerFirstName = text(requestedPartnerRow?.first_name) || splitPartnerName.firstName;
  const partnerLastName = text(requestedPartnerRow?.last_name) || splitPartnerName.lastName;
  const partnerPhone = text(requestedPartnerRow?.phone);
  const partnerFullName = [partnerFirstName, partnerLastName].filter(Boolean).join(" ")
    || partnerDisplayName;
  const requestedPartner = requestedPartnerRow ? {
    id: requestedPartnerRow.id,
    displayName: partnerDisplayName,
    businessName: text(requestedPartnerRow.business_name),
    firstName: partnerFirstName,
    first_name: partnerFirstName,
    lastName: partnerLastName,
    last_name: partnerLastName,
    fullName: partnerFullName,
    full_name: partnerFullName,
    email: text(requestedPartnerRow.email),
    phone: partnerPhone,
    phoneNumber: partnerPhone,
    phone_number: partnerPhone,
  } : null;

  const clientIdempotencyKey = text(input.idempotencyKey);
  if (!clientIdempotencyKey) throw new Error("A lead idempotency key is required.");
  const identity = canonicalLeadIdentity(input);
  // The server key intentionally excludes service, date and address so one
  // person remains one lead while they refine the same booking journey.
  const idempotencyKey = `booking.lead.created:${identity.key}`;
  const capturedAt = new Date().toISOString();
  const primaryPatient = webhookPerson(input.customer);
  const additionalPatients = (input.attendees || []).map(webhookPerson);
  if (input.sessionId && input.visitorId && (input.pageUrl || input.sourceUrl)) {
    await recordBookingAttributionTouchpoint({
      eventId: `lead:${clientIdempotencyKey}:${Date.now()}`,
      eventType: input.availabilityDiagnostics?.availabilityChecked ? "availability_searched" : "booking_started",
      sessionId: input.sessionId,
      visitorId: input.visitorId,
      pageUrl: input.pageUrl || input.sourceUrl || "",
      referrer: input.referrer,
      serviceSlug: row.service_slug,
      partnerProfileId: input.requestedPartnerId,
      attribution: input.attribution,
      occurredAt: capturedAt,
    }).catch(() => undefined);
  }
  const journey = await attributionSessionSummary(text(input.sessionId)).catch(() => null);
  const payload = {
    event: "booking.lead.created",
    version: 1,
    success: true,
    ...ghlRoutingFieldsForEvent("booking.lead.created", {
      marketCountryCode: input.address.countryCode,
      marketState: input.address.state,
      marketCounty: input.address.county,
      marketCity: input.address.city,
      noEligiblePartners: uniquePartners(input.eligiblePartners).length === 0,
      coverageAvailable: input.availabilityDiagnostics?.coverageAvailable,
      availabilityAvailable: input.availabilityDiagnostics?.availabilityChecked === true
        ? Math.max(0, Math.round(Number(input.availabilityDiagnostics?.availableSlotCount) || 0)) > 0
        : null,
      eligiblePartnerCount: uniquePartners(input.eligiblePartners).length,
    }),
    idempotencyKey,
    clientIdempotencyKey,
    capturedAt,
    bookingAttemptCount: 1,
    deduplicatedLead: true,
    followUpDelayMinutes: 10,
    organization: { id: row.organization_id, name: row.organization_name, slug: "my-drip-nurse" },
    firstName: primaryPatient.firstName,
    lastName: primaryPatient.lastName,
    patientFirstName: primaryPatient.firstName,
    patientLastName: primaryPatient.lastName,
    patientPhone: primaryPatient.phone,
    patient_first_name: primaryPatient.first_name,
    patient_last_name: primaryPatient.last_name,
    patient_phone: primaryPatient.phone_number,
    partnerFirstName: requestedPartner?.firstName ?? "",
    partnerLastName: requestedPartner?.lastName ?? "",
    partnerPhone: requestedPartner?.phone ?? "",
    partner_first_name: requestedPartner?.first_name ?? "",
    partner_last_name: requestedPartner?.last_name ?? "",
    partner_phone: requestedPartner?.phone_number ?? "",
    hasAdditionalPatients: additionalPatients.length > 0,
    additionalPatientsCount: additionalPatients.length,
    additionalPatients,
    lead: {
      primaryPatient,
      hasAdditionalPatients: additionalPatients.length > 0,
      additionalPatientsCount: additionalPatients.length,
      additionalPatients,
      medicalScreening: {
        eligible: input.medicalScreening.noneSelected,
        selected: input.medicalScreening.selected,
        completedAt: input.medicalScreening.completedAt || capturedAt,
      },
    },
    service: {
      id: row.service_id,
      slug: row.service_slug,
      name: row.service_name,
      calendarPublicKey: row.public_key,
      price: Number(row.price) || 0,
      currency: row.currency,
      depositType: row.deposit_type,
      depositValue: Number(row.deposit_value) || 0,
    },
    coverage: {
      addressLine1: input.address.addressLine1,
      addressLine2: input.address.addressLine2,
      city: input.address.city,
      county: input.address.county,
      state: input.address.state,
      postalCode: input.address.postalCode,
      countryCode: text(input.address.countryCode) || "US",
    },
    appointmentRequest: {
      requestedDate: text(input.requestedDate),
      timezone: text(input.timezone),
      requestedPartnerId: text(input.requestedPartnerId),
      requestedPartner,
      eligiblePartners: uniquePartners(input.eligiblePartners),
    },
    source: {
      sourceUrl: text(input.sourceUrl),
      pageUrl: text(input.pageUrl),
      referrer: text(input.referrer),
      attribution: input.attribution || {},
      visitorId: text(input.visitorId),
      sessionId: text(input.sessionId),
      journey,
    },
  };
  Object.assign(payload, ghlRoutingFieldsForPayload("booking.lead.created", payload, {
    marketCountryCode: input.address.countryCode,
    marketState: input.address.state,
    marketCounty: input.address.county,
    marketCity: input.address.city,
    noEligiblePartners: uniquePartners(input.eligiblePartners).length === 0,
    coverageAvailable: input.availabilityDiagnostics?.coverageAvailable,
    availabilityAvailable: input.availabilityDiagnostics?.availabilityChecked === true
      ? Math.max(0, Math.round(Number(input.availabilityDiagnostics?.availableSlotCount) || 0)) > 0
      : null,
    eligiblePartnerCount: uniquePartners(input.eligiblePartners).length,
  }));
  // Operational diagnostics are stored for Admin analytics only. They are
  // deliberately excluded from the established GHL webhook payload.
  const storedPayload = {
    ...payload,
    _internalAnalytics: {
      availabilityChecked: input.availabilityDiagnostics?.availabilityChecked === true,
      coverageAvailable: typeof input.availabilityDiagnostics?.coverageAvailable === "boolean"
        ? input.availabilityDiagnostics.coverageAvailable
        : null,
      availableSlotCount: Math.max(0, Math.round(Number(input.availabilityDiagnostics?.availableSlotCount) || 0)),
      longitude: Number.isFinite(input.address.longitude) ? input.address.longitude : null,
      latitude: Number.isFinite(input.address.latitude) ? input.address.latitude : null,
    },
  };

  const reserved = await pool.query<{ id: string; status: string; attempt_count: number; send_after: string }>(
    `insert into app.booking_lead_events
       (organization_id, idempotency_key, identity_key, normalized_email, normalized_phone,
        public_key, payload, status, attempt_count, last_activity_at, send_after,
        attribution_session_id, attribution_visitor_id)
     values ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, 'pending', 1, now(), now() + interval '10 minutes', $8, $9)
     on conflict (organization_id, identity_key) where identity_key <> ''
     do update set
       idempotency_key = excluded.idempotency_key,
       normalized_email = excluded.normalized_email,
       normalized_phone = excluded.normalized_phone,
       public_key = excluded.public_key,
       attribution_session_id = excluded.attribution_session_id,
       attribution_visitor_id = excluded.attribution_visitor_id,
       payload = jsonb_set(
         excluded.payload,
         '{bookingAttemptCount}',
         to_jsonb(app.booking_lead_events.attempt_count + 1),
         true
       ),
       attempt_count = app.booking_lead_events.attempt_count + 1,
       last_activity_at = now(),
       status = case
         when app.booking_lead_events.status in ('processing', 'sent', 'converted') then app.booking_lead_events.status
         else 'pending'
       end,
       send_after = case
         when app.booking_lead_events.status in ('processing', 'sent', 'converted') then app.booking_lead_events.send_after
         else now() + interval '10 minutes'
       end,
       next_attempt_at = null,
       processing_started_at = case when app.booking_lead_events.status = 'processing' then app.booking_lead_events.processing_started_at else null end,
       retry_count = case when app.booking_lead_events.status in ('processing', 'sent', 'converted') then app.booking_lead_events.retry_count else 0 end,
       error = case when app.booking_lead_events.status in ('processing', 'sent', 'converted') then app.booking_lead_events.error else '' end,
       updated_at = now()
     returning id::text, status, attempt_count, send_after::text`,
    [row.organization_id, idempotencyKey, identity.key, identity.email, identity.phone, row.public_key, JSON.stringify(storedPayload), text(input.sessionId), text(input.visitorId)],
  );
  const event = reserved.rows[0];
  return {
    status: event.status === "sent" || event.status === "converted" ? "already_captured" as const : "queued" as const,
    eventId: event.id,
    eventStatus: event.status,
    attemptCount: event.attempt_count,
    sendAfter: event.send_after,
  };
}

type ClaimedLeadDelivery = {
  id: string;
  organization_id: string;
  idempotency_key: string;
  payload: Record<string, unknown>;
  retry_count: number;
};

/**
 * Claims due rows without blocking parallel workers, then performs network
 * delivery outside the database transaction. GHL receives the canonical
 * idempotency key in both the payload and headers.
 */
export async function processDueBookingLeadWebhooks(limit = 25) {
  await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
  const pool = getDbPool();
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));

  await pool.query(
    `update app.booking_lead_events
        set status = 'pending', processing_started_at = null,
            next_attempt_at = now(), updated_at = now()
      where status = 'processing'
        and processing_started_at < now() - interval '5 minutes'`,
  );

  const claimed = await pool.query<ClaimedLeadDelivery>(
    `with due as (
       select id
         from app.booking_lead_events
        where status = 'pending'
          and identity_key <> ''
          and converted_at is null
          and coalesce(next_attempt_at, send_after) <= now()
        order by coalesce(next_attempt_at, send_after), created_at
        limit $1
        for update skip locked
     )
     update app.booking_lead_events event
        set status = 'processing', processing_started_at = now(), updated_at = now()
       from due
      where event.id = due.id
      returning event.id::text, event.organization_id::text, event.idempotency_key,
                event.payload, event.retry_count`,
    [safeLimit],
  );
  if (!claimed.rows.length) return { claimed: 0, sent: 0, retried: 0, failed: 0, notConfigured: 0 };

  const organizationIds = [...new Set(claimed.rows.map((row) => row.organization_id))];
  const configs = await pool.query<{ organization_id: string; webhook_url: string | null }>(
    `select organization_id::text, lead_capture_webhook_url as webhook_url
       from app.staff_form_configs
      where organization_id = any($1::uuid[])`,
    [organizationIds],
  );
  const webhookByOrganization = new Map<string, string>(
    configs.rows.map((row) => [row.organization_id, validWebhookUrl(row.webhook_url)] as const),
  );
  const totals = { claimed: claimed.rows.length, sent: 0, retried: 0, failed: 0, notConfigured: 0 };

  for (const event of claimed.rows) {
    const webhookUrl = webhookByOrganization.get(event.organization_id) || "";
    if (!webhookUrl) {
      totals.notConfigured += 1;
      await pool.query(
        `update app.booking_lead_events
            set status = 'pending', processing_started_at = null,
                next_attempt_at = now() + interval '1 hour',
                error = 'Lead capture webhook is not configured.', updated_at = now()
          where id = $1::uuid and status = 'processing'`,
        [event.id],
      );
      continue;
    }

    const webhookPayload = { ...(event.payload || {}) };
    delete webhookPayload._internalAnalytics;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-MDN-Event": "booking.lead.created",
          "X-MDN-Event-Id": event.id,
          "X-MDN-Idempotency-Key": event.idempotency_key,
          "Idempotency-Key": event.idempotency_key,
        },
        body: JSON.stringify(webhookPayload),
        signal: controller.signal,
        cache: "no-store",
      });
      const responseText = (await response.text()).slice(0, 2000);
      if (!response.ok) throw new Error(`Lead capture webhook returned HTTP ${response.status}.`);
      const updated = await pool.query(
        `update app.booking_lead_events
            set status = 'sent', http_status = $2, response_text = $3,
                error = '', sent_at = now(), processing_started_at = null, updated_at = now()
          where id = $1::uuid and status = 'processing' and converted_at is null`,
        [event.id, response.status, responseText],
      );
      if (updated.rowCount) totals.sent += 1;
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Lead capture webhook timed out after 8 seconds."
        : error instanceof Error ? error.message : "Lead capture webhook failed.";
      const nextRetryCount = event.retry_count + 1;
      const terminal = nextRetryCount >= 3;
      await pool.query(
        `update app.booking_lead_events
            set status = $2, retry_count = $3, processing_started_at = null,
                next_attempt_at = case when $2 = 'pending' then now() + ($4::text || ' minutes')::interval else null end,
                error = $5, updated_at = now()
          where id = $1::uuid and status = 'processing' and converted_at is null`,
        [event.id, terminal ? "failed" : "pending", nextRetryCount, Math.min(30, 2 ** nextRetryCount), message],
      );
      if (terminal) totals.failed += 1;
      else totals.retried += 1;
    } finally {
      clearTimeout(timeout);
    }
  }
  return totals;
}

/** Marks a pending lead as converted only after the appointment is paid. */
export async function markBookingLeadConverted(appointmentId: string) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query(
    `with confirmed_customer as (
       select appointment.id, appointment.organization_id,
              lower(trim(customer.email)) as normalized_email,
              regexp_replace(customer.phone, '[^0-9]', '', 'g') as normalized_phone
         from app.appointments appointment
         join app.booking_customers customer on customer.id = appointment.customer_id
        where appointment.id = $1::uuid
          and appointment.status in ('confirmed', 'partner_acknowledged', 'in_progress', 'completed')
     )
     update app.booking_lead_events event
        set status = case when event.status = 'sent' then 'sent' else 'converted' end,
            converted_at = coalesce(event.converted_at, now()),
            appointment_id = confirmed_customer.id,
            processing_started_at = null,
            next_attempt_at = null,
            updated_at = now()
       from confirmed_customer
      where event.organization_id = confirmed_customer.organization_id
        and event.converted_at is null
        and (
          (event.normalized_email <> '' and event.normalized_email = confirmed_customer.normalized_email)
          or (event.normalized_phone <> '' and right(event.normalized_phone, 10) = right(confirmed_customer.normalized_phone, 10))
          or lower(event.payload #>> '{lead,primaryPatient,email}') = confirmed_customer.normalized_email
          or right(regexp_replace(event.payload #>> '{lead,primaryPatient,phone}', '[^0-9]', '', 'g'), 10) = right(confirmed_customer.normalized_phone, 10)
        )`,
    [appointmentId],
  );
  return { converted: result.rowCount || 0 };
}
