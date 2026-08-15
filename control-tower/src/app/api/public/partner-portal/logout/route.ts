import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
  revokePartnerPortalSession,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_PORTAL_COOKIE)?.value || "";
  await revokePartnerPortalSession(token);
  const response = NextResponse.json({ ok: true, redirectTo: "/login" });
  response.cookies.set(PARTNER_PORTAL_COOKIE, "", {
    ...partnerPortalCookieOptions(),
    maxAge: 0,
  });
  return response;
}
