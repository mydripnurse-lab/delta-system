import { NextResponse } from "next/server";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { assertStripeEventMode, verifyStripeWebhook } from "@/lib/stripeCheckout";
import {
  applyStripeRefundUpdate,
  confirmStripeCheckoutPayment,
  failStripePayment,
  markStripeCheckoutProcessing,
} from "@/lib/stripePaymentLifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeEvent = {
  id: string;
  type: string;
  livemode: boolean;
  data: {
    object: {
      id?: string;
      payment_status?: string;
      status?: string;
      payment_intent?: string | null;
      client_reference_id?: string | null;
      amount_total?: number | null;
      amount?: number | null;
      currency?: string | null;
      reason?: string | null;
      failure_reason?: string | null;
      last_payment_error?: { code?: string | null; message?: string | null } | null;
      metadata?: Record<string, string> | null;
    };
  };
};

function appointmentId(event: StripeEvent) {
  return String(event.data.object.metadata?.appointmentId || event.data.object.client_reference_id || "").trim();
}

function requiredCheckoutTotals(event: StripeEvent) {
  const amount = event.data.object.amount_total;
  const currency = String(event.data.object.currency || "").trim();
  if (!Number.isInteger(amount) || Number(amount) < 0 || !currency) {
    throw new Error("Stripe Checkout event is missing its verified amount or currency.");
  }
  return { amountTotalCents: Number(amount), currency };
}

async function claimEvent(event: StripeEvent) {
  const pool = getDbPool();
  const inserted = await pool.query<{ status: string }>(
    `insert into app.stripe_webhook_events (event_id, event_type, livemode)
     values ($1, $2, $3)
     on conflict (event_id) do nothing
     returning status`,
    [event.id, event.type, event.livemode],
  );
  if (inserted.rows[0]) return true;
  const existing = await pool.query<{ status: string }>(
    `select status from app.stripe_webhook_events where event_id = $1`,
    [event.id],
  );
  if (existing.rows[0]?.status !== "failed") return false;
  await pool.query(
    `update app.stripe_webhook_events
        set status = 'processing', error = '', processed_at = null
      where event_id = $1`,
    [event.id],
  );
  return true;
}

async function processStripeEvent(event: StripeEvent) {
  const object = event.data.object;
  const id = appointmentId(event);

  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
    if (!id || !object.id) throw new Error("Stripe Checkout event is missing its appointment reference.");
    const totals = requiredCheckoutTotals(event);
    if (object.payment_status === "paid") {
      await confirmStripeCheckoutPayment({
        appointmentId: id,
        sessionId: object.id,
        paymentIntentId: object.payment_intent,
        ...totals,
        source: "stripe_webhook",
        actorId: event.id,
      });
    } else {
      await markStripeCheckoutProcessing({
        appointmentId: id,
        sessionId: object.id,
        paymentIntentId: object.payment_intent,
        ...totals,
      });
    }
    return "processed" as const;
  }

  if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
    await failStripePayment({
      appointmentId: id || undefined,
      sessionId: object.id,
      paymentIntentId: object.payment_intent || undefined,
      failureCode: event.type === "checkout.session.expired" ? "checkout_expired" : "async_payment_failed",
      failureMessage: event.type === "checkout.session.expired" ? "Stripe Checkout expired." : "Stripe payment failed.",
      actorId: event.id,
    });
    return "processed" as const;
  }

  if (event.type === "payment_intent.payment_failed") {
    await failStripePayment({
      appointmentId: id || undefined,
      paymentIntentId: object.id,
      failureCode: String(object.last_payment_error?.code || "payment_failed"),
      failureMessage: String(object.last_payment_error?.message || "Stripe payment failed."),
      actorId: event.id,
    });
    return "processed" as const;
  }

  if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
    const status = String(object.status || (event.type === "refund.failed" ? "failed" : ""));
    if (!["pending", "requires_action", "succeeded", "failed", "canceled"].includes(status)) return "ignored" as const;
    if (!object.id || !object.payment_intent || !Number.isInteger(object.amount) || !object.currency) {
      throw new Error("Stripe refund event is incomplete.");
    }
    await applyStripeRefundUpdate({
      stripeRefundId: object.id,
      paymentIntentId: object.payment_intent,
      amountCents: Number(object.amount),
      currency: object.currency,
      status: status as "pending" | "requires_action" | "succeeded" | "failed" | "canceled",
      reason: object.metadata?.adminReason || object.reason || "Appointment deposit refunded.",
      failureReason: object.failure_reason || "",
      actorId: event.id,
    });
    return "processed" as const;
  }
  return "ignored" as const;
}

export async function POST(request: Request) {
  await ensureBookingEngineSchema();
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  try {
    verifyStripeWebhook(rawBody, signature);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe signature." },
      { status: 400 },
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
    if (!event.id || !event.type || typeof event.livemode !== "boolean") throw new Error("Invalid Stripe event.");
    assertStripeEventMode(event.livemode);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe payload." },
      { status: 400 },
    );
  }

  const claimed = await claimEvent(event);
  if (!claimed) return NextResponse.json({ received: true, duplicate: true });
  try {
    const status = await processStripeEvent(event);
    await getDbPool().query(
      `update app.stripe_webhook_events
          set status = $2, processed_at = now(), error = ''
        where event_id = $1`,
      [event.id, status],
    );
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    await getDbPool().query(
      `update app.stripe_webhook_events set status = 'failed', error = $2 where event_id = $1`,
      [event.id, message],
    );
    console.error("Stripe webhook processing failed", { eventId: event.id, eventType: event.type, message });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
