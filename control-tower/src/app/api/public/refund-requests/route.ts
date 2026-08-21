import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedClientFromRequest } from "@/lib/clientPortalAuth";
import { getRefundRequestContext, submitRefundRequest } from "@/lib/appointmentRefundRequests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const account = await getAuthenticatedClientFromRequest(request);
    const context = await getRefundRequestContext(account);
    return NextResponse.json({ ok: true, ...context }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[refund requests] context failed", error);
    return NextResponse.json({ ok: false, error: "We could not load refund information right now." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const account = await getAuthenticatedClientFromRequest(request);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ ok: false, error: "Request details are required." }, { status: 400 });
    const result = await submitRefundRequest({
      account,
      appointmentId: body.appointmentId,
      appointmentReference: body.appointmentReference,
      email: body.email,
      phone: body.phone,
      reasonCode: body.reasonCode,
      details: body.details,
      sourceUrl: body.sourceUrl || request.headers.get("referer") || "",
    });
    return NextResponse.json({ ok: true, result }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[refund requests] submission failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "We could not submit this request." },
      { status: 400 },
    );
  }
}
