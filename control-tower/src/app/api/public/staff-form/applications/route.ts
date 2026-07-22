import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  getStaffFormConfig,
  loadEligibleCounties,
  provisionStaffApplication,
  type StaffApplicationInput,
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

function passwordIsValid(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const formKey = s(body?.formKey);
    const input: StaffApplicationInput = {
      firstName: s(body?.firstName),
      lastName: s(body?.lastName),
      email: s(body?.email).toLowerCase(),
      phone: s(body?.phone),
      company: s(body?.company),
      password: s(body?.password) || `${randomBytes(18).toString("base64url")}Aa1!`,
      countyKeys: Array.isArray(body?.countyKeys) ? body.countyKeys.map(s).filter(Boolean) : [],
    };
    if (!input.firstName || !input.lastName || !/^\S+@\S+\.\S+$/.test(input.email) || !input.phone) {
      return NextResponse.json({ error: "Name, email and phone are required" }, { status: 400, headers: cors });
    }
    if (body?.password && !passwordIsValid(input.password)) {
      return NextResponse.json({ error: "Password must have 12+ characters, uppercase, lowercase, number and symbol" }, { status: 400, headers: cors });
    }
    if (!input.countyKeys.length || input.countyKeys.length > 25) {
      return NextResponse.json({ error: "Select between 1 and 25 counties" }, { status: 400, headers: cors });
    }
    const config = await getStaffFormConfig(formKey);
    const eligible = await loadEligibleCounties(config);
    const requested = new Set(input.countyKeys);
    const selected = eligible.filter((county) => requested.has(county.key));
    if (selected.length !== requested.size) {
      return NextResponse.json({ error: "One or more counties are invalid or no longer have a Location ID" }, { status: 400, headers: cors });
    }
    const result = await provisionStaffApplication({ config, input, selected });
    return NextResponse.json(result, { status: 201, headers: cors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create staff account" },
      { status: 500, headers: cors },
    );
  }
}
