import { randomBytes } from "node:crypto";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { loadBookingAvailability, type BookingCoverageInput } from "@/lib/serviceBookingAvailability";
import { createStripeCheckoutSession, getStripePublishableKey } from "@/lib/stripeCheckout";
import { BOOKING_MINIMUM_NOTICE_MINUTES } from "@/lib/bookingPolicy";
import { sendConfirmedAppointmentAutomations } from "@/lib/stripePaymentLifecycle";
import { availableClientBookingReward, redeemClientBookingReward, type ClientBookingReward } from "@/lib/clientRewards";
import { ensureClientPortalSchema } from "@/lib/clientPortalAuth";

type BookingCustomerInput = {
  firstName?: string;
  lastName?: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  weight?: string;
  height?: string;
  genderIdentity?: string;
};

type BookingAttendeeInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  weight?: string;
  height?: string;
  genderIdentity?: string;
};

type BookingAddressInput = BookingCoverageInput & {
  addressLine1: string;
  addressLine2?: string;
  countryCode?: string;
  longitude?: number;
  latitude?: number;
};

type MedicalScreeningInput = {
  selected: string[];
  noneSelected: boolean;
  completedAt?: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `1${digits}` : digits;
}

function publicReference() {
  return `MDN-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function depositCents(price: number, type: "percentage" | "fixed", value: number) {
  const priceCents = Math.max(0, Math.round(price * 100));
  if (type === "fixed") return Math.min(priceCents, Math.max(0, Math.round(value * 100)));
  return Math.min(priceCents, Math.max(0, Math.round(priceCents * value / 100)));
}

export async function saveBookingDemand(opts: {
  publicKey: string;
  customer: BookingCustomerInput;
  address: BookingAddressInput;
  sourceUrl?: string;
}) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{ id: string }>(
    `insert into app.booking_demand_requests (
       organization_id, service_id, full_name, email, phone,
       city, county, state, postal_code, source_url
     )
     select s.organization_id, s.id, $2, $3, $4, $5, $6, $7, $8, $9
       from app.service_calendars c
       join app.services s on s.id = c.service_id
      where c.public_key = $1
     returning id`,
    [
      opts.publicKey, opts.customer.fullName, opts.customer.email.toLowerCase(), opts.customer.phone,
      opts.address.city, opts.address.county, opts.address.state, opts.address.postalCode || "", opts.sourceUrl || "",
    ],
  );
  return result.rows[0]?.id || "";
}

export async function createAppointmentCheckout(opts: {
  publicKey: string;
  date: string;
  startsAt: string;
  timezone: string;
  requestedPartnerId?: string;
  customer: BookingCustomerInput;
  address: BookingAddressInput;
  medicalScreening: MedicalScreeningInput;
  attendees?: BookingAttendeeInput[];
  sourceUrl?: string;
  checkoutReturnBaseUrl?: string;
  checkoutCancelUrl?: string;
  checkoutReturnUrl?: string;
  embeddedCheckout?: boolean;
  clientAccountId?: string;
  directoryAttribution?: { source: "partner_directory"; partnerProfileId: string; attributedAt: string };
}) {
  const screeningIsClear = opts.medicalScreening.noneSelected
    && opts.medicalScreening.selected.length === 1
    && opts.medicalScreening.selected[0] === "none";
  if (!screeningIsClear) {
    throw new Error("Online booking is not available until the medical screening is clear.");
  }
  await ensureBookingEngineSchema();
  if (opts.clientAccountId) await ensureClientPortalSchema();
  const availability = await loadBookingAvailability({
    publicKey: opts.publicKey,
    date: opts.date,
    coverage: opts.address,
    requestedPartnerId: opts.requestedPartnerId,
  });
  if (!availability) throw new Error("Calendar not found or not active.");
  if (!availability.coverageAvailable) {
    const demandRequestId = await saveBookingDemand(opts);
    return { status: "no_coverage" as const, demandRequestId };
  }
  const requestedStartDate = new Date(opts.startsAt);
  if (Number.isNaN(requestedStartDate.getTime())) throw new Error("Choose a valid appointment time.");
  if (requestedStartDate.getTime() < Date.now() + BOOKING_MINIMUM_NOTICE_MINUTES * 60_000) {
    throw new Error("Appointments must be booked at least 2 hours in advance.");
  }
  const requestedStart = requestedStartDate.toISOString();
  const slot = availability.slots.find((item) => item.startsAt === requestedStart);
  if (!slot?.partners.length) throw new Error("That appointment time is no longer available.");

  const pool = getDbPool();
  const client = await pool.connect();
  let appointmentId = "";
  let appointmentReference = "";
  let customerEmail = opts.customer.email.toLowerCase();
  let serviceName = availability.calendar.serviceName;
  let amountCents = 0;
  let standardDepositCents = 0;
  let partnerEarningsCents = 0;
  let freeVisitRewardApplied = false;
  let bookingReward: ClientBookingReward | null = null;
  let referralRewardApplied = false;
  try {
    await client.query("begin");
    const email = opts.customer.email.toLowerCase();
    const phone = normalizedPhone(opts.customer.phone);
    const existingCustomer = await client.query<{ id: string }>(
      `select id
         from app.booking_customers
        where organization_id = (
          select s.organization_id
            from app.service_calendars c
            join app.services s on s.id = c.service_id
           where c.public_key = $1
           limit 1
        )
          and ((normalized_email <> '' and normalized_email = $2)
            or (normalized_phone <> '' and normalized_phone = $3))
        order by case when normalized_email = $2 then 0 else 1 end
        limit 1
        for update`,
      [opts.publicKey, email, phone],
    );
    let customerId = existingCustomer.rows[0]?.id;
    if (customerId) {
      await client.query(
        `update app.booking_customers
            set full_name = $2, email = $3, phone = $4,
                normalized_email = $3, normalized_phone = $5, updated_at = now()
          where id = $1`,
        [customerId, opts.customer.fullName, email, opts.customer.phone, phone],
      );
    } else {
      const createdCustomer = await client.query<{ id: string }>(
        `insert into app.booking_customers (
           organization_id, full_name, email, phone, normalized_email, normalized_phone
         )
         select organization_id, $2, $3, $4, $3, $5
           from app.services s
           join app.service_calendars c on c.service_id = s.id
          where c.public_key = $1
         returning id`,
        [opts.publicKey, opts.customer.fullName, email, opts.customer.phone, phone],
      );
      customerId = createdCustomer.rows[0]?.id;
    }
    if (!customerId) throw new Error("The booking customer could not be created.");
    await client.query(
      `update app.booking_customers
          set metadata = metadata || $2::jsonb, updated_at = now()
        where id = $1`,
      [customerId, JSON.stringify({
        dateOfBirth: opts.customer.dateOfBirth || "",
        weight: opts.customer.weight || "",
        height: opts.customer.height || "",
        genderIdentity: opts.customer.genderIdentity || "",
      })],
    );
    const partnerIds = slot.partners.map((partner) => partner.id);
    if (!partnerIds.length) throw new Error("That appointment time is no longer available.");

    // Serialize every automatic assignment for this calendar. The lock keeps
    // simultaneous bookings from reading the same load and repeatedly choosing
    // the same professional before either appointment has been inserted.
    await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `${opts.publicKey}:professional-assignment`,
    ]);

    const requestedPartnerId = opts.requestedPartnerId && partnerIds.includes(opts.requestedPartnerId)
      ? opts.requestedPartnerId
      : "";
    const balancedPartners = requestedPartnerId ? [] : await client.query<{ partner_profile_id: string }>(
      `select candidate.partner_profile_id
         from unnest($1::uuid[]) with ordinality as candidate(partner_profile_id, position)
         left join lateral (
           select count(*)::int as appointment_count
             from app.appointments assigned
            where assigned.partner_profile_id = candidate.partner_profile_id
              and assigned.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress', 'completed')
              and (assigned.status <> 'payment_pending' or assigned.hold_expires_at is null or assigned.hold_expires_at > now())
              and assigned.starts_at >= now() - interval '30 days'
              and assigned.starts_at < now() + interval '30 days'
         ) load on true
        order by coalesce(load.appointment_count, 0), candidate.position, candidate.partner_profile_id`,
      [partnerIds],
    );
    const orderedPartnerIds = requestedPartnerId
      ? [requestedPartnerId]
      : balancedPartners.rows.map((row) => row.partner_profile_id);
    let partnerId = "";
    const selectionMode: "customer_selected" | "balanced" = requestedPartnerId
      ? "customer_selected"
      : "balanced";
    let facts: {
      service_id: string;
      calendar_id: string;
      organization_id: string;
      service_name: string;
      service_slug: string;
      duration_minutes: number;
      buffer_before_minutes: number;
      buffer_after_minutes: number;
      price: string;
      deposit_type: "percentage" | "fixed";
      deposit_value: string;
      currency: string;
    } | null = null;
    const startsAt = new Date(requestedStart);

    for (const candidatePartnerId of orderedPartnerIds) {
      const bookingFacts = await client.query<NonNullable<typeof facts>>(
        `select s.id as service_id, c.id as calendar_id, s.organization_id,
                s.name as service_name, s.slug as service_slug, c.duration_minutes,
                c.buffer_before_minutes, c.buffer_after_minutes,
                coalesce(a.price_override, s.price)::text as price,
                s.deposit_type, s.deposit_value::text, s.currency
           from app.service_calendars c
           join app.services s on s.id = c.service_id
           join app.partner_service_assignments a
             on a.service_id = s.id and a.partner_profile_id = $2 and a.status = 'active'
          where c.public_key = $1 and c.status = 'active'
          limit 1`,
        [opts.publicKey, candidatePartnerId],
      );
      const candidateFacts = bookingFacts.rows[0];
      if (!candidateFacts) continue;
      const candidateEndsAt = new Date(startsAt.getTime() + candidateFacts.duration_minutes * 60_000);
      const conflict = await client.query(
        `select 1
           from app.appointments
          where partner_profile_id = $1
            and status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress')
            and (status <> 'payment_pending' or hold_expires_at is null or hold_expires_at > now())
            and starts_at < $3::timestamptz + make_interval(mins => $5)
            and ends_at > $2::timestamptz - make_interval(mins => $4)
          limit 1`,
        [candidatePartnerId, startsAt.toISOString(), candidateEndsAt.toISOString(), candidateFacts.buffer_before_minutes, candidateFacts.buffer_after_minutes],
      );
      if (conflict.rows[0]) continue;
      partnerId = candidatePartnerId;
      facts = candidateFacts;
      break;
    }
    if (!partnerId || !facts) throw new Error("That appointment time is no longer available for the selected coverage area.");
    const directoryAttributionTime = Date.parse(opts.directoryAttribution?.attributedAt || "");
    const directoryAttributionAge = Date.now() - directoryAttributionTime;
    const directoryAttribution = opts.directoryAttribution?.partnerProfileId === partnerId
      && Number.isFinite(directoryAttributionTime)
      && directoryAttributionAge >= -5 * 60 * 1000
      && directoryAttributionAge <= 24 * 60 * 60 * 1000
      ? opts.directoryAttribution
      : undefined;
    const endsAt = new Date(startsAt.getTime() + facts.duration_minutes * 60_000);
    const price = Number(facts.price);
    const depositValue = Number(facts.deposit_value);
    standardDepositCents = depositCents(price, facts.deposit_type, depositValue);
    partnerEarningsCents = Math.max(Math.round(price * 100) - standardDepositCents, 0);
    bookingReward = opts.clientAccountId && standardDepositCents > 0
      ? await availableClientBookingReward(client, opts.clientAccountId, { serviceSlug: facts.service_slug })
      : null;
    freeVisitRewardApplied = bookingReward?.type === "completed_visits";
    amountCents = bookingReward ? 0 : standardDepositCents;
    appointmentReference = publicReference();
    const appointment = await client.query<{ id: string }>(
      `insert into app.appointments (
         public_reference, organization_id, service_id, service_calendar_id,
         partner_profile_id, customer_id, status, selection_mode,
         starts_at, ends_at, timezone,
         address_line_1, address_line_2, city, county, state, postal_code, country_code,
         state_fips, county_fips, county_geoid, place_name, place_geoid,
         latitude, longitude, geography_source, geography_verified_at,
         source_url, source_city, source_county, source_state,
         service_price, deposit_type, deposit_value, deposit_amount, currency,
         hold_expires_at
       ) values (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11,
         $12, $13, $14, $15, $16, $17, $18,
         $19, $20, $21, $22, $23,
         $24, $25, $26, now(),
         $27, $14, $15, $16,
         $28, $29, $30, $31, $32,
         case when $33::boolean then now() + interval '30 minutes' else null end
       ) returning id`,
      [
        appointmentReference, facts.organization_id, facts.service_id, facts.calendar_id,
        partnerId, customerId, amountCents > 0 ? "payment_pending" : "confirmed", selectionMode,
        startsAt.toISOString(), endsAt.toISOString(), opts.timezone,
        opts.address.addressLine1, opts.address.addressLine2 || "",
        availability.geography.placeName || opts.address.city,
        availability.geography.countyName, availability.geography.stateName,
        opts.address.postalCode || "", (opts.address.countryCode || "US").toUpperCase(),
        availability.geography.stateFips, availability.geography.countyFips,
        availability.geography.countyGeoid, availability.geography.placeName,
        availability.geography.placeGeoid,
        Number.isFinite(opts.address.latitude) ? opts.address.latitude : null,
        Number.isFinite(opts.address.longitude) ? opts.address.longitude : null,
        availability.geography.source, opts.sourceUrl || "",
        price, facts.deposit_type, depositValue, standardDepositCents / 100, facts.currency,
        amountCents > 0,
      ],
    );
    appointmentId = appointment.rows[0]?.id || "";
    if (!appointmentId) throw new Error("The appointment could not be reserved.");
    await client.query(
      `update app.appointments
          set metadata = metadata || $2::jsonb,
              updated_at = now()
        where id = $1`,
      [appointmentId, JSON.stringify({
        primary_patient: {
          firstName: text(opts.customer.firstName) || text(opts.customer.fullName).split(/\s+/)[0] || "",
          lastName: text(opts.customer.lastName) || text(opts.customer.fullName).split(/\s+/).slice(1).join(" "),
          fullName: opts.customer.fullName,
          email: opts.customer.email,
          phone: opts.customer.phone,
          dateOfBirth: opts.customer.dateOfBirth || "",
          weight: opts.customer.weight || "",
          height: opts.customer.height || "",
          genderIdentity: opts.customer.genderIdentity || "",
        },
        additional_patients: (opts.attendees || []).map((attendee) => ({
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          fullName: `${attendee.firstName} ${attendee.lastName}`.trim(),
          email: attendee.email,
          phone: attendee.phone,
          dateOfBirth: attendee.dateOfBirth,
          weight: attendee.weight || "",
          height: attendee.height || "",
          genderIdentity: attendee.genderIdentity || "",
        })),
        medical_screening: {
          eligible: true,
          selected: opts.medicalScreening.selected,
          completedAt: opts.medicalScreening.completedAt || new Date().toISOString(),
        },
        // Kept inside appointment metadata for Admin map accuracy. The
        // established GHL webhook payload intentionally remains unchanged.
        service_address_location: Number.isFinite(opts.address.longitude) && Number.isFinite(opts.address.latitude) ? {
          longitude: opts.address.longitude,
          latitude: opts.address.latitude,
          source: "mapbox_verified",
        } : undefined,
        directory_attribution: directoryAttribution,
        client_reward: bookingReward ? {
          applied: true,
          rewardId: bookingReward.id,
          rewardType: bookingReward.type,
          rewardProgram: bookingReward.program,
          benefit: freeVisitRewardApplied ? "free_appointment" : "deposit_waiver",
          standardDepositAmount: standardDepositCents / 100,
          depositWaivedAmount: standardDepositCents / 100,
          servicePriceWaivedAmount: freeVisitRewardApplied ? price : standardDepositCents / 100,
          clientAmountDueAtVisit: freeVisitRewardApplied ? 0 : partnerEarningsCents / 100,
          platformFunded: freeVisitRewardApplied,
          platformFundedPartnerAmount: freeVisitRewardApplied ? partnerEarningsCents / 100 : 0,
          platformFundingStatus: freeVisitRewardApplied ? "owed_after_completion" : "not_applicable",
          paymentSource: freeVisitRewardApplied ? "my_drip_nurse" : "client",
          partnerPaymentReduced: false,
        } : undefined,
        referral_reward: bookingReward?.type === "referral" ? {
          applied: true,
          rewardId: bookingReward.id,
          standardDepositAmount: standardDepositCents / 100,
          depositWaivedAmount: standardDepositCents / 100,
          partnerPaymentReduced: false,
        } : undefined,
      })],
    );
    if (opts.clientAccountId) {
      await client.query(
        `insert into app.client_customer_links (
           client_account_id, booking_customer_id, organization_id, link_source
         ) values ($1, $2, $3, 'booking_session')
         on conflict (booking_customer_id) do nothing`,
        [opts.clientAccountId, customerId, facts.organization_id],
      );
      await client.query(
        `insert into app.client_appointment_access (client_account_id, appointment_id, access_role)
         values ($1, $2, 'primary_patient')
         on conflict (client_account_id, appointment_id)
         do update set access_role = 'primary_patient'`,
        [opts.clientAccountId, appointmentId],
      );
    }
    if (bookingReward && opts.clientAccountId) {
      referralRewardApplied = await redeemClientBookingReward(client, {
        reward: bookingReward,
        accountId: opts.clientAccountId,
        appointmentId,
        depositWaivedCents: standardDepositCents,
        benefit: freeVisitRewardApplied ? "free_appointment" : "deposit_waiver",
        serviceWaivedCents: freeVisitRewardApplied ? Math.round(price * 100) : standardDepositCents,
        partnerFundedCents: freeVisitRewardApplied ? partnerEarningsCents : 0,
      });
      if (!referralRewardApplied) throw new Error("Your Care reward could not be applied. Please try again.");
    }
    await client.query(
      `insert into app.appointment_payments (appointment_id, status, amount, currency)
       values ($1, $2, $3, $4)`,
      [appointmentId, amountCents > 0 ? "pending" : "paid", amountCents / 100, facts.currency],
    );
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, payload)
       values ($1, $2, 'customer', $3::jsonb)`,
      [appointmentId, amountCents > 0 ? "slot_held" : "appointment_confirmed", JSON.stringify({
        selectionMode,
        clientReward: bookingReward ? {
          rewardId: bookingReward.id,
          rewardType: bookingReward.type,
          rewardProgram: bookingReward.program,
          benefit: freeVisitRewardApplied ? "free_appointment" : "deposit_waiver",
          platformFunded: freeVisitRewardApplied,
          platformFundedPartnerAmount: freeVisitRewardApplied ? partnerEarningsCents / 100 : 0,
        } : null,
      })],
    );
    await client.query("commit");
    customerEmail = email;
    serviceName = facts.service_name;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  if (amountCents === 0) {
    await sendConfirmedAppointmentAutomations(appointmentId);
    return { status: "confirmed" as const, appointmentId, publicReference: appointmentReference, checkoutUrl: null, referralRewardApplied };
  }
  try {
    const stripePublishableKey = getStripePublishableKey();
    const embeddedCheckout = Boolean(opts.embeddedCheckout && stripePublishableKey);
    const checkout = await createStripeCheckoutSession({
      appointmentId,
      publicReference: appointmentReference,
      customerEmail,
      serviceName,
      amountCents,
      currency: availability.calendar.currency,
      calendarPublicKey: opts.publicKey,
      returnBaseUrl: opts.checkoutReturnBaseUrl,
      cancelUrl: opts.checkoutCancelUrl,
      returnUrl: opts.checkoutReturnUrl,
      embedded: embeddedCheckout,
    });
    await pool.query(
      `update app.appointment_payments
          set checkout_session_id = $2, metadata = metadata || $3::jsonb, updated_at = now()
        where appointment_id = $1`,
      [appointmentId, checkout.id, JSON.stringify({ checkoutStatus: checkout.status })],
    );
    return {
      status: "payment_required" as const,
      appointmentId,
      publicReference: appointmentReference,
      checkoutUrl: checkout.url,
      checkoutClientSecret: embeddedCheckout ? checkout.client_secret : null,
      checkoutSessionId: embeddedCheckout ? checkout.id : null,
      stripePublishableKey: embeddedCheckout ? stripePublishableKey : null,
      referralRewardApplied,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : "Stripe Checkout failed.";
    await Promise.all([
      pool.query(
        `update app.appointments set status = 'failed', cancellation_reason = $2 where id = $1`,
        [appointmentId, failure],
      ),
      pool.query(
        `update app.appointment_payments set status = 'failed', failure_message = $2 where appointment_id = $1`,
        [appointmentId, failure],
      ),
    ]);
    throw error;
  }
}
