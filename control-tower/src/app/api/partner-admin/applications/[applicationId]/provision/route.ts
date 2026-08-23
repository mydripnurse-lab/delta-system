import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStaffApplication } from "@/lib/staffAdmin";
import {
  buildStaffPassword,
  getStaffFormConfigForTenant,
  provisionInternalPartnerApplication,
} from "@/lib/publicStaffProvisioning";
import { isInternalStripeConfigured } from "@/lib/stripeCheckout";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ applicationId: string }> };

export async function POST(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req, { module: "applications", ownerOnly: true });
  if ("response" in auth) return auth.response;

  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    if (["completed", "completed_with_warnings", "rejected", "staff_processing", "staff_created", "website_review_pending", "calendar_deposit_pending", "ready_to_complete", "deactivated"].includes(application.status)) {
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
    if (!isInternalStripeConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Platform Stripe is not configured. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to the production environment before activating Partners." },
        { status: 503 },
      );
    }

    const config = await getStaffFormConfigForTenant(application.organizationId);
    const result = await provisionInternalPartnerApplication({
      config,
      applicationId,
      input: {
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        company: application.company,
        publicTitle: String(application.requestPayload.publicTitle ?? "").trim(),
        professionalCredentials: String(application.requestPayload.professionalCredentials ?? "").trim(),
        biography: String(application.requestPayload.biography ?? "").trim(),
        profilePhotoUrl: String(application.requestPayload.profilePhotoUrl ?? "").trim(),
        profilePhotoFileId: String(application.requestPayload.profilePhotoFileId ?? "").trim(),
        profilePhotoLocationId: String(application.requestPayload.profilePhotoLocationId ?? "").trim(),
        profileConsentAt: String(application.requestPayload.profileConsentAt ?? "").trim(),
        password: buildStaffPassword(application.firstName, application.lastName),
        countyKeys: [],
        primaryLocationId: String(application.requestPayload.primaryLocationId ?? application.locations[0]?.locationId ?? "").trim(),
      },
      selected: application.locations.map((location) => ({
        key: location.locationId,
        state: location.state,
        county: location.county,
        locationId: location.locationId,
        operational: !location.locationId.startsWith("catalog:"),
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
