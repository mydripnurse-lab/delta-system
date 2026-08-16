import { NextResponse } from "next/server";
import { z } from "zod";

import { getPublicAppointmentConfirmation } from "@/lib/publicAppointmentConfirmation";
import { reconcileStripeCheckoutSession } from "@/lib/stripeBookingReconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const requestSchema = z.object({
  appointment: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().regex(/^cs_[A-Za-z0-9_]+$/).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    if (input.sessionId) {
      const result = await reconcileStripeCheckoutSession(input.sessionId);
      if (!result.confirmed) {
        return NextResponse.json(
          { ok: false, pending: true, error: "Your payment is still processing." },
          { status: 409, headers: { ...cors, "Cache-Control": "no-store" } },
        );
      }
    }

    const confirmation = await getPublicAppointmentConfirmation(input.appointment);
    if (!confirmation) {
      return NextResponse.json(
        { ok: false, error: "The appointment confirmation could not be found." },
        { status: 404, headers: { ...cors, "Cache-Control": "no-store" } },
      );
    }
    const confirmed = confirmation.status === "confirmed"
      || confirmation.status === "accepted"
      || confirmation.status === "assigned"
      || confirmation.status === "in_progress"
      || confirmation.status === "completed";
    if (!confirmed) {
      return NextResponse.json(
        { ok: false, pending: true, error: "Your appointment is still being confirmed." },
        { status: 409, headers: { ...cors, "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, confirmation },
      { headers: { ...cors, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid checkout confirmation." }, { status: 400, headers: cors });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Checkout confirmation failed." },
      { status: 400, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }
}
