import { createHash } from "node:crypto";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { getDbPool } from "@/lib/db";

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
  eligiblePartners?: EligiblePartner[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
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

function canonicalLeadKey(input: BookingLeadCaptureInput, serviceId: string) {
  const normalized = {
    serviceId,
    publicKey: text(input.publicKey),
    requestedDate: text(input.requestedDate),
    customer: {
      email: text(input.customer.email).toLowerCase(),
      phone: text(input.customer.phone).replace(/\D/g, ""),
    },
    attendees: (input.attendees || []).map((person) => ({
      email: text(person.email).toLowerCase(),
      phone: text(person.phone).replace(/\D/g, ""),
    })).sort((a, b) => `${a.email}:${a.phone}`.localeCompare(`${b.email}:${b.phone}`)),
    address: {
      line1: text(input.address.addressLine1).toLowerCase(),
      line2: text(input.address.addressLine2).toLowerCase(),
      city: text(input.address.city).toLowerCase(),
      county: text(input.address.county).toLowerCase(),
      state: text(input.address.state).toLowerCase(),
      postalCode: text(input.address.postalCode).toLowerCase(),
      countryCode: text(input.address.countryCode || "US").toUpperCase(),
    },
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/**
 * Captures a lead independently from appointment creation. The event is first
 * reserved with a unique key, then sent once to the single Admin-configured
 * webhook. A duplicate request returns the existing event and never sends a
 * second outbound request.
 */
export async function captureBookingLead(input: BookingLeadCaptureInput) {
  await Promise.all([ensureBookingEngineSchema(), ensureStaffSchema()]);
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
    webhook_url: string | null;
  }>(
    `select s.organization_id::text,
            o.name as organization_name,
            s.id::text as service_id,
            s.slug as service_slug,
            s.name as service_name,
            c.public_key,
            s.price::text,
            s.currency,
            cfg.lead_capture_webhook_url as webhook_url
       from app.service_calendars c
       join app.services s on s.id = c.service_id
       join app.organizations o on o.id = s.organization_id
       left join app.staff_form_configs cfg on cfg.organization_id = s.organization_id
      where c.public_key = $1
      limit 1`,
    [input.publicKey],
  );
  const row = calendar.rows[0];
  if (!row) throw new Error("The service calendar was not found.");
  const webhookUrl = validWebhookUrl(row.webhook_url);
  if (!webhookUrl) return { status: "not_configured" as const };

  const clientIdempotencyKey = text(input.idempotencyKey);
  if (!clientIdempotencyKey) throw new Error("A lead idempotency key is required.");
  // The server-owned key is stable across reloads, retries, and navigation.
  // This prevents a billable webhook from being sent twice for the same lead.
  const idempotencyKey = canonicalLeadKey(input, row.service_id);
  const capturedAt = new Date().toISOString();
  const payload = {
    event: "booking.lead.created",
    version: 1,
    success: true,
    idempotencyKey,
    clientIdempotencyKey,
    capturedAt,
    organization: { id: row.organization_id, name: row.organization_name, slug: "my-drip-nurse" },
    lead: {
      primaryPatient: input.customer,
      additionalPatients: input.attendees || [],
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
    },
    coverage: {
      ...input.address,
      countryCode: text(input.address.countryCode) || "US",
    },
    appointmentRequest: {
      requestedDate: text(input.requestedDate),
      timezone: text(input.timezone),
      requestedPartnerId: text(input.requestedPartnerId),
      eligiblePartners: uniquePartners(input.eligiblePartners),
    },
    source: {
      sourceUrl: text(input.sourceUrl),
      pageUrl: text(input.pageUrl),
      referrer: text(input.referrer),
      attribution: input.attribution || {},
    },
  };

  const reserved = await pool.query<{ id: string; status: string }>(
    `insert into app.booking_lead_events
       (organization_id, idempotency_key, public_key, payload, status)
     values ($1::uuid, $2, $3, $4::jsonb, 'pending')
     on conflict (organization_id, idempotency_key) do nothing
     returning id, status`,
    [row.organization_id, idempotencyKey, row.public_key, JSON.stringify(payload)],
  );
  if (!reserved.rows[0]) {
    const existing = await pool.query<{ status: string }>(
      `select status from app.booking_lead_events where organization_id = $1::uuid and idempotency_key = $2 limit 1`,
      [row.organization_id, idempotencyKey],
    );
    return { status: "already_captured" as const, eventStatus: existing.rows[0]?.status || "pending" };
  }

  const eventId = reserved.rows[0].id;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MDN-Event": "booking.lead.created",
        "X-MDN-Event-Id": eventId,
        "X-MDN-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const responseText = (await response.text()).slice(0, 2000);
    if (!response.ok) throw new Error(`Lead capture webhook returned HTTP ${response.status}.`);
    await pool.query(
      `update app.booking_lead_events
          set status = 'sent', http_status = $2, response_text = $3, sent_at = now(), updated_at = now()
        where id = $1`,
      [eventId, response.status, responseText],
    );
    return { status: "sent" as const, eventId };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Lead capture webhook timed out after 8 seconds."
      : error instanceof Error ? error.message : "Lead capture webhook failed.";
    await pool.query(
      `update app.booking_lead_events set status = 'failed', error = $2, updated_at = now() where id = $1`,
      [eventId, message],
    );
    // The event remains failed and is deliberately not retried automatically:
    // the configured endpoint is billable and this flow guarantees at-most-once delivery.
    return { status: "failed" as const, eventId, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
