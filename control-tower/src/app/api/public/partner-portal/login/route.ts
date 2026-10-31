import { consumeClinicRequestBudget } from "@/lib/clinicRequestBudget";
import { clinicsEnabled } from "@/lib/clinicFeature";
import { NextResponse } from "next/server";
import { CLINIC_COOKIE, clinicCookieOptions, loginClinicAccount } from "@/lib/clinicAuth";

import {
  createPartnerPortalPasswordSession,
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if(clinicsEnabled() && !consumeClinicRequestBudget(request,"partner-clinic-login")) return NextResponse.json({ok:false,error:"Too many attempts. Please try again later."},{status:429});
    const body = await request.json();
    const session = await createPartnerPortalPasswordSession(
      String(body?.email || ""),
      String(body?.password || ""),
    );
    if (!session) {
      const clinicToken = await loginClinicAccount(String(body?.email || ""), String(body?.password || ""));
      if (clinicToken) {
        const response = NextResponse.json({ok:true,redirectTo:"/portal/clinics"});
        response.cookies.set(CLINIC_COOKIE, clinicToken, clinicCookieOptions());
        response.cookies.set(PARTNER_PORTAL_COOKIE, "", {...partnerPortalCookieOptions(), maxAge:0});
        return response;
      }
      return NextResponse.json({ ok: false, error: "Email or password is incorrect." }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, redirectTo: body?.returnTo === "/" ? "/" : "/portal" });
    response.cookies.set(PARTNER_PORTAL_COOKIE, session.token, partnerPortalCookieOptions());
    response.cookies.delete(CLINIC_COOKIE);
    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to sign in." },
      { status: 500 },
    );
  }
}
