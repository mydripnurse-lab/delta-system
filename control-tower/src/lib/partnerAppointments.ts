import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { sendPartnerAppointmentNotification, type NotificationEvent } from "@/lib/partnerAppointmentNotifications";
import { sendCustomerAppointmentNotification } from "@/lib/customerAppointmentNotifications";
import { sendAppointmentRefundNotification } from "@/lib/appointmentRefundNotifications";
import { refundStripePayment } from "@/lib/stripeCheckout";
import { sendAppointmentLifecycleWebhook } from "@/lib/appointmentCreatedWebhook";

export type PartnerPortalAppointment = {
  id: string;
  reference: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerDateOfBirth: string;
  additionalPatients: Array<{ fullName: string; email: string; phone: string; dateOfBirth: string }>;
  address: string;
  county: string;
  city: string;
  state: string;
  postalCode: string;
  amountDueAtVisit: number;
  currency: string;
};

export type PartnerPortalDashboard = {
  completedAppointments: number;
  upcomingAppointments: number;
  acceptedAppointments: number;
  declinedAppointments: number;
  acceptanceRate: number;
  score: number;
  scoreLabel: "Excellent" | "Good" | "Needs attention";
  completedRevenue: number;
  currency: string;
};

export async function listPartnerPortalAppointments(profileId: string): Promise<PartnerPortalAppointment[]> {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    id: string;
    public_reference: string;
    service_name: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    status: string;
    full_name: string;
    email: string;
    phone: string;
    metadata: { primary_patient?: { dateOfBirth?: string }; additional_patients?: Array<{ fullName?: string; email?: string; phone?: string; dateOfBirth?: string }> } | null;
    address_line_1: string;
    address_line_2: string;
    county: string;
    city: string;
    state: string;
    postal_code: string;
    amount_due_at_visit: string;
    currency: string;
  }>(
    `select appointment.id, appointment.public_reference,
            service.name as service_name,
            appointment.starts_at::text, appointment.ends_at::text,
            appointment.timezone, appointment.status,
            customer.full_name, customer.email, customer.phone,
            appointment.metadata,
            appointment.address_line_1, appointment.address_line_2,
            appointment.county,
            appointment.city, appointment.state, appointment.postal_code,
            greatest(appointment.service_price - appointment.deposit_amount, 0)::text as amount_due_at_visit,
            appointment.currency
       from app.appointments appointment
       join app.services service on service.id = appointment.service_id
       join app.booking_customers customer on customer.id = appointment.customer_id
      where appointment.partner_profile_id = $1::uuid
        and appointment.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress', 'completed')
      order by appointment.starts_at
`,
    [profileId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    reference: row.public_reference,
    serviceName: row.service_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    customerName: row.full_name,
    customerEmail: row.email,
    customerPhone: row.phone,
    customerDateOfBirth: row.metadata?.primary_patient?.dateOfBirth || "",
    additionalPatients: (row.metadata?.additional_patients || []).map((patient) => ({
      fullName: patient.fullName || "Additional patient",
      email: patient.email || "",
      phone: patient.phone || "",
      dateOfBirth: patient.dateOfBirth || "",
    })),
    address: [row.address_line_1, row.address_line_2].filter(Boolean).join(", "),
    county: row.county,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    amountDueAtVisit: Number(row.amount_due_at_visit || 0),
    currency: row.currency,
  }));
}

export async function advancePartnerAppointment(opts: {
  profileId: string;
  appointmentId: string;
  action: "acknowledge" | "start" | "complete";
  earlyStartReason?: string;
}) {
  await ensureBookingEngineSchema();
  const earlyStartReason = opts.earlyStartReason?.trim() || "";
  const transitions: Record<typeof opts.action, { from: string[]; to: string; event: NotificationEvent }> = {
    acknowledge: { from: ["payment_pending", "confirmed"], to: "partner_acknowledged", event: "partner_acknowledged" },
    start: { from: ["partner_acknowledged"], to: "in_progress", event: "visit_started" },
    complete: { from: ["in_progress"], to: "completed", event: "visit_completed" },
  };
  const transition = transitions[opts.action];
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const lockedAppointment = await client.query<{ starts_at: string; status: string }>(
      `select starts_at::text, status
         from app.appointments
        where id = $1 and partner_profile_id = $2::uuid
        for update`,
      [opts.appointmentId, opts.profileId],
    );
    const lockedRow = lockedAppointment.rows[0];
    if (!lockedRow) throw new Error("This appointment is no longer available.");
    if (opts.action === "start" && new Date(lockedRow.starts_at).getTime() > Date.now() && earlyStartReason.length < 3) {
      throw new Error("This visit cannot start before its scheduled time without a reason.");
    }
    const appointment = await client.query<{ id: string; customer_id: string; organization_id: string }>(
      `update app.appointments
          set status = $4,
              completed_at = case when $4 = 'completed' then now() else completed_at end,
              updated_at = now()
        where id = $1
          and partner_profile_id = $2::uuid
          and status = any($3::text[])
        returning id, customer_id, organization_id`,
      [opts.appointmentId, opts.profileId, transition.from, transition.to],
    );
    const row = appointment.rows[0];
    if (!row) throw new Error("This appointment is no longer in the expected status.");
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, $2, 'partner', $3, $4::jsonb)`,
      [
        row.id,
        transition.event,
        opts.profileId,
        JSON.stringify(opts.action === "start" && earlyStartReason
          ? { earlyStart: true, reason: earlyStartReason, scheduledStart: lockedRow.starts_at, recordedAt: new Date().toISOString() }
          : {}),
      ],
    );
    if (transition.to === "completed") {
      await client.query(
        `insert into app.customer_partner_affinities (
           organization_id, customer_id, partner_profile_id,
           successful_appointments, last_completed_at, status
         ) values ($1, $2, $3, 1, now(), 'preferred')
         on conflict (customer_id, partner_profile_id) do update set
           successful_appointments = app.customer_partner_affinities.successful_appointments + 1,
           last_completed_at = now(),
           status = 'preferred',
           updated_at = now()`,
        [row.organization_id, row.customer_id, opts.profileId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  void sendPartnerAppointmentNotification(opts.appointmentId, transition.event);
  if (opts.action === "acknowledge") {
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_accepted").catch((error) => {
      console.error("Appointment-accepted webhook failed", error);
    });
  }
  if (opts.action === "complete") {
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_completed").catch((error) => {
      console.error("Appointment-completed webhook failed", error);
    });
  }
  return listPartnerPortalAppointments(opts.profileId);
}

export async function getPartnerPortalDashboard(profileId: string): Promise<PartnerPortalDashboard> {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{
    completed_count: string;
    upcoming_count: string;
    accepted_count: string;
    declined_count: string;
    completed_revenue: string;
    currency: string | null;
  }>(
    `select
       count(*) filter (where appointment.status = 'completed')::text as completed_count,
       count(*) filter (where appointment.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress') and appointment.starts_at >= now())::text as upcoming_count,
       count(*) filter (where exists (
         select 1 from app.appointment_events accepted
          where accepted.appointment_id = appointment.id
            and accepted.actor_type = 'partner' and accepted.actor_id = $1
            and accepted.event_type = 'partner_acknowledged'
       ))::text as accepted_count,
       count(*) filter (where exists (
         select 1 from app.appointment_events declined
          where declined.appointment_id = appointment.id
            and declined.actor_type = 'partner' and declined.actor_id = $1
            and declined.event_type = 'partner_declined'
       ))::text as declined_count,
       coalesce(sum(greatest(appointment.service_price - appointment.deposit_amount, 0)) filter (where appointment.status = 'completed'), 0)::text as completed_revenue,
       max(appointment.currency) as currency
       from app.appointments appointment
      where appointment.partner_profile_id = $1::uuid
         or exists (
           select 1 from app.appointment_events partner_event
            where partner_event.appointment_id = appointment.id
              and partner_event.actor_type = 'partner'
              and partner_event.actor_id = $1
              and partner_event.event_type in ('partner_acknowledged', 'partner_declined', 'visit_completed')
         )`,
    [profileId],
  );
  const row = result.rows[0];
  const completedAppointments = Number(row?.completed_count || 0);
  const upcomingAppointments = Number(row?.upcoming_count || 0);
  const acceptedAppointments = Number(row?.accepted_count || 0);
  const declinedAppointments = Number(row?.declined_count || 0);
  const decisions = acceptedAppointments + declinedAppointments;
  const acceptanceRate = decisions ? Math.round((acceptedAppointments / decisions) * 100) : 100;
  const score = Math.max(0, Math.min(100, Math.round(100 - (declinedAppointments * 10))));
  return {
    completedAppointments,
    upcomingAppointments,
    acceptedAppointments,
    declinedAppointments,
    acceptanceRate,
    score,
    scoreLabel: score >= 90 ? "Excellent" : score >= 75 ? "Good" : "Needs attention",
    completedRevenue: Number(row?.completed_revenue || 0),
    currency: row?.currency || "USD",
  };
}

export async function reschedulePartnerAppointment(opts: {
  profileId: string;
  appointmentId: string;
  newDate: string;
  newTime: string;
  timezone: string;
  reason?: string;
}) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let previousStartsAt = "";
  let previousEndsAt = "";
  try {
    await client.query("begin");
    const locked = await client.query<{
      id: string;
      public_reference: string;
      starts_at: string;
      ends_at: string;
      timezone: string;
      status: string;
    }>(
      `select id, public_reference, starts_at::text, ends_at::text, timezone, status
         from app.appointments
        where id = $1 and partner_profile_id = $2::uuid
        for update`,
      [opts.appointmentId, opts.profileId],
    );
    if (!locked.rowCount) throw new Error("Appointment not found.");
    const appointment = locked.rows[0];
    previousStartsAt = appointment.starts_at;
    previousEndsAt = appointment.ends_at;
    if (!["confirmed", "partner_acknowledged"].includes(appointment.status)) {
      throw new Error("Only accepted appointments can be rescheduled.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.newDate) || !/^\d{2}:\d{2}$/.test(opts.newTime)) {
      throw new Error("Choose a valid date and time.");
    }
    const timezone = opts.timezone || appointment.timezone;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    } catch {
      throw new Error("Choose a valid appointment timezone.");
    }
    const converted = await client.query<{ starts_at: string }>(
      "select (($1::date + $2::time) at time zone $3)::timestamptz as starts_at",
      [opts.newDate, opts.newTime, timezone],
    );
    const newStart = converted.rows[0]?.starts_at;
    if (!newStart) throw new Error("Unable to calculate the new appointment time.");
    if (new Date(newStart).getTime() < Date.now() + 2 * 60 * 60 * 1000) {
      throw new Error("Rescheduled appointments require at least 2 hours notice.");
    }
    const durationMs = new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime();
    if (!(durationMs > 0)) throw new Error("The appointment duration is invalid.");
    const newEnd = new Date(new Date(newStart).getTime() + durationMs).toISOString();
    const conflict = await client.query(
      `select 1 from app.appointments
        where partner_profile_id = $1::uuid and id <> $2
          and status in ('payment_pending','confirmed','partner_acknowledged','in_progress')
          and (status <> 'payment_pending' or hold_expires_at is null or hold_expires_at > now())
          and starts_at < $4::timestamptz and ends_at > $3::timestamptz
        limit 1`,
      [opts.profileId, opts.appointmentId, newStart, newEnd],
    );
    if (conflict.rowCount) throw new Error("That time overlaps another appointment.");
    await client.query(
      `update app.appointments
          set starts_at = $2::timestamptz, ends_at = $3::timestamptz, timezone = $4, updated_at = now()
        where id = $1`,
      [opts.appointmentId, newStart, newEnd, timezone],
    );
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'appointment_rescheduled', 'partner', $2, $3::jsonb)`,
      [opts.appointmentId, opts.profileId, JSON.stringify({
        previousStartsAt: appointment.starts_at,
        previousEndsAt: appointment.ends_at,
        newStartsAt: newStart,
        newEndsAt: newEnd,
        timezone,
        reason: opts.reason?.trim() || null,
      })],
    );
    await client.query("commit");
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    throw error;
  } finally {
    client.release();
  }
  void sendPartnerAppointmentNotification(opts.appointmentId, "rescheduled");
  void sendAppointmentLifecycleWebhook(opts.appointmentId, "partner_rescheduled").catch((error) => {
    console.error("Partner-rescheduled webhook failed", error);
  });
  void sendCustomerAppointmentNotification(opts.appointmentId, "rescheduled", {
    previousStartsAt,
    previousEndsAt,
    reason: opts.reason,
  });
  return listPartnerPortalAppointments(opts.profileId);
}

export async function declinePartnerAppointment(opts: {
  profileId: string;
  appointmentId: string;
  reason: string;
}) {
  const reason = opts.reason.trim();
  if (reason.length < 3 || reason.length > 1000) throw new Error("Please provide a reason between 3 and 1,000 characters.");
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let replacement: { id: string; name: string } | null = null;
  let payment: { paymentIntentId: string | null; amount: number; status: string } | null = null;
  let replacementFound = false;
  try {
    await client.query("begin");
    const locked = await client.query<{
      id: string; organization_id: string; service_id: string; partner_profile_id: string;
      state: string; county: string; city: string; starts_at: string; ends_at: string;
      payment_intent_id: string | null; payment_amount: string | null; payment_status: string | null;
    }>(
      `select appointment.id, appointment.organization_id, appointment.service_id, appointment.partner_profile_id,
              appointment.state, appointment.county, appointment.city,
              appointment.starts_at, appointment.ends_at,
              payment.payment_intent_id, payment.amount::text as payment_amount, payment.status as payment_status
         from app.appointments appointment
         left join app.appointment_payments payment on payment.appointment_id = appointment.id
        where appointment.id = $1
          and appointment.partner_profile_id = $2::uuid
          and appointment.status in ('payment_pending', 'confirmed', 'partner_acknowledged')
        for update`,
      [opts.appointmentId, opts.profileId],
    );
    const appointment = locked.rows[0];
    if (!appointment) throw new Error("This appointment is no longer available to accept or decline.");
    const alternative = await client.query<{ id: string; display_name: string }>(
      `select distinct partner.id, partner.display_name, assignment.priority_weight
         from app.partner_service_assignments assignment
         join app.partner_profiles partner on partner.id = assignment.partner_profile_id
         join app.partner_coverage_areas area on area.assignment_id = assignment.id and area.status = 'active'
        where assignment.service_id = $1
          and assignment.status = 'active'
          and assignment.partner_profile_id <> $2::uuid
          and partner.website_status in ('ready', 'published')
          and lower(trim(regexp_replace(area.state, '[^a-zA-Z0-9]+', ' ', 'g'))) = lower(trim(regexp_replace($3, '[^a-zA-Z0-9]+', ' ', 'g')))
          and lower(trim(regexp_replace(regexp_replace(area.county, '\\m(county|parish|borough|municipality|census area)\\M', '', 'gi'), '[^a-zA-Z0-9]+', ' ', 'g'))) = lower(trim(regexp_replace(regexp_replace($4, '\\m(county|parish|borough|municipality|census area)\\M', '', 'gi'), '[^a-zA-Z0-9]+', ' ', 'g')))
          and (nullif(trim(area.city), '') is null or lower(trim(regexp_replace(area.city, '[^a-zA-Z0-9]+', ' ', 'g'))) = lower(trim(regexp_replace($5, '[^a-zA-Z0-9]+', ' ', 'g'))))
          and not exists (
            select 1
              from app.appointments booked
             where booked.partner_profile_id = partner.id
               and booked.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress')
               and (booked.status <> 'payment_pending' or booked.hold_expires_at is null or booked.hold_expires_at > now())
               and booked.starts_at < $7::timestamptz
               and booked.ends_at > $6::timestamptz
          )
        order by assignment.priority_weight desc, partner.id
        limit 1`,
      [appointment.service_id, opts.profileId, appointment.state, appointment.county, appointment.city, appointment.starts_at, appointment.ends_at],
    );
    replacement = alternative.rows[0] ? { id: alternative.rows[0].id, name: alternative.rows[0].display_name } : null;
    replacementFound = Boolean(replacement);
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'partner_declined', 'partner', $2, $3::jsonb)`,
      [opts.appointmentId, opts.profileId, JSON.stringify({ reason, replacementFound })],
    );
    if (replacement) {
      await client.query(
        `update app.appointments
            set partner_profile_id = $2, status = 'confirmed', partner_decline_reason = '', declined_at = null,
                metadata = metadata || $3::jsonb, updated_at = now()
          where id = $1`,
        [opts.appointmentId, replacement.id, JSON.stringify({ reassignedAt: new Date().toISOString(), reassignedFromPartnerProfileId: opts.profileId, reassignmentReason: reason })],
      );
      await client.query(
        `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
         values ($1, 'partner_reassigned', 'system', 'booking-engine', $2::jsonb)`,
        [opts.appointmentId, JSON.stringify({ fromPartnerProfileId: opts.profileId, toPartnerProfileId: replacement.id, reason })],
      );
    } else {
      await client.query(
        `update app.appointments
            set status = 'partner_declined', partner_decline_reason = $2, declined_at = now(), updated_at = now()
          where id = $1`,
        [opts.appointmentId, reason],
      );
      payment = appointment.payment_intent_id ? {
        paymentIntentId: appointment.payment_intent_id,
        amount: Number(appointment.payment_amount || 0),
        status: appointment.payment_status || "pending",
      } : null;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (replacement) {
    void sendPartnerAppointmentNotification(opts.appointmentId, "reassigned");
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_declined").catch((error) => {
      console.error("Appointment-declined webhook failed", error);
    });
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_reassigned").catch((error) => {
      console.error("Appointment-reassigned webhook failed", error);
    });
    return { outcome: "reassigned" as const, replacementPartnerName: replacement.name, appointments: await listPartnerPortalAppointments(opts.profileId) };
  }

  if (!payment || payment.status !== "paid" || !payment.paymentIntentId || payment.amount <= 0) {
    await pool.query(
      `update app.appointments set status = 'cancelled', partner_profile_id = null, updated_at = now() where id = $1 and status = 'partner_declined'`,
      [opts.appointmentId],
    );
    await pool.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'deposit_refund_not_required', 'system', 'booking-engine', $2::jsonb)`,
      [opts.appointmentId, JSON.stringify({ reason: "No paid deposit was found." })],
    );
    void sendPartnerAppointmentNotification(opts.appointmentId, "partner_declined");
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_declined").catch((error) => {
      console.error("Appointment-declined webhook failed", error);
    });
    return { outcome: "cancelled" as const, replacementPartnerName: null, appointments: await listPartnerPortalAppointments(opts.profileId) };
  }

  try {
    const refund = await refundStripePayment({ paymentIntentId: payment.paymentIntentId, amountCents: Math.round(payment.amount * 100) });
    await pool.query(
      `update app.appointments set status = 'refunded', partner_profile_id = null, updated_at = now() where id = $1 and status = 'partner_declined'`,
      [opts.appointmentId],
    );
    await pool.query(
      `update app.appointment_payments set status = 'refunded', refund_id = $2, refunded_at = now(), updated_at = now() where appointment_id = $1`,
      [opts.appointmentId, refund.id],
    );
    await pool.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'deposit_refunded', 'system', 'stripe', $2::jsonb)`,
      [opts.appointmentId, JSON.stringify({ refundId: refund.id, reason })],
    );
    void sendPartnerAppointmentNotification(opts.appointmentId, "partner_declined");
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_declined").catch((error) => {
      console.error("Appointment-declined webhook failed", error);
    });
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_refunded").catch((error) => {
      console.error("Appointment-refunded webhook failed", error);
    });
    void sendAppointmentRefundNotification({ appointmentId: opts.appointmentId, refundId: refund.id, reason, replacementFound: false });
    return { outcome: "refunded" as const, replacementPartnerName: null, appointments: await listPartnerPortalAppointments(opts.profileId) };
  } catch (error) {
    await pool.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'deposit_refund_failed', 'system', 'stripe', $2::jsonb)`,
      [opts.appointmentId, JSON.stringify({ error: error instanceof Error ? error.message : "Refund failed" })],
    );
    throw new Error("The appointment was declined, but the automatic deposit refund needs Admin review.");
  }
}
