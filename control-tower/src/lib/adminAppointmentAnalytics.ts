import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { calculateClientBmi, ensureClientPortalSchema } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { resolveMapboxAddressCoordinates } from "@/lib/mapboxAddressVerification";
import { resolveCountyBoundary } from "@/lib/partnerDirectoryGeo";

export type AppointmentGeoPoint = {
  key: string;
  city: string;
  county: string;
  state: string;
  latitude: number;
  longitude: number;
  total: number;
  completed: number;
  active: number;
  cancelled: number;
  intents: number;
  lost: number;
  activity: number;
  completionRate: number;
  completedValue: number;
  people: number;
  addressLine1: string;
  postalCode: string;
};

export type AppointmentMapLossReason = "no_coverage" | "no_availability" | "screening" | "booking_not_completed" | "coverage_or_availability" | "unclassified";

export type AppointmentMapHistoryItem = {
  id: string;
  kind: "appointment" | "intent";
  status: string;
  reference: string;
  service: string;
  servicePrice: number;
  currency: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  requestedDate: string;
  timezone: string;
  partnerName: string;
  requestedPartnerName: string;
  coverageAtCapture: boolean | null;
  currentCoverageAvailable: boolean;
  currentCoveredPartnerCount: number;
  currentActivatedPartnerCount: number;
  currentScheduleReadyPartnerCount: number;
  currentEligiblePartnerCount: number;
  lossReason: AppointmentMapLossReason | null;
  additionalPatientsCount: number;
  screeningEligible: boolean | null;
  sourceUrl: string;
  referrer: string;
  createdAt: string;
};

export type AppointmentMapPerson = {
  id: string;
  pointKeys: string[];
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  weightPounds: number | null;
  heightInches: number | null;
  bmi: number | null;
  appointmentCount: number;
  completedCount: number;
  intentCount: number;
  lostCount: number;
  locations: Array<{
    pointKey: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    county: string;
    state: string;
    postalCode: string;
  }>;
  history: AppointmentMapHistoryItem[];
};

// Kept as a compatibility alias for the lost-opportunity summary types.
export type AppointmentMapLead = AppointmentMapHistoryItem & {
  lossReason: AppointmentMapLossReason;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  marketKey: string;
};

export type BusinessCoverageArea = {
  key: string;
  state: string;
  county: string;
  latitude: number;
  longitude: number;
  partnerCount: number;
  serviceCount: number;
  services: string[];
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type LeadEventRow = { id: string; payload: Record<string, unknown>; created_at: string };
type AppointmentActivityRow = {
  id: string;
  customer_id: string;
  public_reference: string;
  status: string;
  starts_at: string;
  timezone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  county: string;
  state: string;
  postal_code: string;
  source_url: string;
  service_price: string;
  currency: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  weight_pounds: number | null;
  height_inches: number | null;
  service_name: string;
  partner_name: string;
  longitude: number | null;
  latitude: number | null;
};
type AnalyticsTrendPoint = { date: string; total: number; completed: number; intents: number; lost: number };
type CoverageRow = {
  state: string;
  county: string;
  city: string;
  postal_codes: string[] | null;
  service_id: string;
  service_name: string;
  partner_id: string;
  account_activated: boolean;
  availability_configured: boolean;
};

const STATE_CODES: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca", colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc", "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy", "district of columbia": "dc", "puerto rico": "pr",
};

function numeric(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalPositiveNumeric(value: unknown) {
  const parsed = typeof value === "string" ? Number.parseFloat(value.replaceAll(",", "")) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLocation(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stateCandidates(value: unknown) {
  const normalized = normalizeLocation(value);
  const code = STATE_CODES[normalized];
  const name = Object.entries(STATE_CODES).find(([, candidate]) => candidate === normalized)?.[0];
  return new Set([normalized, code, name].filter(Boolean));
}

function identityValues(email: string, phone: string) {
  return [email ? `email:${email.toLowerCase()}` : "", phone ? `phone:${phone.replace(/\D/g, "")}` : ""].filter(Boolean);
}

function canonicalState(value: unknown) {
  const normalized = normalizeLocation(value);
  return STATE_CODES[normalized] || normalized;
}

function canonicalStreetAddress(value: unknown) {
  const withoutUnit = text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // A hotel room, apartment, suite or floor is still the same physical map
    // point. The complete unit remains available in each patient's history.
    .replace(/(?:[,\s]+)(?:apt|apartment|suite|ste|unit|room|rm|floor|fl|#)\s*[a-z0-9-]+.*$/i, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    north: "n", south: "s", east: "e", west: "w",
    northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
    street: "st", road: "rd", avenue: "ave", boulevard: "blvd", circle: "cir",
    drive: "dr", lane: "ln", court: "ct", place: "pl", parkway: "pkwy",
    highway: "hwy", terrace: "ter", trail: "trl", square: "sq", route: "rte",
  };
  return withoutUnit.split(" ").map((part) => aliases[part] || part).join(" ");
}

function locationKey(value: { addressLine1?: string; city?: string; county?: string; state?: string; postalCode?: string }) {
  const postalCode = normalizeLocation(value.postalCode);
  const locality = postalCode || [value.city, value.county].map(normalizeLocation).filter(Boolean).join("|");
  return [canonicalState(value.state), locality, canonicalStreetAddress(value.addressLine1)].join("|");
}

function medianCoordinate(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function timeBucket(value: string, granularity: "week" | "month" | "year") {
  const date = new Date(value);
  if (granularity === "year") return `${date.getUTCFullYear()}-01-01`;
  if (granularity === "month") return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function leadDetails(row: LeadEventRow) {
  const lead = (row.payload?.lead || {}) as Record<string, unknown>;
  const patient = (lead.primaryPatient || {}) as Record<string, unknown>;
  const screening = (lead.medicalScreening || {}) as Record<string, unknown>;
  const coverage = (row.payload?.coverage || {}) as Record<string, unknown>;
  const service = (row.payload?.service || {}) as Record<string, unknown>;
  const appointmentRequest = (row.payload?.appointmentRequest || {}) as Record<string, unknown>;
  const requestedPartner = (appointmentRequest.requestedPartner || {}) as Record<string, unknown>;
  const source = (row.payload?.source || {}) as Record<string, unknown>;
  const internalAnalytics = (row.payload?._internalAnalytics || {}) as Record<string, unknown>;
  const additionalPatientsCount = numeric(lead.additionalPatientsCount ?? row.payload?.additionalPatientsCount);
  const eligible = screening.eligible;
  const coverageAvailableAtCapture = typeof internalAnalytics.coverageAvailable === "boolean" ? internalAnalytics.coverageAvailable : null;
  const hasEligiblePartnersSnapshot = Object.prototype.hasOwnProperty.call(appointmentRequest, "eligiblePartners");
  const eligiblePartners = Array.isArray(appointmentRequest.eligiblePartners) ? appointmentRequest.eligiblePartners : [];
  return {
    id: row.id,
    email: text(patient.email), phone: text(patient.phone), fullName: text(patient.fullName) || [text(patient.firstName), text(patient.lastName)].filter(Boolean).join(" "),
    dateOfBirth: text(patient.dateOfBirth),
    weightPounds: optionalPositiveNumeric(patient.weight ?? patient.weightPounds ?? patient.weight_lbs),
    heightInches: optionalPositiveNumeric(patient.height ?? patient.heightInches ?? patient.height_inches),
    city: text(coverage.city), county: text(coverage.county), state: text(coverage.state), postalCode: text(coverage.postalCode),
    addressLine1: text(coverage.addressLine1), addressLine2: text(coverage.addressLine2),
    longitude: Number.isFinite(Number(internalAnalytics.longitude ?? coverage.longitude)) ? Number(internalAnalytics.longitude ?? coverage.longitude) : null,
    latitude: Number.isFinite(Number(internalAnalytics.latitude ?? coverage.latitude)) ? Number(internalAnalytics.latitude ?? coverage.latitude) : null,
    serviceId: text(service.id), service: text(service.name), servicePrice: numeric(service.price), currency: text(service.currency) || "USD",
    requestedDate: text(appointmentRequest.requestedDate), timezone: text(appointmentRequest.timezone),
    requestedPartnerName: text(requestedPartner.fullName) || text(requestedPartner.displayName),
    coverageAtCapture: coverageAvailableAtCapture ?? (hasEligiblePartnersSnapshot ? eligiblePartners.length > 0 : null),
    availabilityChecked: internalAnalytics.availabilityChecked === true,
    coverageAvailableAtCapture,
    availableSlotCount: numeric(internalAnalytics.availableSlotCount),
    additionalPatientsCount,
    screeningEligible: typeof eligible === "boolean" ? eligible : null,
    sourceUrl: text(source.sourceUrl) || text(source.pageUrl), referrer: text(source.referrer),
    createdAt: text(row.payload?.capturedAt) || row.created_at,
  };
}

function lossReasonForLead(lead: ReturnType<typeof leadDetails>): AppointmentMapLead["lossReason"] {
  if (lead.screeningEligible === false) return "screening";
  if (lead.availabilityChecked) {
    if (lead.coverageAvailableAtCapture === false) return "no_coverage";
    if (lead.coverageAvailableAtCapture === true && lead.availableSlotCount === 0) return "no_availability";
    if (lead.availableSlotCount > 0) return "booking_not_completed";
  }
  if (lead.coverageAtCapture === true) return "booking_not_completed";
  if (lead.coverageAtCapture === false) return "coverage_or_availability";
  return "unclassified";
}

function coverageStatusForLead(lead: ReturnType<typeof leadDetails>, rows: CoverageRow[]) {
  const leadStates = stateCandidates(lead.state);
  const leadCounty = normalizeLocation(lead.county);
  const leadCity = normalizeLocation(lead.city);
  const leadPostalCode = text(lead.postalCode).toUpperCase();
  const leadService = normalizeLocation(lead.service);
  const matchingRows = rows.filter((row) => {
    const serviceMatches = lead.serviceId ? row.service_id === lead.serviceId : normalizeLocation(row.service_name) === leadService;
    const city = normalizeLocation(row.city);
    const postalCodes = (row.postal_codes || []).map((value) => text(value).toUpperCase()).filter(Boolean);
    return serviceMatches
      && leadStates.has(normalizeLocation(row.state))
      && normalizeLocation(row.county) === leadCounty
      && (!city || city === leadCity)
      && (!postalCodes.length || postalCodes.includes(leadPostalCode));
  });
  const coveredPartners = new Set(matchingRows.map((row) => row.partner_id));
  const activatedPartners = new Set(matchingRows.filter((row) => row.account_activated).map((row) => row.partner_id));
  const scheduleReadyPartners = new Set(matchingRows.filter((row) => row.account_activated && row.availability_configured).map((row) => row.partner_id));
  return {
    covered: coveredPartners.size,
    activated: activatedPartners.size,
    scheduleReady: scheduleReadyPartners.size,
  };
}

const VALID_STATUSES = new Set(["payment_pending", "confirmed", "partner_acknowledged", "in_progress", "completed", "partner_declined", "cancelled", "refunded", "failed", "lost_opportunity"]);

export async function loadAdminAppointmentAnalytics(options: { period?: string; status?: string; from?: string; to?: string; search?: string; granularity?: string } = {}) {
  await Promise.all([ensureBookingEngineSchema(), ensureClientPortalSchema()]);
  const period = ["30", "90", "365", "all"].includes(String(options.period)) ? String(options.period) : "90";
  const status = VALID_STATUSES.has(String(options.status)) ? String(options.status) : "";
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(options.from)) ? String(options.from) : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(options.to)) ? String(options.to) : "";
  const search = text(options.search).toLowerCase();
  const granularity = (["week", "month", "year"].includes(String(options.granularity)) ? String(options.granularity) : "week") as "week" | "month" | "year";
  const values: unknown[] = [];
  const conditions: string[] = [];
  if (from) { values.push(from); conditions.push(`appointment.created_at >= $${values.length}::date`); }
  if (to) { values.push(to); conditions.push(`appointment.created_at < ($${values.length}::date + interval '1 day')`); }
  if (!from && !to && period !== "all") { values.push(Number(period)); conditions.push(`appointment.created_at >= now() - ($${values.length}::text || ' days')::interval`); }
  if (status === "lost_opportunity") conditions.push("false");
  else if (status) { values.push(status); conditions.push(`appointment.status = $${values.length}`); }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(appointment.city ilike $${values.length} or appointment.county ilike $${values.length} or appointment.state ilike $${values.length} or appointment.postal_code ilike $${values.length} or appointment.address_line_1 ilike $${values.length} or exists (select 1 from app.services search_service where search_service.id = appointment.service_id and search_service.name ilike $${values.length}) or exists (select 1 from app.booking_customers search_customer where search_customer.id = appointment.customer_id and (search_customer.full_name ilike $${values.length} or search_customer.email ilike $${values.length} or search_customer.phone ilike $${values.length})))`);
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const pool = getDbPool();
  const [summaryResult, marketResult, trendResult, appointmentActivityResult, leadResult, convertedResult, coverageResult] = await Promise.all([
    pool.query<{ total: string; contacts: string; completed: string; active: string; cancelled: string; completed_value: string; partner_earnings: string; platform_revenue: string }>(
      `select count(*)::text as total, count(distinct appointment.customer_id)::text as contacts,
              count(*) filter (where appointment.status = 'completed')::text as completed,
              count(*) filter (where appointment.status in ('payment_pending','confirmed','partner_acknowledged','in_progress'))::text as active,
              count(*) filter (where appointment.status in ('partner_declined','cancelled','refunded','failed'))::text as cancelled,
              coalesce(sum(appointment.service_price) filter (where appointment.status = 'completed'),0)::text as completed_value,
              coalesce(sum(greatest(appointment.service_price - coalesce(appointment.deposit_amount, 0), 0)) filter (where appointment.status = 'completed'),0)::text as partner_earnings,
              coalesce(sum(coalesce((
                select max(payment.amount)
                  from app.appointment_payments payment
                 where payment.appointment_id = appointment.id and payment.status = 'paid'
              ), 0)) filter (where appointment.status = 'completed'),0)::text as platform_revenue
         from app.appointments appointment ${where}`, values),
    pool.query<{ city: string; county: string; state: string; total: string; completed: string; active: string; cancelled: string; completed_value: string }>(
      `select appointment.city, appointment.county, appointment.state, count(*)::text as total,
              count(*) filter (where appointment.status = 'completed')::text as completed,
              count(*) filter (where appointment.status in ('payment_pending','confirmed','partner_acknowledged','in_progress'))::text as active,
              count(*) filter (where appointment.status in ('partner_declined','cancelled','refunded','failed'))::text as cancelled,
              coalesce(sum(appointment.service_price) filter (where appointment.status = 'completed'),0)::text as completed_value
         from app.appointments appointment ${where}
        group by appointment.state, appointment.county, appointment.city order by count(*) desc limit 100`, values),
    pool.query<{ bucket: string; total: string; completed: string }>(
      `select date_trunc('${granularity}', appointment.created_at)::date::text as bucket, count(*)::text as total,
              count(*) filter (where appointment.status = 'completed')::text as completed
         from app.appointments appointment ${where} group by 1 order by 1`, values),
    pool.query<AppointmentActivityRow>(
      `select appointment.id::text,
              appointment.customer_id::text,
              appointment.public_reference,
              appointment.status,
              appointment.starts_at::text,
              appointment.timezone,
              appointment.address_line_1,
              appointment.address_line_2,
              appointment.city,
              appointment.county,
              appointment.state,
              appointment.postal_code,
              appointment.source_url,
              appointment.service_price::text,
              appointment.currency,
              appointment.metadata,
              appointment.created_at::text,
              coalesce(nullif(client_account.full_name, ''), customer.full_name) as full_name,
              customer.email,
              coalesce(nullif(client_account.phone, ''), customer.phone) as phone,
              coalesce(
                nullif(client_account.preferences ->> 'dateOfBirth', ''),
                nullif(customer.metadata ->> 'dateOfBirth', ''),
                nullif(appointment.metadata -> 'primary_patient' ->> 'dateOfBirth', ''),
                ''
              ) as date_of_birth,
              case
                when client_account.preferences #>> '{wellness,weightPounds}' ~ '^[0-9]+(\\.[0-9]+)?$'
                  then (client_account.preferences #>> '{wellness,weightPounds}')::float8
                else null
              end as weight_pounds,
              case
                when client_account.preferences #>> '{wellness,heightInches}' ~ '^[0-9]+(\\.[0-9]+)?$'
                  then (client_account.preferences #>> '{wellness,heightInches}')::float8
                else null
              end as height_inches,
              service.name as service_name,
              coalesce(partner.display_name, '') as partner_name,
              coalesce(saved_address.longitude, (appointment.metadata #>> '{service_address_location,longitude}')::float8) as longitude,
              coalesce(saved_address.latitude, (appointment.metadata #>> '{service_address_location,latitude}')::float8) as latitude
         from app.appointments appointment
         join app.booking_customers customer on customer.id = appointment.customer_id
         join app.services service on service.id = appointment.service_id
         left join app.partner_profiles partner on partner.id = appointment.partner_profile_id
         left join app.client_customer_links customer_link on customer_link.booking_customer_id = customer.id
         left join app.client_accounts client_account on client_account.id = customer_link.client_account_id
         left join lateral (
           select address.longitude::float8 as longitude, address.latitude::float8 as latitude
             from app.client_addresses address
            where address.client_account_id = customer_link.client_account_id
              and lower(trim(address.address_line_1)) = lower(trim(appointment.address_line_1))
              and (coalesce(appointment.postal_code, '') = '' or address.postal_code = appointment.postal_code)
            order by address.is_default desc,
                     address.created_at desc
            limit 1
         ) saved_address on true
        order by appointment.created_at desc
        limit 5000`),
    pool.query<LeadEventRow>(`select id::text, payload, created_at::text from app.booking_lead_events order by created_at desc limit 5000`),
    pool.query<{ email: string; phone: string }>(`select customer.email, customer.phone from app.booking_customers customer where exists (select 1 from app.appointments appointment where appointment.customer_id = customer.id)`),
    pool.query<CoverageRow>(
      `select area.state, area.county, coalesce(area.city, '') as city, area.postal_codes,
              assignment.service_id::text, service.name as service_name,
              assignment.partner_profile_id::text as partner_id,
              (nullif(partner.portal_password_hash, '') is not null) as account_activated,
              exists (
                select 1
                  from app.partner_availability_rules availability
                 where availability.partner_profile_id = partner.id
                   and availability.is_active = true
                   and (availability.service_id is null or availability.service_id = assignment.service_id)
              ) as availability_configured
         from app.partner_coverage_areas area
         join app.partner_service_assignments assignment
           on assignment.id = area.assignment_id and assignment.status = 'active'
         join app.partner_profiles partner
           on partner.id = assignment.partner_profile_id and partner.website_status in ('ready','published')
         join app.services service
           on service.id = assignment.service_id and service.is_active = true
        where area.status = 'active'`,
    ),
  ]);

  const convertedIdentities = new Set(convertedResult.rows.flatMap((row) => identityValues(text(row.email), text(row.phone))));
  const fromTime = from ? new Date(`${from}T00:00:00Z`).getTime() : (!to && period !== "all" ? Date.now() - Number(period) * 86400000 : Number.NEGATIVE_INFINITY);
  const toTime = to ? new Date(`${to}T23:59:59.999Z`).getTime() : Number.POSITIVE_INFINITY;
  const filteredLeads = leadResult.rows.map(leadDetails).filter((lead) => {
    const time = new Date(lead.createdAt).getTime();
    const matchesSearch = !search || [lead.fullName, lead.email, lead.phone, lead.city, lead.county, lead.state, lead.postalCode, lead.service].some((value) => value.toLowerCase().includes(search));
    return time >= fromTime && time <= toTime && matchesSearch;
  });
  const filteredAppointmentRows = appointmentActivityResult.rows.filter((row) => {
    const time = new Date(row.created_at).getTime();
    const matchesStatus = status === "lost_opportunity" ? false : !status || row.status === status;
    const matchesSearch = !search || [row.full_name, row.email, row.phone, row.address_line_1, row.city, row.county, row.state, row.postal_code, row.service_name, row.partner_name]
      .some((value) => text(value).toLowerCase().includes(search));
    return time >= fromTime && time <= toTime && matchesStatus && matchesSearch;
  });
  const lostLeads = filteredLeads.filter((lead) => !identityValues(lead.email, lead.phone).some((key) => convertedIdentities.has(key)));
  const includedLostLeads = status && status !== "lost_opportunity" ? [] : lostLeads;

  const identityAliases = new Map<string, string>();
  const peopleMap = new Map<string, {
    id: string;
    pointKeys: Set<string>;
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    weightPounds: number | null;
    heightInches: number | null;
    locations: Map<string, AppointmentMapPerson["locations"][number]>;
    history: AppointmentMapHistoryItem[];
    historyKeys: Set<string>;
  }>();
  const locationMap = new Map<string, {
    key: string;
    city: string;
    county: string;
    state: string;
    postalCode: string;
    addressLine1: string;
    total: number;
    completed: number;
    active: number;
    cancelled: number;
    intents: number;
    lost: number;
    completedValue: number;
    personIds: Set<string>;
    coordinates: Array<{ longitude: number; latitude: number }>;
  }>();

  const personFor = (input: { fallback: string; fullName: string; email: string; phone: string; dateOfBirth: string; weightPounds?: number | null; heightInches?: number | null }) => {
    const aliases = identityValues(input.email, input.phone);
    const id = aliases.map((alias) => identityAliases.get(alias)).find(Boolean) || `person:${input.fallback}`;
    aliases.forEach((alias) => identityAliases.set(alias, id));
    const person = peopleMap.get(id) || {
      id,
      pointKeys: new Set<string>(),
      fullName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      weightPounds: null,
      heightInches: null,
      locations: new Map<string, AppointmentMapPerson["locations"][number]>(),
      history: [],
      historyKeys: new Set<string>(),
    };
    person.fullName ||= input.fullName;
    person.email ||= input.email;
    person.phone ||= input.phone;
    person.dateOfBirth ||= input.dateOfBirth;
    person.weightPounds ||= input.weightPounds || null;
    person.heightInches ||= input.heightInches || null;
    peopleMap.set(id, person);
    return person;
  };

  const rememberLocation = (person: ReturnType<typeof personFor>, address: AppointmentMapPerson["locations"][number]) => {
    if (!address.pointKey.replaceAll("|", "")) return null;
    person.locations.set(address.pointKey, address);
    return address;
  };

  const attachLocation = (person: ReturnType<typeof personFor>, address: AppointmentMapPerson["locations"][number], coordinates?: { longitude: number | null; latitude: number | null }) => {
    if (!rememberLocation(person, address)) return null;
    person.pointKeys.add(address.pointKey);
    const location = locationMap.get(address.pointKey) || {
      key: address.pointKey,
      city: address.city,
      county: address.county,
      state: address.state,
      postalCode: address.postalCode,
      addressLine1: address.addressLine1,
      total: 0,
      completed: 0,
      active: 0,
      cancelled: 0,
      intents: 0,
      lost: 0,
      completedValue: 0,
      personIds: new Set<string>(),
      coordinates: [],
    };
    location.personIds.add(person.id);
    if (typeof coordinates?.longitude === "number" && typeof coordinates?.latitude === "number") {
      location.coordinates.push({ longitude: coordinates.longitude, latitude: coordinates.latitude });
    }
    locationMap.set(address.pointKey, location);
    return location;
  };

  const pushHistory = (person: ReturnType<typeof personFor>, item: AppointmentMapHistoryItem) => {
    const key = `${item.kind}:${item.id}`;
    if (person.historyKeys.has(key)) return;
    person.historyKeys.add(key);
    person.history.push(item);
  };

  const appointmentAddress = (row: AppointmentActivityRow): AppointmentMapPerson["locations"][number] => ({
    pointKey: locationKey({ addressLine1: row.address_line_1, city: row.city, county: row.county, state: row.state, postalCode: row.postal_code }),
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    county: row.county,
    state: row.state,
    postalCode: row.postal_code,
  });

  const appointmentHistory = (row: AppointmentActivityRow): AppointmentMapHistoryItem => {
    const additionalPatients = Array.isArray(row.metadata?.additional_patients) ? row.metadata.additional_patients : [];
    return {
      id: row.id,
      kind: "appointment",
      status: row.status,
      reference: row.public_reference,
      service: row.service_name,
      servicePrice: numeric(row.service_price),
      currency: row.currency || "USD",
      addressLine1: row.address_line_1,
      addressLine2: row.address_line_2,
      city: row.city,
      county: row.county,
      state: row.state,
      postalCode: row.postal_code,
      requestedDate: row.starts_at,
      timezone: row.timezone,
      partnerName: row.partner_name,
      requestedPartnerName: "",
      coverageAtCapture: true,
      currentCoverageAvailable: true,
      currentCoveredPartnerCount: row.partner_name ? 1 : 0,
      currentActivatedPartnerCount: row.partner_name ? 1 : 0,
      currentScheduleReadyPartnerCount: row.partner_name ? 1 : 0,
      currentEligiblePartnerCount: row.partner_name ? 1 : 0,
      lossReason: null,
      additionalPatientsCount: additionalPatients.length,
      screeningEligible: true,
      sourceUrl: row.source_url,
      referrer: "",
      createdAt: row.created_at,
    };
  };

  const leadAddress = (lead: ReturnType<typeof leadDetails>): AppointmentMapPerson["locations"][number] => ({
    pointKey: locationKey(lead),
    addressLine1: lead.addressLine1,
    addressLine2: lead.addressLine2,
    city: lead.city,
    county: lead.county,
    state: lead.state,
    postalCode: lead.postalCode,
  });

  const leadHistory = (lead: ReturnType<typeof leadDetails>, isLost: boolean): AppointmentMapHistoryItem => {
    const currentCoverage = coverageStatusForLead(lead, coverageResult.rows);
    return {
      id: lead.id,
      kind: "intent",
      status: isLost ? "lost_opportunity" : "converted",
      reference: "",
      service: lead.service,
      servicePrice: lead.servicePrice,
      currency: lead.currency,
      addressLine1: lead.addressLine1,
      addressLine2: lead.addressLine2,
      city: lead.city,
      county: lead.county,
      state: lead.state,
      postalCode: lead.postalCode,
      requestedDate: lead.requestedDate,
      timezone: lead.timezone,
      partnerName: "",
      requestedPartnerName: lead.requestedPartnerName,
      coverageAtCapture: lead.coverageAtCapture,
      currentCoverageAvailable: currentCoverage.covered > 0,
      currentCoveredPartnerCount: currentCoverage.covered,
      currentActivatedPartnerCount: currentCoverage.activated,
      currentScheduleReadyPartnerCount: currentCoverage.scheduleReady,
      currentEligiblePartnerCount: currentCoverage.scheduleReady,
      lossReason: isLost ? lossReasonForLead(lead) : null,
      additionalPatientsCount: lead.additionalPatientsCount,
      screeningEligible: lead.screeningEligible,
      sourceUrl: lead.sourceUrl,
      referrer: lead.referrer,
      createdAt: lead.createdAt,
    };
  };

  for (const row of filteredAppointmentRows) {
    const address = appointmentAddress(row);
    const person = personFor({
      fallback: row.customer_id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      dateOfBirth: row.date_of_birth,
      weightPounds: row.weight_pounds,
      heightInches: row.height_inches,
    });
    const location = attachLocation(person, address, { longitude: row.longitude, latitude: row.latitude });
    if (location) {
      location.total += 1;
      if (row.status === "completed") location.completed += 1;
      if (["payment_pending", "confirmed", "partner_acknowledged", "in_progress"].includes(row.status)) location.active += 1;
      if (["partner_declined", "cancelled", "refunded", "failed"].includes(row.status)) location.cancelled += 1;
      if (row.status === "completed") location.completedValue += numeric(row.service_price);
    }
    pushHistory(person, appointmentHistory(row));
  }

  const lostLeadIds = new Set(lostLeads.map((lead) => lead.id));
  for (const lead of status && status !== "lost_opportunity" ? [] : filteredLeads) {
    const isLost = lostLeadIds.has(lead.id);
    const address = leadAddress(lead);
    const person = personFor({ fallback: `lead:${lead.id}`, fullName: lead.fullName, email: lead.email, phone: lead.phone, dateOfBirth: lead.dateOfBirth, weightPounds: lead.weightPounds, heightInches: lead.heightInches });
    const location = attachLocation(person, address, { longitude: lead.longitude, latitude: lead.latitude });
    if (location) {
      location.intents += 1;
      if (isLost) location.lost += 1;
    }
    pushHistory(person, leadHistory(lead, isLost));
  }

  const existingPersonFor = (fallback: string, email: string, phone: string) => {
    const id = identityValues(email, phone).map((alias) => identityAliases.get(alias)).find(Boolean) || `person:${fallback}`;
    return peopleMap.get(id);
  };

  // Keep map points constrained by the active filters, but enrich every visible
  // patient card with their complete booking history and all known addresses.
  for (const row of appointmentActivityResult.rows) {
    const person = existingPersonFor(row.customer_id, row.email, row.phone);
    if (!person) continue;
    person.dateOfBirth ||= row.date_of_birth;
    person.weightPounds ||= row.weight_pounds;
    person.heightInches ||= row.height_inches;
    rememberLocation(person, appointmentAddress(row));
    pushHistory(person, appointmentHistory(row));
  }
  for (const lead of leadResult.rows.map(leadDetails)) {
    const person = existingPersonFor(`lead:${lead.id}`, lead.email, lead.phone);
    if (!person) continue;
    person.dateOfBirth ||= lead.dateOfBirth;
    person.weightPounds ||= lead.weightPounds;
    person.heightInches ||= lead.heightInches;
    rememberLocation(person, leadAddress(lead));
    const isLost = !identityValues(lead.email, lead.phone).some((key) => convertedIdentities.has(key));
    pushHistory(person, leadHistory(lead, isLost));
  }

  const marketMap = new Map<string, { key: string; city: string; county: string; state: string; total: number; completed: number; active: number; cancelled: number; lost: number; completedValue: number }>();
  for (const row of marketResult.rows) {
    const key = `${row.state}|${row.county}|${row.city}`;
    marketMap.set(key, { key, city: row.city, county: row.county, state: row.state, total: numeric(row.total), completed: numeric(row.completed), active: numeric(row.active), cancelled: numeric(row.cancelled), lost: 0, completedValue: numeric(row.completed_value) });
  }
  for (const lead of includedLostLeads) {
    const key = `${lead.state}|${lead.county}|${lead.city}`;
    if (!key.replaceAll("|", "")) continue;
    const market = marketMap.get(key) || { key, city: lead.city, county: lead.county, state: lead.state, total: 0, completed: 0, active: 0, cancelled: 0, lost: 0, completedValue: 0 };
    market.lost += 1; marketMap.set(key, market);
  }
  const markets = [...marketMap.values()].map((market) => ({ ...market, activity: market.total + market.lost, completionRate: market.total ? Math.round((market.completed / market.total) * 1000) / 10 : 0 }));
  const resolved = await Promise.all([...locationMap.values()].map(async (location) => {
    let latitude = medianCoordinate(location.coordinates.map((coordinate) => coordinate.latitude));
    let longitude = medianCoordinate(location.coordinates.map((coordinate) => coordinate.longitude));
    if (latitude === null || longitude === null) {
      const exactAddress = await resolveMapboxAddressCoordinates({
        addressLine1: location.addressLine1,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
      });
      if (!exactAddress) return null;
      latitude = exactAddress.latitude;
      longitude = exactAddress.longitude;
    }
    const activity = location.total + location.intents;
    return {
      key: location.key,
      city: location.city,
      county: location.county,
      state: location.state,
      postalCode: location.postalCode,
      addressLine1: location.addressLine1,
      latitude,
      longitude,
      total: location.total,
      completed: location.completed,
      active: location.active,
      cancelled: location.cancelled,
      intents: location.intents,
      lost: location.lost,
      activity,
      completionRate: location.total ? Math.round((location.completed / location.total) * 1000) / 10 : 0,
      completedValue: location.completedValue,
      people: location.personIds.size,
    } satisfies AppointmentGeoPoint;
  }));

  const people: AppointmentMapPerson[] = [...peopleMap.values()].map((person) => {
    const history = person.history.sort((a, b) => new Date(b.createdAt || b.requestedDate).getTime() - new Date(a.createdAt || a.requestedDate).getTime());
    return {
      id: person.id,
      pointKeys: [...person.pointKeys],
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      dateOfBirth: person.dateOfBirth,
      weightPounds: person.weightPounds,
      heightInches: person.heightInches,
      bmi: calculateClientBmi({ weightPounds: person.weightPounds, heightInches: person.heightInches }),
      appointmentCount: history.filter((item) => item.kind === "appointment").length,
      completedCount: history.filter((item) => item.kind === "appointment" && item.status === "completed").length,
      intentCount: history.filter((item) => item.kind === "intent").length,
      lostCount: history.filter((item) => item.kind === "intent" && item.status === "lost_opportunity").length,
      locations: [...person.locations.values()],
      history,
    };
  });
  const trendMap = new Map<string, AnalyticsTrendPoint>(trendResult.rows.map((row) => [row.bucket, { date: row.bucket, total: numeric(row.total), completed: numeric(row.completed), intents: 0, lost: 0 }]));
  for (const lead of status && status !== "lost_opportunity" ? [] : filteredLeads) {
    const bucket = timeBucket(lead.createdAt, granularity); const point = trendMap.get(bucket) || { date: bucket, total: 0, completed: 0, intents: 0, lost: 0 };
    point.intents += 1;
    if (!identityValues(lead.email, lead.phone).some((key) => convertedIdentities.has(key))) point.lost += 1;
    trendMap.set(bucket, point);
  }
  const summaryRow = summaryResult.rows[0];
  const total = numeric(summaryRow?.total);
  const currentCoverageByCounty = new Map<string, { key: string; state: string; county: string; partners: Set<string>; services: Set<string> }>();
  for (const row of coverageResult.rows) {
    const key = `${normalizeLocation(row.state)}|${normalizeLocation(row.county)}`;
    const area = currentCoverageByCounty.get(key) || { key, state: row.state, county: row.county, partners: new Set<string>(), services: new Set<string>() };
    area.partners.add(row.partner_id);
    area.services.add(row.service_name);
    currentCoverageByCounty.set(key, area);
  }
  const coverageAreas = (await Promise.all([...currentCoverageByCounty.values()].map(async (area) => {
    const boundary = await resolveCountyBoundary({ state: area.state, county: area.county, locationId: area.key });
    if (!boundary) return null;
    return {
      key: area.key,
      state: area.state,
      county: area.county,
      latitude: boundary.latitude,
      longitude: boundary.longitude,
      partnerCount: area.partners.size,
      serviceCount: area.services.size,
      services: [...area.services].sort(),
      geometry: boundary.geometry,
    } satisfies BusinessCoverageArea;
  }))).filter((area): area is BusinessCoverageArea => Boolean(area));
  const mapLeads: AppointmentMapLead[] = includedLostLeads.map((lead) => {
    const currentCoverage = coverageStatusForLead(lead, coverageResult.rows);
    return {
      id: lead.id,
      kind: "intent",
      status: "lost_opportunity",
      reference: "",
      marketKey: `${lead.state}|${lead.county}|${lead.city}`,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      dateOfBirth: lead.dateOfBirth,
      service: lead.service,
      servicePrice: lead.servicePrice,
      currency: lead.currency,
      addressLine1: lead.addressLine1,
      addressLine2: lead.addressLine2,
      city: lead.city,
      county: lead.county,
      state: lead.state,
      postalCode: lead.postalCode,
      requestedDate: lead.requestedDate,
      timezone: lead.timezone,
      partnerName: "",
      requestedPartnerName: lead.requestedPartnerName,
      coverageAtCapture: lead.coverageAtCapture,
      currentCoverageAvailable: currentCoverage.covered > 0,
      currentCoveredPartnerCount: currentCoverage.covered,
      currentActivatedPartnerCount: currentCoverage.activated,
      currentScheduleReadyPartnerCount: currentCoverage.scheduleReady,
      currentEligiblePartnerCount: currentCoverage.scheduleReady,
      lossReason: lossReasonForLead(lead),
      additionalPatientsCount: lead.additionalPatientsCount,
      screeningEligible: lead.screeningEligible,
      sourceUrl: lead.sourceUrl,
      referrer: lead.referrer,
      createdAt: lead.createdAt,
    };
  });
  const lostWithCurrentCoverage = mapLeads.filter((lead) => lead.currentCoverageAvailable).length;
  const lostWithoutCurrentCoverage = mapLeads.length - lostWithCurrentCoverage;
  const lostReasons = mapLeads.reduce<Record<AppointmentMapLead["lossReason"], number>>((totals, lead) => {
    totals[lead.lossReason] += 1;
    return totals;
  }, { no_coverage: 0, no_availability: 0, screening: 0, booking_not_completed: 0, coverage_or_availability: 0, unclassified: 0 });
  return {
    period, status, from, to, search, granularity,
    summary: { total, contacts: numeric(summaryRow?.contacts), completed: numeric(summaryRow?.completed), active: numeric(summaryRow?.active), cancelled: numeric(summaryRow?.cancelled), appointmentIntents: status && status !== "lost_opportunity" ? 0 : filteredLeads.length, lostOpportunities: includedLostLeads.length, lostWithCurrentCoverage, lostWithoutCurrentCoverage, lostReasons, conversionRate: filteredLeads.length ? Math.round(((filteredLeads.length - lostLeads.length) / filteredLeads.length) * 1000) / 10 : 0, completionRate: total ? Math.round((numeric(summaryRow?.completed) / total) * 1000) / 10 : 0, completedValue: numeric(summaryRow?.completed_value), partnerEarnings: numeric(summaryRow?.partner_earnings), platformRevenue: numeric(summaryRow?.platform_revenue), markets: markets.length, coveredCounties: coverageAreas.length },
    points: resolved.filter((point): point is AppointmentGeoPoint => Boolean(point)),
    people,
    leads: mapLeads,
    coverageAreas,
    markets: markets.sort((a, b) => b.activity - a.activity), trend: [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
