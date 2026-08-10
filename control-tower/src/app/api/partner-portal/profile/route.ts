import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import {
  getPartnerProfileForPortal,
  updatePartnerPortalProfile,
} from "@/lib/partnerProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
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

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  const profile = await getPartnerProfileForPortal(session.profile_id);
  if (!profile) return NextResponse.json({ ok: false, error: "Partner profile not found." }, { status: 404 });
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(request: Request) {
  if (!validRequestOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  try {
    const current = await getPartnerProfileForPortal(session.profile_id);
    if (!current) return NextResponse.json({ ok: false, error: "Partner profile not found." }, { status: 404 });
    const form = await request.formData();
    const publicTitle = clean(form.get("publicTitle"));
    const professionalCredentials = clean(form.get("professionalCredentials"));
    const biography = clean(form.get("biography"));
    const photo = form.get("profilePhoto");

    if (publicTitle.length < 2 || publicTitle.length > 100) {
      return NextResponse.json({ ok: false, error: "Professional title must contain 2–100 characters." }, { status: 400 });
    }
    if (professionalCredentials.length > 100) {
      return NextResponse.json({ ok: false, error: "Credentials must contain 100 characters or fewer." }, { status: 400 });
    }
    if (biography.length < 120 || biography.length > 700) {
      return NextResponse.json({ ok: false, error: "Biography must contain 120–700 characters." }, { status: 400 });
    }

    let uploaded: { url: string; fileId: string; locationId: string; data: string; contentType: string } | undefined;
    if (photo instanceof File && photo.size > 0) {
      if (!(photo.type === "image/jpeg" || photo.type === "image/png")) {
        return NextResponse.json({ ok: false, error: "Profile photo must be a JPG or PNG image." }, { status: 400 });
      }
      if (photo.size > 5 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: "Profile photo must be smaller than 5 MB." }, { status: 400 });
      }
      const data = Buffer.from(await photo.arrayBuffer()).toString("base64");
      uploaded = {
        url: `/api/public/partner-profile-photo/${current.id}`,
        fileId: "local-profile-photo",
        locationId: "",
        data,
        contentType: photo.type,
      };
    }

    const updated = await updatePartnerPortalProfile({
      profileId: current.id,
      publicTitle,
      professionalCredentials,
      biography,
      profilePhoto: uploaded,
    });
    if (!updated) return NextResponse.json({ ok: false, error: "Partner profile not found." }, { status: 404 });

    const profile = await getPartnerProfileForPortal(current.id);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to update Partner profile." },
      { status: 500 },
    );
  }
}
