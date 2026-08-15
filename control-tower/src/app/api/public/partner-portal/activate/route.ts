import { NextResponse } from "next/server";

import {
  activatePartnerPortalAccount,
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");
    if (!token) {
      return NextResponse.json({ ok: false, error: "This activation link is missing or invalid." }, { status: 400 });
    }

    const session = await activatePartnerPortalAccount(token, password);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "This activation link has expired or was already used." },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true, redirectTo: "/portal?onboarding=required" });
    response.cookies.set(PARTNER_PORTAL_COOKIE, session.token, partnerPortalCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to activate your account." },
      { status: 400 },
    );
  }
}
