import { NextResponse } from "next/server";
import {
  getStaffFormConfig,
  loadEligibleCounties,
  submitStaffApplication,
  type StaffApplicationInput,
  uploadInternalStaffProfilePhoto,
} from "@/lib/publicStaffProvisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const formData = isMultipart ? await req.formData() : null;
    const body = isMultipart
      ? Object.fromEntries(formData?.entries() || [])
      : await req.json();
    const formKey = s(body?.formKey);
    const submissionKey = s(body?.submissionKey);
    if (submissionKey && !/^[A-Za-z0-9_-]{16,128}$/.test(submissionKey)) {
      return NextResponse.json({ error: "Invalid submission key" }, { status: 400, headers: cors });
    }
    let countyKeys: string[] = [];
    if (isMultipart) {
      try {
        const parsed = JSON.parse(s(body?.countyKeys) || "[]");
        countyKeys = Array.isArray(parsed) ? parsed.map(s).filter(Boolean) : [];
      } catch {
        countyKeys = [];
      }
    } else {
      countyKeys = Array.isArray(body?.countyKeys) ? body.countyKeys.map(s).filter(Boolean) : [];
    }
    const consentAccepted = ["true", "1", "yes", "on"].includes(s(body?.profileConsent).toLowerCase());
    const input: StaffApplicationInput = {
      firstName: s(body?.firstName),
      lastName: s(body?.lastName),
      email: s(body?.email).toLowerCase(),
      phone: s(body?.phone),
      company: s(body?.company),
      publicTitle: s(body?.publicTitle),
      professionalCredentials: s(body?.professionalCredentials),
      biography: s(body?.biography),
      profilePhotoUrl: "",
      profilePhotoFileId: "",
      profilePhotoLocationId: "",
      profileConsentAt: consentAccepted ? new Date().toISOString() : "",
      password: "",
      countyKeys,
      primaryLocationId: s(body?.primaryLocationId),
      submissionKey,
      referralCode: s(body?.referralCode).toLowerCase(),
    };
    if (!input.firstName || !input.lastName || !/^\S+@\S+\.\S+$/.test(input.email) || !input.phone) {
      return NextResponse.json({ error: "Name, email and phone are required" }, { status: 400, headers: cors });
    }
    if (!input.countyKeys.length || input.countyKeys.length > 25) {
      return NextResponse.json({ error: "Select between 1 and 25 counties" }, { status: 400, headers: cors });
    }
    if (isMultipart) {
      if (!input.publicTitle || input.publicTitle.length > 100) {
        return NextResponse.json({ error: "A professional title of up to 100 characters is required" }, { status: 400, headers: cors });
      }
      if (input.professionalCredentials.length > 100) {
        return NextResponse.json({ error: "Professional credentials must be 100 characters or fewer" }, { status: 400, headers: cors });
      }
      if (input.biography.length < 120 || input.biography.length > 700) {
        return NextResponse.json({ error: "Biography must be between 120 and 700 characters" }, { status: 400, headers: cors });
      }
      if (!consentAccepted) {
        return NextResponse.json({ error: "Website profile consent is required" }, { status: 400, headers: cors });
      }
    }
    const config = await getStaffFormConfig(formKey);
    const eligible = await loadEligibleCounties(config);
    const requested = new Set(input.countyKeys);
    const selected = eligible.filter((county) => requested.has(county.key));
    if (selected.length !== requested.size) {
      return NextResponse.json({ error: "One or more counties are invalid or no longer have a Location ID" }, { status: 400, headers: cors });
    }
    if (!input.primaryLocationId && selected.length === 1) input.primaryLocationId = selected[0].locationId;
    if (!input.primaryLocationId || !selected.some((county) => county.locationId === input.primaryLocationId)) {
      return NextResponse.json({ error: "Choose a valid primary county from the selected coverage areas" }, { status: 400, headers: cors });
    }
    if (isMultipart) {
      const profilePhoto = formData?.get("profilePhoto");
      if (!(profilePhoto instanceof File) || !profilePhoto.size) {
        return NextResponse.json({ error: "A professional profile photo is required" }, { status: 400, headers: cors });
      }
      const uploaded = await uploadInternalStaffProfilePhoto({
        file: profilePhoto,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      input.profilePhotoUrl = uploaded.url;
      input.profilePhotoFileId = uploaded.fileId;
      input.profilePhotoLocationId = uploaded.locationId;
    }
    const result = await submitStaffApplication({ config, input, selected });
    return NextResponse.json(result, { status: 202, headers: cors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit partner application" },
      { status: 500, headers: cors },
    );
  }
}
