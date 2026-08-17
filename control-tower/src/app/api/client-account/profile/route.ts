import { NextResponse } from "next/server";

import { getAuthenticatedClient, isTrustedClientRequest } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { isGenderIdentity } from "@/lib/genderIdentity";

export const runtime = "nodejs";

type ProfileMode =
  | "personal_details"
  | "wellness_details"
  | "emergency_contact"
  | "wellness_reference"
  | "medical_screening";

export async function PATCH(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    mode?: ProfileMode;
    screeningSelections?: string[];
    fullName?: string;
    dateOfBirth?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    weightPounds?: string | number;
    heightFeet?: string | number;
    heightInches?: string | number;
    genderIdentity?: string;
  } | null;
  const pool = getDbPool();

  if (body?.mode === "medical_screening") {
    const raw = Array.isArray(body.screeningSelections) ? body.screeningSelections : [];
    const allowed = new Set([
      "chf", "hemophilia", "kidney-failure", "dialysis", "pah", "uncontrolled-bleeding",
      "consent-impairment", "fluid-buildup", "diuretic", "none",
    ]);
    const selections = [...new Set(raw.map((value) => String(value || "").trim()).filter((value) => allowed.has(value)))];
    if (!selections.length) {
      return NextResponse.json({
        ok: false,
        error: "Select every condition that applies, or choose ‘None of these apply to me’.",
      }, { status: 400 });
    }
    if (selections.length !== raw.length || (selections.includes("none") && selections.length !== 1)) {
      return NextResponse.json({ ok: false, error: "Review the safety answers before saving." }, { status: 400 });
    }
    const updatedAt = new Date().toISOString();
    await pool.query(
      `update app.client_accounts
          set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{medicalScreening}', $2::jsonb, true),
              updated_at = now()
        where id = $1`,
      [account.id, JSON.stringify({ selections, updatedAt })],
    );
    return NextResponse.json({ ok: true, screeningSelections: selections, screeningUpdatedAt: updatedAt });
  }

  if (body?.mode === "personal_details") {
    const fullName = String(body.fullName || "").trim();
    const dateOfBirth = String(body.dateOfBirth || "").trim();
    const birthDateIsValid = !dateOfBirth || (
      /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      && new Date(`${dateOfBirth}T12:00:00Z`).getTime() <= Date.now()
    );
    if (!fullName || fullName.length > 120 || !birthDateIsValid) {
      return NextResponse.json({ ok: false, error: "Enter a valid name and date of birth." }, { status: 400 });
    }
    await pool.query(
      `update app.client_accounts
          set full_name = $2,
              preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{dateOfBirth}', to_jsonb($3::text), true),
              updated_at = now()
        where id = $1`,
      [account.id, fullName, dateOfBirth],
    );
    return NextResponse.json({ ok: true });
  }

  if (body?.mode === "wellness_details" || body?.mode === "wellness_reference") {
    const weightRaw = String(body.weightPounds ?? "").trim();
    const feetRaw = String(body.heightFeet ?? "").trim();
    const inchesRaw = String(body.heightInches ?? "").trim();
    const genderIdentity = String(body.genderIdentity || "").trim();
    const weightPounds = weightRaw ? Number(weightRaw) : null;
    const heightFeet = feetRaw ? Number(feetRaw) : null;
    const heightInchesPart = inchesRaw ? Number(inchesRaw) : heightFeet !== null ? 0 : null;
    if (
      (weightPounds !== null && (!Number.isFinite(weightPounds) || weightPounds < 1 || weightPounds > 1000))
      || (heightFeet !== null && (!Number.isInteger(heightFeet) || heightFeet < 1 || heightFeet > 8))
      || (heightInchesPart !== null && (!Number.isInteger(heightInchesPart) || heightInchesPart < 0 || heightInchesPart > 11))
      || Boolean(genderIdentity && !isGenderIdentity(genderIdentity))
    ) {
      return NextResponse.json({ ok: false, error: "Enter valid wellness details." }, { status: 400 });
    }
    const heightInches = heightFeet !== null && heightInchesPart !== null ? heightFeet * 12 + heightInchesPart : null;
    await pool.query(
      `update app.client_accounts
          set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{wellness}', $2::jsonb, true),
              updated_at = now()
        where id = $1`,
      [account.id, JSON.stringify({ weightPounds, heightInches, genderIdentity, updatedAt: new Date().toISOString() })],
    );
    return NextResponse.json({ ok: true });
  }

  if (body?.mode === "emergency_contact") {
    const name = String(body.emergencyContactName || "").trim();
    const phone = String(body.emergencyContactPhone || "").trim();
    if (name.length > 120 || phone.length > 40 || Boolean(name) !== Boolean(phone)) {
      return NextResponse.json({
        ok: false,
        error: "Enter both the emergency contact name and phone, or leave both blank.",
      }, { status: 400 });
    }
    await pool.query(
      `update app.client_accounts
          set preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{emergencyContact}', $2::jsonb, true),
              updated_at = now()
        where id = $1`,
      [account.id, JSON.stringify({ name, phone })],
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Choose a profile section to save." }, { status: 400 });
}
