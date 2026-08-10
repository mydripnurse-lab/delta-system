import { NextResponse } from "next/server";

import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { getDbPool } from "@/lib/db";
import { verifyStripeWebhook } from "@/lib/stripeCheckout";
import { sendPartnerAppointmentNotification } from "@/lib/partnerAppointmentNotifications";
import { sendCustomerAppointmentNotification } from "@/lib/customerAppointmentNotifications";
import { recordPartnerAffiliateCommission } from "@/lib/partnerAffiliate";

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
      payment_intent?: string | null;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
    };
  };
};

function appointmentId(event: StripeEvent) {
  return String(event.data.object.metadata?.appointmentId || event.data.object.client_reference_id || "").trim();
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
  const pool = getDbPool();
  const id = appointmentId(event);
  if (!id) return "ignored" as const;
  const object = event.data.object;
  if (
    ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)
    && object.payment_status === "paid"
  ) {
    const client = await pool.connect();
    let appointmentConfirmed = false;
    try {
      await client.query("begin");
      const updated = await client.query<{ id: string }>(
        `update app.appointments
            set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), hold_expires_at = null
          where id = $1 and status = 'payment_pending'
          returning id`,
        [id],
      );
      await client.query(
        `update app.appointment_payments
            set status = 'paid', checkout_session_id = coalesce(checkout_session_id, $2),
                payment_intent_id = coalesce(payment_intent_id, $3), paid_at = coalesce(paid_at, now()),
                updated_at = now()
          where appointment_id = $1`,
        [id, object.id || null, object.payment_intent || null],
      );
      if (updated.rows[0]) {
        appointmentConfirmed = true;
        await client.query(
          `insert into app.appointment_events (appointment_id, event_type, actor_type, actor_id)
           values ($1, 'deposit_paid', 'stripe', $2)`,
          [id, event.id],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    if (appointmentConfirmed) {
      void recordPartnerAffiliateCommission(id).catch(() => undefined);
      await sendPartnerAppointmentNotification(id, "confirmed");
      await sendCustomerAppointmentNotification(id, "confirmed");
    }
    return "processed" as const;
  }
  if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
    const failure = event.type === "checkout.session.expired" ? "Stripe Checkout expired." : "Stripe payment failed.";
    await Promise.all([
      pool.query(
        `update app.appointments
            set status = 'failed', cancellation_reason = $2, hold_expires_at = null
          where id = $1 and status = 'payment_pending'`,
        [id, failure],
      ),
      pool.query(
        `update app.appointment_payments
            set status = 'failed', failure_message = $2, updated_at = now()
          where appointment_id = $1 and status in ('pending', 'processing')`,
        [id, failure],
      ),
    ]);
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
    if (!event.id || !event.type) throw new Error("Invalid Stripe event.");
  } catch {
    return NextResponse.json({ error: "Invalid Stripe payload." }, { status: 400 });
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
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
