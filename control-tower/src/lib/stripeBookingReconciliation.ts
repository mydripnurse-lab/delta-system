import { assertStripeEventMode, retrieveStripeCheckoutSession } from "@/lib/stripeCheckout";
import { confirmStripeCheckoutPayment } from "@/lib/stripePaymentLifecycle";

/**
 * Closes the short browser-return timing gap. The same transactional service
 * is used by the signed webhook, so only one caller can confirm and notify.
 */
export async function reconcileStripeCheckoutSession(sessionId: string) {
  const session = await retrieveStripeCheckoutSession(sessionId);
  assertStripeEventMode(session.livemode);
  if (session.payment_status !== "paid") return { confirmed: false, appointmentId: "" };

  const appointmentId = String(session.client_reference_id || session.metadata?.appointmentId || "").trim();
  if (!appointmentId) throw new Error("Stripe session is missing the appointment reference.");
  if (session.amount_total == null || !session.currency) {
    throw new Error("Stripe session is missing the verified payment total.");
  }
  return confirmStripeCheckoutPayment({
    appointmentId,
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
    amountTotalCents: session.amount_total,
    currency: session.currency,
    source: "checkout_return",
    actorId: session.id,
  });
}
