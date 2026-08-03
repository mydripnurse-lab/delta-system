import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  completeStaffApplication,
  getStaffApplication,
  rejectStaffApplication,
  reviewStaffApplication,
  updateDepositCheckpoint,
  updateStaffApplicationNotes,
  updateStripeCheckpoint,
} from "@/lib/staffAdmin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ applicationId: string }> };

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load the application." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = text(body.action);
    let application;

    if (action === "review") {
      application = await reviewStaffApplication(applicationId, auth.user.id);
    } else if (action === "notes") {
      application = await updateStaffApplicationNotes(applicationId, text(body.notes));
    } else if (action === "stripe") {
      application = await updateStripeCheckpoint({
        applicationId,
        locationId: text(body.locationId),
        status: text(body.status) as "pending" | "complete" | "not_required",
        userId: auth.user.id,
      });
    } else if (action === "deposit") {
      application = await updateDepositCheckpoint({
        applicationId,
        locationId: text(body.locationId),
        status: text(body.status) as "pending" | "complete" | "not_required",
        percentage: Number(body.percentage ?? 30),
        policyUrl: text(body.policyUrl),
        message: text(body.message),
        userId: auth.user.id,
      });
    } else if (action === "reject") {
      application = await rejectStaffApplication(applicationId, text(body.notes));
    } else if (action === "complete") {
      application = await completeStaffApplication(applicationId);
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
    }

    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, application });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not update the application." },
      { status: 400 },
    );
  }
}
