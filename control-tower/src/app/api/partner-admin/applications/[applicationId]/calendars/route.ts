import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStaffApplication, staffApplicationMatchesStateScope } from "@/lib/staffAdmin";
import {
  listPartnerServiceAssignments,
  setPartnerServiceAssignment,
  setPartnerServicePriceOverride,
} from "@/lib/partnerServiceAssignments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ applicationId: string }> };

function message(error: unknown) {
  return error instanceof Error ? error.message : "The calendar request failed.";
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req, { module: "applications" });
  if ("response" in auth) return auth.response;
  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application || !staffApplicationMatchesStateScope(application, auth.access.stateCodes)) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    const matrix = await listPartnerServiceAssignments(applicationId);
    return NextResponse.json({ ok: true, matrix }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const errorMessage = message(error);
    return NextResponse.json({ ok: false, error: errorMessage }, { status: /not found/i.test(errorMessage) ? 404 : 500 });
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req, { module: "applications", ownerOnly: true });
  if ("response" in auth) return auth.response;
  try {
    const { applicationId } = await context.params;
    const body = await req.json();
    const normalizedName = String(body?.normalizedName || "").trim();
    if (!normalizedName) {
      return NextResponse.json({ ok: false, error: "Calendar service is required." }, { status: 400 });
    }
    if (Object.prototype.hasOwnProperty.call(body || {}, "priceOverride")) {
      const priceOverride = body.priceOverride === null || body.priceOverride === ""
        ? null
        : Number(body.priceOverride);
      if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride < 0)) {
        return NextResponse.json({ ok: false, error: "Partner price must be zero or greater." }, { status: 400 });
      }
      const matrix = await setPartnerServicePriceOverride({ applicationId, serviceKey: normalizedName, priceOverride });
      return NextResponse.json({ ok: true, result: { priceOverride, matrix } });
    }
    if (typeof body?.active !== "boolean") {
      return NextResponse.json({ ok: false, error: "Calendar active state is required." }, { status: 400 });
    }
    const matrix = await setPartnerServiceAssignment({
      applicationId,
      serviceKey: normalizedName,
      active: body.active,
    });
    return NextResponse.json({ ok: true, result: { selected: body.active, appliedToGhl: false, matrix } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 400 });
  }
}
