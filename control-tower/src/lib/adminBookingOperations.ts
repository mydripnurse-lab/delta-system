import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { sendAppointmentRefundNotification } from "@/lib/appointmentRefundNotifications";
import { sendAppointmentLifecycleWebhook } from "@/lib/appointmentCreatedWebhook";
import { sendPartnerAppointmentNotification } from "@/lib/partnerAppointmentNotifications";
import { refundStripePayment } from "@/lib/stripeCheckout";
import type { PoolClient } from "pg";

export type AdminAppointmentCandidate = {
  id: string;
  name: string;
  email: string;
  slug: string;
  assignmentId: string;
  priorityWeight: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireReason(value: string) {
  const reason = text(value);
  if (reason.length < 3 || reason.length > 1000) {
    throw new Error("Please provide a reason between 3 and 1,000 characters.");
  }
  return reason;
}

async function appointmentCandidateQuery(client: Pick<PoolClient, "query">, appointmentId: string, excludePartnerId?: string) {
  const result = await client.query<{
    id: string;
    display_name: string;
    email: string;
    slug: string;
    assignment_id: string;
    priority_weight: string | number;
  }>(
    `select distinct partner.id, partner.display_name, partner.email, partner.slug,
            assignment.id as assignment_id, assignment.priority_weight
       from app.appointments appointment
       join app.partner_service_assignments assignment
         on assignment.service_id = appointment.service_id
        and assignment.status = 'active'
       join app.partner_profiles partner
         on partner.id = assignment.partner_profile_id
        and partner.website_status in ('ready', 'published')
      where appointment.id = $1
        and ($2::uuid is null or partner.id <> $2::uuid)
        and exists (
          select 1
            from app.partner_coverage_areas area
           where area.assignment_id = assignment.id
             and area.status = 'active'
             and lower(trim(regexp_replace(area.state, '[^a-zA-Z0-9]+', ' ', 'g'))) = lower(trim(regexp_replace(appointment.state, '[^a-zA-Z0-9]+', ' ', 'g')))
             and lower(trim(regexp_replace(
                   regexp_replace(area.county, '\\m(county|parish|borough|municipality|census area)\\M', '', 'gi'),
                   '[^a-zA-Z0-9]+', ' ', 'g'
                 ))) = lower(trim(regexp_replace(
                   regexp_replace(appointment.county, '\\m(county|parish|borough|municipality|census area)\\M', '', 'gi'),
                   '[^a-zA-Z0-9]+', ' ', 'g'
                 )))
             and (nullif(trim(area.city), '') is null
                  or lower(trim(regexp_replace(area.city, '[^a-zA-Z0-9]+', ' ', 'g'))) = lower(trim(regexp_replace(appointment.city, '[^a-zA-Z0-9]+', ' ', 'g'))))
             and (cardinality(area.postal_codes) = 0 or appointment.postal_code = any(area.postal_codes))
        )
        and not exists (
          select 1
            from app.appointments booked
           where booked.partner_profile_id = partner.id
             and booked.id <> appointment.id
             and booked.status in ('payment_pending', 'confirmed', 'partner_acknowledged', 'in_progress')
             and (booked.status <> 'payment_pending' or booked.hold_expires_at is null or booked.hold_expires_at > now())
             and booked.starts_at < appointment.ends_at
             and booked.ends_at > appointment.starts_at
        )
      order by assignment.priority_weight desc, partner.display_name asc
      limit 100`,
    [appointmentId, excludePartnerId || null],
  );
  return result.rows.map((row): AdminAppointmentCandidate => ({
    id: row.id,
    name: row.display_name,
    email: row.email,
    slug: row.slug,
    assignmentId: row.assignment_id,
    priorityWeight: number(row.priority_weight),
  }));
}

export async function listAdminAppointmentCandidates(appointmentId: string) {
  await ensureBookingEngineSchema();
  const result = await getDbPool().query<{ partner_profile_id: string | null }>(
    `select partner_profile_id from app.appointments where id = $1 limit 1`,
    [appointmentId],
  );
  const currentPartnerId = result.rows[0]?.partner_profile_id || undefined;
  return appointmentCandidateQuery(getDbPool(), appointmentId, currentPartnerId);
}

export async function reassignAdminBookingAppointment(opts: {
  appointmentId: string;
  partnerProfileId: string;
  reason: string;
  adminUserId: string;
}) {
  const reason = requireReason(opts.reason);
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let partnerName = "";
  try {
    await client.query("begin");
    const locked = await client.query<{
      id: string;
      partner_profile_id: string | null;
      status: string;
    }>(
      `select id, partner_profile_id, status
         from app.appointments
        where id = $1
          and status in ('confirmed', 'partner_acknowledged')
        for update`,
      [opts.appointmentId],
    );
    const appointment = locked.rows[0];
    if (!appointment) throw new Error("This appointment can no longer be reassigned.");
    if (appointment.partner_profile_id === opts.partnerProfileId) throw new Error("Choose a different Partner for reassignment.");

    const candidates = await appointmentCandidateQuery(client, opts.appointmentId, appointment.partner_profile_id || undefined);
    const candidate = candidates.find((item) => item.id === opts.partnerProfileId);
    if (!candidate) throw new Error("That Partner is not active, does not cover this location, or is already booked.");
    partnerName = candidate.name;

    await client.query(
      `update app.appointments
          set partner_profile_id = $2,
              status = 'confirmed',
              partner_decline_reason = '',
              declined_at = null,
              metadata = metadata || $3::jsonb,
              updated_at = now()
        where id = $1`,
      [opts.appointmentId, opts.partnerProfileId, JSON.stringify({
        reassignedAt: new Date().toISOString(),
        reassignmentReason: reason,
        reassignedBy: opts.adminUserId,
      })],
    );
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'admin_reassigned', 'admin', $2, $3::jsonb)`,
      [opts.appointmentId, opts.adminUserId, JSON.stringify({ toPartnerProfileId: opts.partnerProfileId, reason })],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  void sendPartnerAppointmentNotification(opts.appointmentId, "reassigned");
  void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_reassigned").catch((error) => {
    console.error("Appointment-reassigned webhook failed", error);
  });
  return { appointmentId: opts.appointmentId, partnerName };
}

export async function refundAdminBookingAppointment(opts: {
  appointmentId: string;
  reason: string;
  adminUserId: string;
}) {
  const reason = requireReason(opts.reason);
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let payment: { paymentIntentId: string; amount: number } | null = null;
  try {
    await client.query("begin");
    const locked = await client.query<{
      id: string;
      status: string;
      payment_intent_id: string | null;
      payment_amount: string | null;
      payment_status: string | null;
    }>(
      `select appointment.id, appointment.status,
              payment.payment_intent_id,
              payment.amount::text as payment_amount,
              payment.status as payment_status
         from app.appointments appointment
         left join app.appointment_payments payment on payment.appointment_id = appointment.id
        where appointment.id = $1
          and appointment.status not in ('completed', 'refunded', 'cancelled', 'failed')
        for update`,
      [opts.appointmentId],
    );
    const appointment = locked.rows[0];
    if (!appointment) throw new Error("This appointment is already closed and cannot be refunded.");
    if (appointment.payment_status === "processing") throw new Error("A refund is already being processed for this appointment.");
    if (appointment.payment_status !== "paid" || !appointment.payment_intent_id || number(appointment.payment_amount) <= 0) {
      await client.query(
        `update app.appointments
            set status = 'cancelled', partner_profile_id = null, cancellation_reason = $2, cancelled_at = now(), updated_at = now()
          where id = $1`,
        [opts.appointmentId, reason],
      );
      await client.query(
        `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
         values ($1, 'admin_cancelled_no_refund', 'admin', $2, $3::jsonb)`,
        [opts.appointmentId, opts.adminUserId, JSON.stringify({ reason, paymentStatus: appointment.payment_status || "pending" })],
      );
      await client.query("commit");
      return { appointmentId: opts.appointmentId, outcome: "cancelled" as const, refundId: null };
    }

    payment = { paymentIntentId: appointment.payment_intent_id, amount: number(appointment.payment_amount) };
    await client.query(
      `update app.appointment_payments
          set status = 'processing', updated_at = now()
        where appointment_id = $1 and status = 'paid'`,
      [opts.appointmentId],
    );
    await client.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'admin_refund_requested', 'admin', $2, $3::jsonb)`,
      [opts.appointmentId, opts.adminUserId, JSON.stringify({ reason })],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (!payment) return { appointmentId: opts.appointmentId, outcome: "cancelled" as const, refundId: null };
  try {
    const refund = await refundStripePayment({ paymentIntentId: payment.paymentIntentId, amountCents: Math.round(payment.amount * 100) });
    await pool.query(
      `update app.appointments
          set status = 'refunded', partner_profile_id = null, cancellation_reason = $2, cancelled_at = now(), updated_at = now()
        where id = $1`,
      [opts.appointmentId, reason],
    );
    await pool.query(
      `update app.appointment_payments
          set status = 'refunded', refund_id = $2, refunded_at = now(), updated_at = now()
        where appointment_id = $1 and status = 'processing'`,
      [opts.appointmentId, refund.id],
    );
    await pool.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'deposit_refunded', 'admin', $2, $3::jsonb)`,
      [opts.appointmentId, opts.adminUserId, JSON.stringify({ refundId: refund.id, reason })],
    );
    void sendAppointmentLifecycleWebhook(opts.appointmentId, "appointment_refunded").catch((error) => {
      console.error("Appointment-refunded webhook failed", error);
    });
    void sendAppointmentRefundNotification({ appointmentId: opts.appointmentId, refundId: refund.id, reason, replacementFound: false });
    return { appointmentId: opts.appointmentId, outcome: "refunded" as const, refundId: refund.id };
  } catch (error) {
    await pool.query(
      `update app.appointment_payments
          set status = 'paid', updated_at = now()
        where appointment_id = $1 and status = 'processing'`,
      [opts.appointmentId],
    );
    await pool.query(
      `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
       values ($1, 'deposit_refund_failed', 'admin', $2, $3::jsonb)`,
      [opts.appointmentId, opts.adminUserId, JSON.stringify({ reason, error: error instanceof Error ? error.message : "Refund failed" })],
    );
    throw new Error("The automatic refund failed and the appointment remains available for Admin review.");
  }
}
