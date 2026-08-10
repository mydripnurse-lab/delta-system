import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  listAdminAppointmentCandidates,
  reassignAdminBookingAppointment,
  refundAdminBookingAppointment,
} from "@/lib/adminBookingOperations";
import { listAdminBookingAppointments } from "@/lib/adminBookingAppointments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ appointmentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const { appointmentId } = await context.params;
    const appointments = await listAdminBookingAppointments({ search: appointmentId, limit: 5 });
    const appointment = appointments.find((item) => item.id === appointmentId) || null;
    if (!appointment) return NextResponse.json({ ok: false, error: "Appointment not found." }, { status: 404 });
    const candidates = await listAdminAppointmentCandidates(appointmentId);
    return NextResponse.json({ ok: true, appointment, candidates }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin appointment detail] failed to load appointment", error);
    return NextResponse.json({ ok: false, error: "Could not load appointment details." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const { appointmentId } = await context.params;
    const body = await request.json() as { action?: string; partnerProfileId?: string; reason?: string };
    if (body.action === "reassign") {
      if (!body.partnerProfileId) return NextResponse.json({ ok: false, error: "Choose a Partner before reassigning." }, { status: 400 });
      const result = await reassignAdminBookingAppointment({
        appointmentId,
        partnerProfileId: body.partnerProfileId,
        reason: body.reason || "Admin reassigned the appointment.",
        adminUserId: auth.user.id,
      });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "refund") {
      const result = await refundAdminBookingAppointment({
        appointmentId,
        reason: body.reason || "Admin requested a customer deposit refund.",
        adminUserId: auth.user.id,
      });
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ ok: false, error: "Unsupported appointment action." }, { status: 400 });
  } catch (error) {
    console.error("[partner-admin appointment detail] failed to update appointment", error);
    return NextResponse.json({ ok: false, error: "Could not update this appointment." }, { status: 400 });
  }
}
