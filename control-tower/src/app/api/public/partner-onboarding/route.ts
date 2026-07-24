import { NextRequest, NextResponse } from "next/server";
import { readPartnerOnboardingToken } from "@/lib/partnerOnboarding";

const SECURITY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: SECURITY_HEADERS });
}

export async function GET(request: NextRequest) {
  const token = String(request.nextUrl.searchParams.get("token") || "").trim();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "missing_token" },
      { status: 400, headers: SECURITY_HEADERS },
    );
  }

  try {
    const onboarding = await readPartnerOnboardingToken(token);
    if (!onboarding) {
      return NextResponse.json(
        { ok: false, error: "invalid_or_expired_token" },
        { status: 404, headers: SECURITY_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: true, onboarding },
      { status: 200, headers: SECURITY_HEADERS },
    );
  } catch (error) {
    console.error("Partner onboarding token lookup failed", error);
    return NextResponse.json(
      { ok: false, error: "onboarding_unavailable" },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}
