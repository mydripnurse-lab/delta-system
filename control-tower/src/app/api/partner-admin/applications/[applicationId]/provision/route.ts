import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStaffApplication } from "@/lib/staffAdmin";
import {
  buildStaffPassword,
  getStaffFormConfigForTenant,
  provisionStaffApplication,
} from "@/lib/publicStaffProvisioning";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ applicationId: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    if (
      [
        "completed",
        "rejected",
        "staff_processing",
        "staff_created",
        "calendar_deposit_pending",
        "ready_to_complete",
      ].includes(application.status)
    ) {
      return NextResponse.json(
        { ok: false, error: `This application cannot be provisioned while it is ${application.status}.` },
        { status: 409 },
      );
    }
    if (!application.reviewedAt) {
      return NextResponse.json({ ok: false, error: "Review this application first." }, { status: 409 });
    }
    if (!application.locations.length) {
      return NextResponse.json({ ok: false, error: "This application has no requested locations." }, { status: 409 });
    }
    const missingStripe = application.locations.filter(
      (location) => !["complete", "not_required"].includes(location.stripeStatus),
    );
    if (missingStripe.length) {
      return NextResponse.json(
        { ok: false, error: "Mark Stripe complete for every requested location before creating the staff account." },
        { status: 409 },
      );
    }

    const config = await getStaffFormConfigForTenant(application.organizationId);
    const result = await provisionStaffApplication({
      config,
      applicationId,
      input: {
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        company: application.company,
        password: buildStaffPassword(application.firstName, application.lastName),
        countyKeys: [],
      },
      selected: application.locations.map((location) => ({
        key: location.locationId,
        state: location.state,
        county: location.county,
        locationId: location.locationId,
      })),
    });
    const updated = await getStaffApplication(applicationId);
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Staff provisioning finished, but the updated application could not be loaded." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, application: updated, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Staff provisioning failed." },
      { status: 500 },
    );
  }
}
