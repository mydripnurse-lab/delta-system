import { NextResponse } from "next/server";

import {
  createPartnerPortalSession,
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const onboardingToken = String(body?.onboardingToken || "").trim();
    const session = await createPartnerPortalSession(onboardingToken);
    if (!session) {
      return NextResponse.json({ ok: false, error: "This Partner invitation is invalid or expired." }, { status: 401 });
    }
    const response = NextResponse.json({
      ok: true,
      redirectTo: process.env.NODE_ENV === "production"
        ? "https://partners.mydripnurse.com/portal"
        : "/partner-portal",
    });
    response.cookies.set(PARTNER_PORTAL_COOKIE, session.token, partnerPortalCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to activate Partner Portal." },
      { status: 500 },
    );
  }
}
