import { NextResponse } from "next/server";

import { getAuthenticatedClient, isTrustedClientRequest } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { verifyMapboxAddress } from "@/lib/mapboxAddressVerification";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    mode?: "wellness_reference" | "medical_screening";
    screeningSelections?: string[];
    fullName?: string;
    phone?: string;
    dateOfBirth?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    county?: string;
    state?: string;
    postalCode?: string;
    countryCode?: string;
    addressFeatureId?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    weightPounds?: string | number;
    heightFeet?: string | number;
    heightInches?: string | number;
    genderIdentity?: string;
  } | null;
  if (body?.mode === "medical_screening") {
    const allowed = new Set(["chf", "hemophilia", "kidney-failure", "dialysis", "pah", "uncontrolled-bleeding", "consent-impairment", "fluid-buildup", "diuretic", "none"]);
    const selections = Array.isArray(body.screeningSelections)
      ? [...new Set(body.screeningSelections.map((value) => String(value || "").trim()).filter((value) => allowed.has(value)))]
      : [];
    if (!selections.length || selections.length !== body.screeningSelections.length || (selections.includes("none") && selections.length !== 1)) {
      return NextResponse.json({ ok: false, error: "Review every safety answer before saving." }, { status: 400 });
    }
    const updatedAt = new Date().toISOString();
    await getDbPool().query(
      `update app.client_accounts
          set preferences = preferences || jsonb_build_object('medicalScreening', jsonb_build_object(
            'selections', $2::jsonb, 'updatedAt', $3
          )), updated_at = now()
        where id = $1`,
      [account.id, JSON.stringify(selections), updatedAt],
    );
    return NextResponse.json({ ok: true, screeningSelections: selections, screeningUpdatedAt: updatedAt });
  }
  const wellnessReferenceOnly = body?.mode === "wellness_reference";
  const fullName = String(wellnessReferenceOnly ? account.fullName : body?.fullName || "").trim();
  const phone = String(wellnessReferenceOnly ? account.phone : body?.phone || "").trim();
  const dateOfBirth = String(wellnessReferenceOnly ? body?.dateOfBirth ?? account.dateOfBirth : body?.dateOfBirth || "").trim();
  const addressLine1 = String(body?.addressLine1 || "").trim();
  const addressLine2 = String(body?.addressLine2 || "").trim();
  const city = String(body?.city || "").trim();
  const county = String(body?.county || "").trim();
  const state = String(body?.state || "").trim();
  const postalCode = String(body?.postalCode || "").trim();
  const countryCode = String(wellnessReferenceOnly ? account.countryCode || "US" : body?.countryCode || "US").trim().toUpperCase();
  const addressFeatureId = String(body?.addressFeatureId || "").trim();
  const emergencyContactName = String(wellnessReferenceOnly ? account.emergencyContactName : body?.emergencyContactName || "").trim();
  const emergencyContactPhone = String(wellnessReferenceOnly ? account.emergencyContactPhone : body?.emergencyContactPhone || "").trim();
  const weightRaw = String(wellnessReferenceOnly && body?.weightPounds === undefined ? account.weightPounds ?? "" : body?.weightPounds ?? "").trim();
  const heightFeetRaw = String(wellnessReferenceOnly && body?.heightFeet === undefined ? account.heightInches ? Math.floor(account.heightInches / 12) : "" : body?.heightFeet ?? "").trim();
  const heightInchesRaw = String(wellnessReferenceOnly && body?.heightInches === undefined ? account.heightInches ? account.heightInches % 12 : "" : body?.heightInches ?? "").trim();
  const genderIdentity = String(wellnessReferenceOnly ? account.genderIdentity : body?.genderIdentity || "").trim();
  const weightPounds = weightRaw ? Number(weightRaw) : null;
  const heightFeet = heightFeetRaw ? Number(heightFeetRaw) : null;
  const heightInchesPart = heightInchesRaw ? Number(heightInchesRaw) : heightFeet !== null ? 0 : null;
  const totalHeightInches = heightFeet !== null && heightInchesPart !== null ? heightFeet * 12 + heightInchesPart : null;
  const allowedGenderIdentities = new Set(["female", "male", "non_binary", "intersex", "another_identity", "prefer_not_to_say"]);
  const wantsAddress = Boolean(addressLine1 || city || county || state || postalCode || addressFeatureId);
  const birthDateIsValid = !dateOfBirth || (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) && new Date(`${dateOfBirth}T12:00:00Z`).getTime() <= Date.now());
  if (
    !fullName || fullName.length > 120 || phone.length > 40 || !birthDateIsValid ||
    addressLine1.length > 180 || addressLine2.length > 120 || city.length > 100 || county.length > 100 ||
    state.length > 100 || postalCode.length > 20 || !/^[A-Z]{2}$/.test(countryCode) ||
    emergencyContactName.length > 120 || emergencyContactPhone.length > 40 ||
    (weightPounds !== null && (!Number.isFinite(weightPounds) || weightPounds < 1 || weightPounds > 1000)) ||
    (heightFeet !== null && (!Number.isInteger(heightFeet) || heightFeet < 1 || heightFeet > 8)) ||
    (heightInchesPart !== null && (!Number.isInteger(heightInchesPart) || heightInchesPart < 0 || heightInchesPart > 11)) ||
    Boolean(genderIdentity && !allowedGenderIdentities.has(genderIdentity)) ||
    (wantsAddress && !(addressLine1 && city && county && state && postalCode && addressFeatureId))
  ) {
    return NextResponse.json({ ok: false, error: "Enter valid profile information." }, { status: 400 });
  }
  let verifiedAddress: Awaited<ReturnType<typeof verifyMapboxAddress>> | null = null;
  if (wantsAddress) {
    const unchangedVerifiedAddress = account.addressVerified
      && account.addressFeatureId === addressFeatureId
      && account.addressLine1 === addressLine1
      && account.city === city
      && account.state === state
      && account.postalCode === postalCode
      && account.addressLongitude !== null
      && account.addressLatitude !== null;
    if (unchangedVerifiedAddress) {
      verifiedAddress = {
        addressLine1: account.addressLine1,
        city: account.city,
        county: account.county,
        state: account.state,
        postalCode: account.postalCode,
        countryCode: account.countryCode,
        mapboxFeatureId: account.addressFeatureId,
        verifiedLabel: account.addressVerifiedLabel,
        longitude: account.addressLongitude as number,
        latitude: account.addressLatitude as number,
      };
    } else {
      try {
        verifiedAddress = await verifyMapboxAddress({ addressLine1, city, state, postalCode, countryCode, selectedFeatureId: addressFeatureId });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          error: error instanceof Error ? error.message : "Choose a verified address from the suggestions.",
        }, { status: 422 });
      }
    }
  }
  const preferencePatch: Record<string, unknown> = {
    dateOfBirth,
    wellness: {
      weightPounds,
      heightInches: totalHeightInches,
      genderIdentity,
      updatedAt: new Date().toISOString(),
    },
    emergencyContact: { name: emergencyContactName, phone: emergencyContactPhone },
  };
  if (verifiedAddress) {
    preferencePatch.address = {
      addressLine1: verifiedAddress.addressLine1,
      addressLine2,
      city: verifiedAddress.city,
      county: verifiedAddress.county,
      state: verifiedAddress.state,
      postalCode: verifiedAddress.postalCode,
      countryCode: verifiedAddress.countryCode,
      verified: true,
      verificationProvider: "mapbox",
      mapboxFeatureId: verifiedAddress.mapboxFeatureId,
      verifiedLabel: verifiedAddress.verifiedLabel,
      longitude: verifiedAddress.longitude,
      latitude: verifiedAddress.latitude,
      verifiedAt: new Date().toISOString(),
    };
  }
  await getDbPool().query(
    `update app.client_accounts
        set full_name = $2,
            phone = $3,
            preferences = preferences || $4::jsonb,
            updated_at = now()
      where id = $1`,
    [account.id, fullName, phone, JSON.stringify(preferencePatch)],
  );
  return NextResponse.json({ ok: true, address: verifiedAddress });
}
