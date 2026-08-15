import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStaffApplication } from "@/lib/staffAdmin";
import { deactivateInternalPartnerApplication } from "@/lib/publicStaffProvisioning";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Context = { params: Promise<{ applicationId: string }> };

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function DELETE(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    if (application.status === "deactivated") {
      return NextResponse.json({ ok: true, application, duplicate: true });
    }
    if (!application.provisionedAt) {
      return NextResponse.json(
        { ok: false, error: "This application does not have a provisioned staff account." },
        { status: 409 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (text(body.confirmation).toLowerCase() !== application.email.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "Enter the staff email exactly to confirm this removal." },
        { status: 400 },
      );
    }

    const result = await deactivateInternalPartnerApplication({
      applicationId,
      deactivatedBy: auth.user.id,
    });
    const updated = await getStaffApplication(applicationId);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Staff access was removed, but the updated application could not be loaded." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, application: updated, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Staff removal failed." },
      { status: 500 },
    );
  }
}
