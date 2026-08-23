import { NextRequest, NextResponse } from "next/server";

import { refundAdminBookingAppointment } from "@/lib/adminBookingOperations";
import { completeRefundRequest, listAdminRefundRequests, updateRefundRequestReview } from "@/lib/appointmentRefundRequests";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "refunds" });
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, requests: await listAdminRefundRequests(auth.access.stateCodes) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[admin refund requests] list failed", error);
    return NextResponse.json({ ok: false, error: "Could not load refund requests." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "refunds" });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json().catch(() => null) as { requestId?: string; action?: string; note?: string } | null;
    if (!body?.requestId) return NextResponse.json({ ok: false, error: "Refund request is required." }, { status: 400 });
    const scopedItem = (await listAdminRefundRequests(auth.access.stateCodes)).find((requestItem) => requestItem.id === body.requestId);
    if (!scopedItem) return NextResponse.json({ ok: false, error: "Refund request not found." }, { status: 404 });
    if (body.action === "approve") {
      if (!String(body.note || "").trim()) return NextResponse.json({ ok: false, error: "Add the policy basis before approving the refund." }, { status: 400 });
      const item = scopedItem;
      if (!item) return NextResponse.json({ ok: false, error: "Refund request not found." }, { status: 404 });
      if (["duplicate_charge", "incorrect_charge"].includes(item.reasonCode)) {
        return NextResponse.json({ ok: false, error: "Charge disputes require manual Stripe payment verification before any refund is issued." }, { status: 400 });
      }
      if (!["paid", "partially_refunded"].includes(item.paymentStatus)) {
        return NextResponse.json({ ok: false, error: "This appointment does not have a refundable paid deposit." }, { status: 400 });
      }
      await updateRefundRequestReview({ requestId: body.requestId, status: "approved", adminUserId: auth.user.id, note: body.note });
      const refund = await refundAdminBookingAppointment({
        appointmentId: item.appointmentId,
        reason: body.note,
        adminUserId: auth.user.id,
      });
      await completeRefundRequest(body.requestId, auth.user.id, body.note);
      return NextResponse.json({ ok: true, refund });
    }
    if (body.action === "review") {
      const result = await updateRefundRequestReview({ requestId: body.requestId, status: "under_review", adminUserId: auth.user.id, note: body.note });
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "decline") {
      if (!String(body.note || "").trim()) return NextResponse.json({ ok: false, error: "Add the policy-based reason before declining." }, { status: 400 });
      const result = await updateRefundRequestReview({ requestId: body.requestId, status: "declined", adminUserId: auth.user.id, note: body.note });
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ ok: false, error: "Choose a valid review action." }, { status: 400 });
  } catch (error) {
    console.error("[admin refund requests] update failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not update this request." }, { status: 400 });
  }
}
