import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";

export type AdminContactLocation = {
  address: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
};

export type AdminBookingContact = {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  source: "appointment" | "lead" | "demand";
  leadIntentCount: number;
  lostOpportunity: boolean;
  appointmentCount: number;
  completedCount: number;
  upcomingCount: number;
  lifetimeValue: number;
  currency: string;
  firstSeenAt: string;
  lastSeenAt: string;
  locations: AdminContactLocation[];
  services: string[];
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

function contactKey(email: string, phone: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedPhone = phone.replace(/\D/g, "");
  return normalizedPhone ? `phone:${normalizedPhone.slice(-10)}` : `email:${normalizedEmail}`;
}

function uniqueLocations(locations: AdminContactLocation[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = [location.address, location.city, location.county, location.state, location.postalCode].join("|").toLowerCase();
    if (!key.replaceAll("|", "") || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function listAdminBookingContacts(options: { search?: string; limit?: number; from?: string; to?: string; relationship?: string } = {}) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const search = text(options.search);
  const limit = Math.min(750, Math.max(1, Number(options.limit || 400)));
  const values: unknown[] = [];
  let where = "";
  if (search) {
    values.push(`%${search}%`);
    where = `where customer.full_name ilike $1 or customer.email ilike $1 or customer.phone ilike $1
      or exists (select 1 from app.appointments search_appointment where search_appointment.customer_id = customer.id and (search_appointment.city ilike $1 or search_appointment.county ilike $1 or search_appointment.state ilike $1))`;
  }
  values.push(limit);

  const [customerResult, leadResult, demandResult] = await Promise.all([
    pool.query<{
      id: string; full_name: string; email: string; phone: string; metadata: Record<string, unknown> | null;
      created_at: string; updated_at: string; appointment_count: string; completed_count: string;
      upcoming_count: string; lifetime_value: string; currency: string; first_seen_at: string; last_seen_at: string;
      date_of_birth: string; locations: AdminContactLocation[] | null; services: string[] | null;
    }>(
      `select customer.id::text, customer.full_name, customer.email, customer.phone, customer.metadata,
              customer.created_at::text, customer.updated_at::text,
              count(distinct appointment.id)::text as appointment_count,
              count(distinct appointment.id) filter (where appointment.status = 'completed')::text as completed_count,
              count(distinct appointment.id) filter (where appointment.starts_at >= now() and appointment.status in ('payment_pending','confirmed','partner_acknowledged','in_progress'))::text as upcoming_count,
              coalesce(sum(appointment.service_price) filter (where appointment.status = 'completed'), 0)::text as lifetime_value,
              coalesce(max(appointment.currency), 'USD') as currency,
              coalesce(min(appointment.created_at), customer.created_at)::text as first_seen_at,
              greatest(coalesce(max(appointment.updated_at), customer.updated_at), customer.updated_at)::text as last_seen_at,
              coalesce(max(nullif(appointment.metadata->'primary_patient'->>'dateOfBirth', '')), '') as date_of_birth,
              coalesce(jsonb_agg(distinct jsonb_build_object(
                'address', concat_ws(', ', nullif(appointment.address_line_1,''), nullif(appointment.address_line_2,'')),
                'city', appointment.city, 'county', appointment.county, 'state', appointment.state, 'postalCode', appointment.postal_code
              )) filter (where appointment.id is not null), '[]'::jsonb) as locations,
              coalesce(array_agg(distinct service.name) filter (where service.name is not null), array[]::text[]) as services
         from app.booking_customers customer
         left join app.appointments appointment on appointment.customer_id = customer.id
         left join app.services service on service.id = appointment.service_id
         ${where}
        group by customer.id
        order by last_seen_at desc
        limit $${values.length}`,
      values,
    ),
    pool.query<{ id: string; payload: Record<string, unknown>; status: string; created_at: string; last_activity_at: string; send_after: string; converted_at: string | null }>(
      `select id::text, payload, status, created_at::text, last_activity_at::text,
              send_after::text, converted_at::text
         from app.booking_lead_events
        order by last_activity_at desc limit 750`,
    ),
    pool.query<{ id: string; full_name: string; email: string; phone: string; city: string; county: string; state: string; postal_code: string; created_at: string }>(
      `select id::text, full_name, email, phone, city, county, state, postal_code, created_at::text from app.booking_demand_requests order by created_at desc limit 750`,
    ),
  ]);

  const contacts = new Map<string, AdminBookingContact>();
  for (const row of customerResult.rows) {
    const name = splitName(row.full_name);
    contacts.set(contactKey(row.email, row.phone), {
      id: row.id, fullName: row.full_name, ...name, email: row.email, phone: row.phone,
      dateOfBirth: row.date_of_birth, source: "appointment", appointmentCount: number(row.appointment_count),
      leadIntentCount: 0, lostOpportunity: false,
      completedCount: number(row.completed_count), upcomingCount: number(row.upcoming_count),
      lifetimeValue: number(row.lifetime_value), currency: row.currency || "USD",
      firstSeenAt: row.first_seen_at || row.created_at, lastSeenAt: row.last_seen_at || row.updated_at,
      locations: uniqueLocations(row.locations || []), services: row.services || [],
    });
  }

  const mergeProspect = (prospect: AdminBookingContact) => {
    const key = contactKey(prospect.email, prospect.phone);
    const existing = contacts.get(key);
    if (!existing) {
      contacts.set(key, prospect);
      return;
    }
    existing.locations = uniqueLocations([...existing.locations, ...prospect.locations]);
    existing.services = [...new Set([...existing.services, ...prospect.services])];
    existing.leadIntentCount += prospect.leadIntentCount;
    existing.lostOpportunity = existing.appointmentCount === 0 && (existing.lostOpportunity || prospect.lostOpportunity);
    if (new Date(prospect.lastSeenAt).getTime() > new Date(existing.lastSeenAt).getTime()) existing.lastSeenAt = prospect.lastSeenAt;
    if (!existing.dateOfBirth) existing.dateOfBirth = prospect.dateOfBirth;
  };

  const seenLeadIdentities = new Set<string>();
  for (const row of leadResult.rows) {
    const payload = row.payload || {};
    const lead = (payload.lead || {}) as Record<string, unknown>;
    const patient = (lead.primaryPatient || {}) as Record<string, unknown>;
    const coverage = (payload.coverage || {}) as Record<string, unknown>;
    const service = (payload.service || {}) as Record<string, unknown>;
    const fullName = text(patient.fullName) || [text(patient.firstName), text(patient.lastName)].filter(Boolean).join(" ");
    const email = text(patient.email); const phone = text(patient.phone);
    if (!fullName || (!email && !phone)) continue;
    const identity = contactKey(email, phone);
    if (seenLeadIdentities.has(identity)) continue;
    seenLeadIdentities.add(identity);
    mergeProspect({
      id: `lead:${row.id}`, fullName, firstName: text(patient.firstName), lastName: text(patient.lastName), email, phone,
      dateOfBirth: text(patient.dateOfBirth), source: "lead", appointmentCount: 0, completedCount: 0, upcomingCount: 0,
      leadIntentCount: 1,
      lostOpportunity: !row.converted_at && row.status !== "converted" && new Date(row.send_after).getTime() <= Date.now(),
      lifetimeValue: 0, currency: text(service.currency) || "USD", firstSeenAt: row.created_at, lastSeenAt: row.last_activity_at || row.created_at,
      locations: uniqueLocations([{ address: [text(coverage.addressLine1), text(coverage.addressLine2)].filter(Boolean).join(", "), city: text(coverage.city), county: text(coverage.county), state: text(coverage.state), postalCode: text(coverage.postalCode) }]),
      services: text(service.name) ? [text(service.name)] : [],
    });
  }

  for (const row of demandResult.rows) {
    if (!row.full_name || (!row.email && !row.phone)) continue;
    const name = splitName(row.full_name);
    mergeProspect({
      id: `demand:${row.id}`, fullName: row.full_name, ...name, email: row.email, phone: row.phone, dateOfBirth: "", source: "demand",
      leadIntentCount: 0, lostOpportunity: false,
      appointmentCount: 0, completedCount: 0, upcomingCount: 0, lifetimeValue: 0, currency: "USD", firstSeenAt: row.created_at, lastSeenAt: row.created_at,
      locations: uniqueLocations([{ address: "", city: row.city, county: row.county, state: row.state, postalCode: row.postal_code }]), services: [],
    });
  }

  const fromTime = options.from ? new Date(`${options.from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = options.to ? new Date(`${options.to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
  const relationship = text(options.relationship);
  return [...contacts.values()]
    .filter((contact) => !search || [contact.fullName, contact.email, contact.phone, ...contact.locations.flatMap((location) => [location.city, location.county, location.state])].some((value) => value.toLowerCase().includes(search.toLowerCase())))
    .filter((contact) => {
      const seenAt = new Date(contact.lastSeenAt).getTime();
      return seenAt >= fromTime && seenAt <= toTime;
    })
    .filter((contact) => {
      if (!relationship || relationship === "all") return true;
      if (relationship === "lost") return contact.lostOpportunity;
      if (relationship === "customer") return contact.appointmentCount > 0;
      if (relationship === "lead") return contact.leadIntentCount > 0;
      if (relationship === "demand") return contact.source === "demand";
      return true;
    })
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}
