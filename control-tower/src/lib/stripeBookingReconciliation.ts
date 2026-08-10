import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { recordPartnerAffiliateCommission } from "@/lib/partnerAffiliate";
import { sendPartnerAppointmentNotification } from "@/lib/partnerAppointmentNotifications";
import { sendCustomerAppointmentNotification } from "@/lib/customerAppointmentNotifications";
import { retrieveStripeCheckoutSession } from "@/lib/stripeCheckout";

/**
 * Reconciles the browser return from Stripe. Stripe webhooks remain enabled,
 * but this closes the small timing gap where a paid appointment is not yet
 * visible in the Partner portal when the customer returns to the site.
 */
export async function reconcileStripeCheckoutSession(sessionId: string) {
  await ensureBookingEngineSchema();
  const session = await retrieveStripeCheckoutSession(sessionId);
  if (session.payment_status !== "paid") return { confirmed: false, appointmentId: "" };

  const appointmentId = String(session.client_reference_id || session.metadata?.appointmentId || "").trim();
  if (!appointmentId) throw new Error("Stripe session is missing the appointment reference.");

  const pool = getDbPool();
  const client = await pool.connect();
  let confirmed = false;
  try {
    await client.query("begin");
    const updated = await client.query<{ id: string }>(
      `update app.appointments
          set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), hold_expires_at = null
        where id = $1::uuid and status = 'payment_pending'
        returning id`,
      [appointmentId],
    );
    await client.query(
      `update app.appointment_payments
          set status = 'paid', checkout_session_id = coalesce(checkout_session_id, $2),
              payment_intent_id = coalesce(payment_intent_id, $3), paid_at = coalesce(paid_at, now()),
              updated_at = now()
        where appointment_id = $1::uuid`,
      [appointmentId, session.id, session.payment_intent || null],
    );
    if (updated.rows[0]) {
      confirmed = true;
      await client.query(
        `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id, payload)
         values ($1::uuid, 'deposit_paid', 'stripe', $2, $3::jsonb)`,
        [appointmentId, session.id, JSON.stringify({ source: "checkout_return" })],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (confirmed) {
    void recordPartnerAffiliateCommission(appointmentId).catch(() => undefined);
    void sendPartnerAppointmentNotification(appointmentId, "confirmed").catch(() => undefined);
    void sendCustomerAppointmentNotification(appointmentId, "confirmed").catch(() => undefined);
  }
  return { confirmed, appointmentId };
}
