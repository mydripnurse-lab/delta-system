import { createHmac, timingSafeEqual } from "node:crypto";

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: "open" | "complete" | "expired" | null;
  payment_intent: string | null;
  amount_total: number | null;
  currency: string | null;
  livemode: boolean;
  metadata: Record<string, string> | null;
  client_reference_id: string | null;
};

function requiredEnvironment(name: "STRIPE_SECRET_KEY" | "STRIPE_WEBHOOK_SECRET") {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/**
 * Stripe is owned by the My Drip Nurse booking platform. Partner activation
 * must never ask an operator to connect a subaccount or touch HighLevel.
 */
export function isInternalStripeConfigured() {
  return Boolean(
    String(process.env.STRIPE_SECRET_KEY || "").trim() &&
      String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
  );
}

/** Prevents a test webhook from mutating live records (and vice versa). */
export function assertStripeEventMode(livemode: boolean) {
  const secretKey = requiredEnvironment("STRIPE_SECRET_KEY");
  const expectedLiveMode = secretKey.startsWith("sk_live_");
  const expectedTestMode = secretKey.startsWith("sk_test_");
  if (!expectedLiveMode && !expectedTestMode) {
    throw new Error("STRIPE_SECRET_KEY has an unsupported mode.");
  }
  if (livemode !== expectedLiveMode) {
    throw new Error(`Stripe event mode does not match the configured ${expectedLiveMode ? "live" : "test"} key.`);
  }
}

export async function createStripeCheckoutSession(opts: {
  appointmentId: string;
  publicReference: string;
  customerEmail: string;
  serviceName: string;
  amountCents: number;
  currency: string;
  calendarPublicKey: string;
  returnBaseUrl?: string;
  cancelUrl?: string;
}) {
  const secretKey = requiredEnvironment("STRIPE_SECRET_KEY");
  const bookingBaseUrl = String(opts.returnBaseUrl || process.env.BOOKING_PUBLIC_BASE_URL || "https://admin.mydripnurse.com")
    .trim()
    .replace(/\/+$/, "");
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("submit_type", "book");
  form.set("client_reference_id", opts.appointmentId);
  form.set("customer_email", opts.customerEmail);
  form.set("success_url", `${bookingBaseUrl}/booking/complete?appointment=${encodeURIComponent(opts.publicReference)}&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", opts.cancelUrl || `${bookingBaseUrl}/booking/${encodeURIComponent(opts.calendarPublicKey)}?payment=cancelled`);
  form.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", opts.currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(opts.amountCents));
  form.set("line_items[0][price_data][product_data][name]", `${opts.serviceName} appointment deposit`);
  form.set("metadata[appointmentId]", opts.appointmentId);
  form.set("metadata[publicReference]", opts.publicReference);
  form.set("payment_intent_data[metadata][appointmentId]", opts.appointmentId);
  form.set("payment_intent_data[metadata][publicReference]", opts.publicReference);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `mdn-appointment-${opts.appointmentId}`,
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Stripe Checkout failed with status ${response.status}.`);
  }
  return payload;
}

/**
 * Reads a Checkout Session server-side. The success return is not a trust
 * boundary by itself, so callers must verify payment_status before changing
 * the appointment state.
 */
export async function retrieveStripeCheckoutSession(sessionId: string) {
  const secretKey = requiredEnvironment("STRIPE_SECRET_KEY");
  const normalizedId = String(sessionId || "").trim();
  if (!/^cs_[A-Za-z0-9_]+$/.test(normalizedId)) throw new Error("Invalid Stripe Checkout session.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(normalizedId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const payload = await response.json() as StripeCheckoutSession & { error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `Stripe Checkout lookup failed with status ${response.status}.`);
  }
  return payload;
}

export async function refundStripePayment(opts: {
  appointmentId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  reason?: string;
}) {
  const secretKey = requiredEnvironment("STRIPE_SECRET_KEY");
  if (!opts.paymentIntentId) throw new Error("The Stripe payment intent is missing for this appointment.");
  if (!Number.isInteger(opts.amountCents) || opts.amountCents <= 0) throw new Error("The refund amount must be greater than zero.");
  const form = new URLSearchParams();
  form.set("payment_intent", opts.paymentIntentId);
  form.set("amount", String(opts.amountCents));
  form.set("reason", opts.reason === "duplicate" || opts.reason === "fraudulent" ? opts.reason : "requested_by_customer");
  form.set("metadata[appointmentId]", opts.appointmentId);
  form.set("metadata[adminReason]", String(opts.reason || "Appointment deposit refunded.").slice(0, 500));
  const response = await fetch("https://api.stripe.com/v1/refunds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `mdn-appointment-refund-${opts.appointmentId}`,
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    payment_intent?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.id || !["succeeded", "pending", "requires_action"].includes(payload.status || "")) {
    throw new Error(payload.error?.message || `Stripe refund failed with status ${response.status}.`);
  }
  const returnedCurrency = String(payload.currency || opts.currency).toUpperCase();
  if (Number(payload.amount || 0) !== opts.amountCents || returnedCurrency !== opts.currency.toUpperCase()) {
    throw new Error("Stripe refund amount or currency did not match the requested appointment refund.");
  }
  return {
    id: payload.id,
    status: (payload.status || "pending") as "succeeded" | "pending" | "requires_action",
    amountCents: Number(payload.amount),
    currency: returnedCurrency,
    paymentIntentId: payload.payment_intent || opts.paymentIntentId,
  };
}

export function verifyStripeWebhook(rawBody: string, signatureHeader: string) {
  const secret = requiredEnvironment("STRIPE_WEBHOOK_SECRET");
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!/^\d+$/.test(timestamp) || !signatures.length) throw new Error("Invalid Stripe signature header.");
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (ageSeconds > 300) throw new Error("Stripe signature timestamp is outside the allowed tolerance.");
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const valid = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!valid) throw new Error("Stripe signature verification failed.");
}
