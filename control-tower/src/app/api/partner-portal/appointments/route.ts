import { NextResponse } from "next/server";

import { advancePartnerAppointment, declinePartnerAppointment, getPartnerPortalDashboard, listPartnerPortalAppointments, reschedulePartnerAppointment } from "@/lib/partnerAppointments";
import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ ok: true, appointments: await listPartnerPortalAppointments(session.profile_id), dashboard: await getPartnerPortalDashboard(session.profile_id) });
}

function validRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "mydripnurse.com" || hostname.endsWith(".mydripnurse.com");
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  if (!validRequestOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const appointmentId = String(body?.appointmentId || "").trim();
    const action = String(body?.action || "") as "acknowledge" | "decline" | "start" | "complete" | "reschedule";
    if (!/^[0-9a-f-]{36}$/i.test(appointmentId) || !["acknowledge", "decline", "start", "complete", "reschedule"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid appointment action." }, { status: 400 });
    }
    if (action === "reschedule") {
      const reason = String(body?.reason || "").trim();
      if (reason.length > 1000) {
        return NextResponse.json({ ok: false, error: "The reschedule reason is too long." }, { status: 400 });
      }
      const appointments = await reschedulePartnerAppointment({
        profileId: session.profile_id,
        appointmentId,
        newDate: String(body?.newDate || "").trim(),
        newTime: String(body?.newTime || "").trim(),
        timezone: String(body?.timezone || "").trim(),
        reason,
      });
      return NextResponse.json({ ok: true, appointments, dashboard: await getPartnerPortalDashboard(session.profile_id) });
    }
    if (action === "decline") {
      const result = await declinePartnerAppointment({ profileId: session.profile_id, appointmentId, reason: String(body?.reason || "") });
      const message = result.outcome === "reassigned"
        ? `The appointment was sent to ${result.replacementPartnerName || "another available Partner"}.`
        : result.outcome === "refunded"
          ? "No alternate Partner was available. The client deposit was refunded automatically."
          : result.outcome === "refund_pending"
            ? "No alternate Partner was available. The client deposit refund is processing with Stripe."
          : "The appointment was cancelled because no paid deposit was found.";
      return NextResponse.json({ ok: true, appointments: result.appointments, dashboard: await getPartnerPortalDashboard(session.profile_id), outcome: result.outcome, message });
    }
    const earlyStartReason = String(body?.earlyStartReason || "").trim();
    if (action === "start" && earlyStartReason.length > 1000) {
      return NextResponse.json({ ok: false, error: "The early-start reason is too long." }, { status: 400 });
    }
    const appointments = await advancePartnerAppointment({ profileId: session.profile_id, appointmentId, action, earlyStartReason });
    return NextResponse.json({ ok: true, appointments, dashboard: await getPartnerPortalDashboard(session.profile_id) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update the appointment." },
      { status: 409 },
    );
  }
}
