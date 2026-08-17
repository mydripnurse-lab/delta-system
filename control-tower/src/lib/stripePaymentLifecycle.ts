import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { recordPartnerAffiliateCommission } from "@/lib/partnerAffiliate";
import { sendAppointmentCreatedWebhook, sendAppointmentLifecycleWebhook } from "@/lib/appointmentCreatedWebhook";
import { sendAppointmentRefundNotification } from "@/lib/appointmentRefundNotifications";
import { createPartnerAppointmentPush } from "@/lib/partnerPushNotifications";

const PAYMENT_CONFIRMED_APPOINTMENT_STATUSES = new Set([
  "confirmed",
  "partner_acknowledged",
  "in_progress",
  "completed",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function centsToAmount(value: number) {
  return Math.round(value) / 100;
}

function requireCurrency(value: string) {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Stripe returned an invalid payment currency.");
  return normalized;
}

async function runNotificationTasks(tasks: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") console.error("Appointment automation failed", result.reason);
  });
}

/**
 * One notification gateway for appointments that are financially confirmed.
 * SMS and email recipients are routed from one compact GHL payload configured
 * in Admin > Communications. The Partner PWA push stays an internal delivery.
 */
export async function sendConfirmedAppointmentAutomations(appointmentId: string) {
  await runNotificationTasks([
    recordPartnerAffiliateCommission(appointmentId),
    createPartnerAppointmentPush(appointmentId, "appointment_confirmation"),
    sendAppointmentCreatedWebhook(appointmentId),
  ]);
}

export async function confirmStripeCheckoutPayment(opts: {
  appointmentId: string;
  sessionId: string;
  paymentIntentId?: string | null;
  amountTotalCents: number;
  currency: string;
  source: "stripe_webhook" | "checkout_return";
  actorId: string;
}) {
  await ensureBookingEngineSchema();
  const currency = requireCurrency(opts.currency);
  if (!Number.isInteger(opts.amountTotalCents) || opts.amountTotalCents < 0) {
    throw new Error("Stripe returned an invalid payment amount.");
  }
  const pool = getDbPool();
  const client = await pool.connect();
  let confirmed = false;
  let alreadyConfirmed = false;
  try {
    await client.query("begin");
    const locked = await client.query<{
      appointment_status: string;
      payment_status: string;
      amount: string;
      currency: string;
      checkout_session_id: string | null;
      payment_intent_id: string | null;
    }>(
      `select appointment.status as appointment_status, payment.status as payment_status,
              payment.amount::text, payment.currency, payment.checkout_session_id, payment.payment_intent_id
         from app.appointments appointment
         join app.appointment_payments payment on payment.appointment_id = appointment.id
        where appointment.id = $1::uuid
        for update of appointment, payment`,
      [opts.appointmentId],
    );
    const row = locked.rows[0];
    if (!row) throw new Error("Stripe payment does not belong to an appointment.");
    if (row.checkout_session_id && row.checkout_session_id !== opts.sessionId) {
      throw new Error("Stripe Checkout session does not match the stored appointment payment.");
    }
    if (row.payment_intent_id && opts.paymentIntentId && row.payment_intent_id !== opts.paymentIntentId) {
      throw new Error("Stripe PaymentIntent does not match the stored appointment payment.");
    }
    if (money(row.amount) !== opts.amountTotalCents || row.currency.toUpperCase() !== currency) {
      throw new Error("Stripe payment amount or currency does not match the appointment deposit.");
    }

    // The signed webhook can finish a payment a fraction of a second before
    // Embedded Checkout calls this browser-return path. Treat that state as a
    // successful, idempotent reconciliation instead of leaving the customer on
    // a false "payment is still processing" screen.
    alreadyConfirmed = PAYMENT_CONFIRMED_APPOINTMENT_STATUSES.has(row.appointment_status)
      && row.payment_status === "paid";

    if (row.appointment_status === "payment_pending") {
      const updated = await client.query<{ id: string }>(
        `update app.appointments
            set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()),
                hold_expires_at = null, cancellation_reason = '', updated_at = now()
          where id = $1::uuid and status = 'payment_pending'
          returning id::text`,
        [opts.appointmentId],
      );
      confirmed = Boolean(updated.rows[0]);
    }

    if (confirmed || alreadyConfirmed) {
      await client.query(
        `update app.appointment_payments
            set status = 'paid', checkout_session_id = coalesce(checkout_session_id, $2),
                payment_intent_id = coalesce(payment_intent_id, $3),
                failure_code = '', failure_message = '', paid_at = coalesce(paid_at, now()), updated_at = now()
          where appointment_id = $1::uuid`,
        [opts.appointmentId, opts.sessionId, opts.paymentIntentId || null],
      );
    } else if (row.appointment_status !== "confirmed" || row.payment_status !== "paid") {
      throw new Error(`Appointment cannot accept a payment while it is ${row.appointment_status}.`);
    }

    if (confirmed) {
      await client.query(
        `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
         values ($1::uuid, 'deposit_paid', 'stripe', $2, $3::jsonb)`,
        [opts.appointmentId, opts.actorId, JSON.stringify({ source: opts.source, checkoutSessionId: opts.sessionId })],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (confirmed) await sendConfirmedAppointmentAutomations(opts.appointmentId);
  return { confirmed: confirmed || alreadyConfirmed, appointmentId: opts.appointmentId };
}

export async function markStripeCheckoutProcessing(opts: {
  appointmentId: string;
  sessionId: string;
  paymentIntentId?: string | null;
  amountTotalCents: number;
  currency: string;
}) {
  await ensureBookingEngineSchema();
  const currency = requireCurrency(opts.currency);
  const result = await getDbPool().query<{ amount: string; currency: string; checkout_session_id: string | null }>(
    `select amount::text, currency, checkout_session_id
       from app.appointment_payments
      where appointment_id = $1::uuid
      limit 1`,
    [opts.appointmentId],
  );
  const row = result.rows[0];
  if (!row || money(row.amount) !== opts.amountTotalCents || row.currency.toUpperCase() !== currency) {
    throw new Error("Stripe pending payment does not match the appointment deposit.");
  }
  if (row.checkout_session_id && row.checkout_session_id !== opts.sessionId) {
    throw new Error("Stripe Checkout session does not match the appointment payment.");
  }
  await getDbPool().query(
    `update app.appointment_payments
        set status = 'processing', checkout_session_id = coalesce(checkout_session_id, $2),
            payment_intent_id = coalesce(payment_intent_id, $3), updated_at = now()
      where appointment_id = $1::uuid and status = 'pending'`,
    [opts.appointmentId, opts.sessionId, opts.paymentIntentId || null],
  );
}

export async function failStripePayment(opts: {
  appointmentId?: string;
  sessionId?: string;
  paymentIntentId?: string;
  failureCode?: string;
  failureMessage: string;
  actorId: string;
}) {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  let appointmentId = text(opts.appointmentId);
  let failed = false;
  try {
    await client.query("begin");
    const locked = await client.query<{
      appointment_id: string;
      checkout_session_id: string | null;
      payment_intent_id: string | null;
      appointment_status: string;
    }>(
      `select payment.appointment_id::text, payment.checkout_session_id, payment.payment_intent_id,
              appointment.status as appointment_status
         from app.appointment_payments payment
         join app.appointments appointment on appointment.id = payment.appointment_id
        where ($1::uuid is not null and payment.appointment_id = $1::uuid)
           or ($2::text <> '' and payment.checkout_session_id = $2)
           or ($3::text <> '' and payment.payment_intent_id = $3)
        order by case when payment.appointment_id = $1::uuid then 0 else 1 end
        limit 1
        for update of appointment, payment`,
      [appointmentId || null, text(opts.sessionId), text(opts.paymentIntentId)],
    );
    const row = locked.rows[0];
    if (!row) {
      await client.query("commit");
      return { failed: false, appointmentId: "" };
    }
    appointmentId = row.appointment_id;
    if (opts.sessionId && row.checkout_session_id && row.checkout_session_id !== opts.sessionId) {
      throw new Error("Stripe failure references a different Checkout session.");
    }
    if (opts.paymentIntentId && row.payment_intent_id && row.payment_intent_id !== opts.paymentIntentId) {
      throw new Error("Stripe failure references a different PaymentIntent.");
    }
    if (row.appointment_status === "payment_pending") {
      const changed = await client.query<{ id: string }>(
        `update app.appointments
            set status = 'failed', partner_profile_id = null, cancellation_reason = $2,
                hold_expires_at = null, updated_at = now()
          where id = $1::uuid and status = 'payment_pending'
          returning id::text`,
        [appointmentId, opts.failureMessage],
      );
      failed = Boolean(changed.rows[0]);
      await client.query(
        `update app.appointment_payments
            set status = 'failed', failure_code = $2, failure_message = $3, updated_at = now()
          where appointment_id = $1::uuid and status in ('pending', 'processing')`,
        [appointmentId, text(opts.failureCode), opts.failureMessage],
      );
      if (failed) {
        await client.query(
          `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
           values ($1::uuid, 'deposit_payment_failed', 'stripe', $2, $3::jsonb)`,
          [appointmentId, opts.actorId, JSON.stringify({ failureCode: text(opts.failureCode), failureMessage: opts.failureMessage })],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { failed, appointmentId };
}

export async function applyStripeRefundUpdate(opts: {
  stripeRefundId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
  reason?: string;
  failureReason?: string;
  actorId: string;
  actorType?: "stripe" | "admin" | "partner";
}) {
  await ensureBookingEngineSchema();
  const currency = requireCurrency(opts.currency);
  if (!opts.stripeRefundId || !opts.paymentIntentId || !Number.isInteger(opts.amountCents) || opts.amountCents <= 0) {
    throw new Error("Stripe refund payload is incomplete.");
  }
  const pool = getDbPool();
  const client = await pool.connect();
  let appointmentId = "";
  let fullyRefunded = false;
  let becameFullyRefunded = false;
  try {
    await client.query("begin");
    const locked = await client.query<{
      payment_id: string;
      appointment_id: string;
      amount: string;
      currency: string;
      payment_status: string;
      appointment_status: string;
    }>(
      `select payment.id::text as payment_id, payment.appointment_id::text, payment.amount::text,
              payment.currency, payment.status as payment_status, appointment.status as appointment_status
         from app.appointment_payments payment
         join app.appointments appointment on appointment.id = payment.appointment_id
        where payment.payment_intent_id = $1
        limit 1
        for update of payment, appointment`,
      [opts.paymentIntentId],
    );
    const row = locked.rows[0];
    if (!row) throw new Error("Stripe refund does not match an appointment payment.");
    if (row.currency.toUpperCase() !== currency) throw new Error("Stripe refund currency does not match the appointment payment.");
    appointmentId = row.appointment_id;

    await client.query(
      `insert into app.appointment_refunds (
         appointment_payment_id, stripe_refund_id, amount, currency, status, reason, failure_reason,
         succeeded_at, failed_at, metadata
       ) values ($1::uuid, $2, $3, $4, $5, $6, $7,
                 case when $5 = 'succeeded' then now() else null end,
                 case when $5 in ('failed', 'canceled') then now() else null end,
                 $8::jsonb)
       on conflict (stripe_refund_id) do update
         set status = excluded.status, reason = excluded.reason, failure_reason = excluded.failure_reason,
             succeeded_at = case when excluded.status = 'succeeded' then coalesce(appointment_refunds.succeeded_at, now()) else appointment_refunds.succeeded_at end,
             failed_at = case when excluded.status in ('failed', 'canceled') then coalesce(appointment_refunds.failed_at, now()) else appointment_refunds.failed_at end,
             metadata = appointment_refunds.metadata || excluded.metadata, updated_at = now()`,
      [row.payment_id, opts.stripeRefundId, centsToAmount(opts.amountCents), currency, opts.status,
        text(opts.reason), text(opts.failureReason), JSON.stringify({ actorId: opts.actorId })],
    );

    const totals = await client.query<{ refunded: string; pending_count: string }>(
      `select coalesce(sum(amount) filter (where status = 'succeeded'), 0)::text as refunded,
              count(*) filter (where status in ('pending', 'requires_action'))::text as pending_count
         from app.appointment_refunds
        where appointment_payment_id = $1::uuid`,
      [row.payment_id],
    );
    const refundedCents = money(totals.rows[0]?.refunded);
    const paidCents = money(row.amount);
    const pendingCount = Number(totals.rows[0]?.pending_count || 0);
    const nextPaymentStatus = refundedCents >= paidCents
      ? "refunded"
      : refundedCents > 0
        ? "partially_refunded"
        : pendingCount > 0
          ? "processing"
          : "paid";
    fullyRefunded = nextPaymentStatus === "refunded";

    await client.query(
      `update app.appointment_payments
          set status = $2, refund_id = case when $3::text <> '' then $3 else refund_id end,
              refunded_amount = $4, refunded_at = case when $2 = 'refunded' then coalesce(refunded_at, now()) else refunded_at end,
              failure_message = case when $2 = 'paid' and $5::text <> '' then $5 else failure_message end,
              updated_at = now()
        where id = $1::uuid`,
      [row.payment_id, nextPaymentStatus, opts.stripeRefundId, centsToAmount(refundedCents), text(opts.failureReason)],
    );

    if (nextPaymentStatus === "refunded" && row.appointment_status !== "refunded") {
      const changed = await client.query<{ id: string }>(
        `update app.appointments
            set status = 'refunded', partner_profile_id = null,
                cancellation_reason = coalesce(nullif($2, ''), cancellation_reason),
                cancelled_at = coalesce(cancelled_at, now()), hold_expires_at = null, updated_at = now()
          where id = $1::uuid and status <> 'refunded'
          returning id::text`,
        [appointmentId, text(opts.reason)],
      );
      becameFullyRefunded = Boolean(changed.rows[0]);
      if (becameFullyRefunded) {
        await client.query(
          `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
           values ($1::uuid, 'deposit_refunded', $2, $3, $4::jsonb)`,
          [appointmentId, opts.actorType || "stripe", opts.actorId,
            JSON.stringify({ refundId: opts.stripeRefundId, reason: text(opts.reason), amount: centsToAmount(refundedCents), currency })],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (becameFullyRefunded) {
    await runNotificationTasks([
      sendAppointmentLifecycleWebhook(appointmentId, "appointment_refunded"),
      sendAppointmentRefundNotification({
        appointmentId,
        refundId: opts.stripeRefundId,
        reason: text(opts.reason) || "Appointment deposit refunded.",
        replacementFound: false,
      }),
    ]);
  }
  return { appointmentId, fullyRefunded, status: opts.status };
}
