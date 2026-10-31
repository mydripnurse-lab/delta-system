import { consumeClinicRequestBudget } from "@/lib/clinicRequestBudget";
import { clinicsEnabled } from "@/lib/clinicFeature";
import { NextResponse } from "next/server";
import { CLINIC_COOKIE, clinicCookieOptions, loginClinicAccount, requireClinicOrigin } from "@/lib/clinicAuth";
import { clinicLoginDestination } from '@/lib/clinicLogin';

import {
  createPartnerPortalPasswordSession,
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
  revokePartnerPortalSession,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if(clinicsEnabled() && !consumeClinicRequestBudget(request,"partner-clinic-login")) return NextResponse.json({ok:false,error:"Too many attempts. Please try again later."},{status:429});
    const body = await request.json();
    let clinicAccess: Awaited<ReturnType<typeof clinicLoginDestination>> = null;
    if (body?.clinicSlug !== undefined) {
      requireClinicOrigin(request);
      if (typeof body.clinicSlug !== 'string' || body.clinicSlug.length > 80 || typeof body.email !== 'string' || body.email.length > 254) return NextResponse.json({ ok: false, error: 'Invalid sign-in request.' }, { status: 400 });
      clinicAccess = await clinicLoginDestination(body.clinicSlug, body.email);
      if (!clinicAccess) return NextResponse.json({ ok: false, error: 'Check your credentials and accepted clinic invitation.' }, { status: 401 });
    }
    const role = body?.role;
    if (role !== undefined && role !== "nurse" && role !== "clinic") {
      return NextResponse.json({ ok: false, error: "Choose a valid workspace." }, { status: 400 });
    }
    if (role === "clinic" && !clinicsEnabled()) {
      return NextResponse.json({ ok: false, error: "Clinic sign-in is not available." }, { status: 403 });
    }
    const session = await createPartnerPortalPasswordSession(
      String(body?.email || ""),
      String(body?.password || ""),
    );
    if (!session) {
      const clinicToken = role === "nurse" || clinicAccess?.role === 'nurse' ? null : await loginClinicAccount(String(body?.email || ""), String(body?.password || ""));
      if (clinicToken) {
        const response = NextResponse.json({ok:true,redirectTo:clinicAccess?.redirectTo || "/portal/clinics"});
        response.cookies.set(CLINIC_COOKIE, clinicToken, clinicCookieOptions());
        response.cookies.set(PARTNER_PORTAL_COOKIE, "", {...partnerPortalCookieOptions(), maxAge:0});
        return response;
      }
      return NextResponse.json({ ok: false, error: clinicAccess ? "Check your credentials and accepted clinic invitation." : "Email or password is incorrect." }, { status: 401 });
    }
    if (clinicAccess?.role === 'nurse' && session.profile.id !== clinicAccess.partnerId) {
      await revokePartnerPortalSession(session.token);
      return NextResponse.json({ ok: false, error: 'Check your credentials and accepted clinic invitation.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true, redirectTo: clinicAccess?.redirectTo || (role === "clinic" ? "/portal/clinics" : body?.returnTo === "/" ? "/" : "/portal") });
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
