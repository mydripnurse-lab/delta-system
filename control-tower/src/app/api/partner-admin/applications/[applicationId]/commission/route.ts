import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getAffiliateCommissionSettingsForApplication, saveAffiliateCommissionOverride } from "@/lib/partnerAffiliate";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ applicationId: string }> };

export async function GET(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  const { applicationId } = await context.params;
  try {
    return NextResponse.json({ ok: true, commission: await getAffiliateCommissionSettingsForApplication(applicationId) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load commission settings." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;
  const { applicationId } = await context.params;
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body?.rate;
    const rate = raw === null || raw === "" || raw === undefined ? null : Number(raw);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      return NextResponse.json({ ok: false, error: "Commission rate must be between 0 and 100." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, commission: await saveAffiliateCommissionOverride(applicationId, rate) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save commission settings." }, { status: 400 });
  }
}
