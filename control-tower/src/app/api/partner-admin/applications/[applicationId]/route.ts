import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { setPartnerWebsiteVisibility } from "@/lib/publicStaffProvisioning";
import {
  completeStaffApplication,
  deleteStaffApplicationRecord,
  getStaffApplication,
  rejectStaffApplication,
  reviewStaffApplication,
  updateStaffApplicationNotes,
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
    const targetRaw = text(body.target);
    const target = targetRaw === "website" || targetRaw === "directory" || targetRaw === "both" ? targetRaw : "both";
    const existing = await getStaffApplication(applicationId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    let application;

    if (action === "review") {
      application = await reviewStaffApplication(applicationId, auth.user.id);
    } else if (action === "notes") {
      application = await updateStaffApplicationNotes(applicationId, text(body.notes));
    } else if (action === "publish_website" || action === "republish_website") {
      await setPartnerWebsiteVisibility({
        applicationId,
        action: action === "publish_website" ? "publish" : "republish",
        target,
      });
      application = await getStaffApplication(applicationId);
    } else if (action === "hide_website") {
      await setPartnerWebsiteVisibility({ applicationId, action: "hide", target });
      application = await getStaffApplication(applicationId);
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

export async function DELETE(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const deleted = await deleteStaffApplicationRecord({
      applicationId,
      confirmationEmail: text(body.confirmationEmail),
      allowProvisionedPartner: body.deleteProvisionedPartner === true,
    });
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete the application.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: /not found/i.test(message) ? 404 : 400 },
    );
  }
}
