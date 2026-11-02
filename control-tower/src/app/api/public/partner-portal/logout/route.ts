import { validPartnerPortalOrigin } from '@/lib/partnerPortalOrigin';
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CLINIC_COOKIE, clinicCookieOptions, hashClinicToken } from "@/lib/clinicAuth";
import { getDbPool } from "@/lib/db";

import {
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
  revokePartnerPortalSession,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await validPartnerPortalOrigin(request)) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_PORTAL_COOKIE)?.value || "";
  await revokePartnerPortalSession(token);
  const clinicToken = cookieStore.get(CLINIC_COOKIE)?.value;
  if(clinicToken) await getDbPool().query("delete from app.clinic_sessions where token_hash=$1",[hashClinicToken(clinicToken)]);
  const response = NextResponse.json({ ok: true, redirectTo: "/login" });
  response.cookies.set(PARTNER_PORTAL_COOKIE, "", {
    ...partnerPortalCookieOptions((request.headers.get("host") || new URL(request.url).host).split(":")[0]),
    maxAge: 0,
  });
  response.cookies.set(CLINIC_COOKIE, "", {...clinicCookieOptions(),maxAge:0});
  return response;
}
