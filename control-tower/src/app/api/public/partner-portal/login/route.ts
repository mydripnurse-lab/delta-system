import { NextResponse } from "next/server";

import {
  createPartnerPortalPasswordSession,
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const session = await createPartnerPortalPasswordSession(
      String(body?.email || ""),
      String(body?.password || ""),
    );
    if (!session) {
      return NextResponse.json({ ok: false, error: "Email or password is incorrect." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, redirectTo: "/portal" });
    response.cookies.set(PARTNER_PORTAL_COOKIE, session.token, partnerPortalCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 500 },
    );
  }
}
