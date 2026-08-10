import { NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { testPartnerAdminNotificationWebhook, type PartnerAdminWebhookTarget } from "@/lib/partnerAdminSettings";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const target = body?.target as PartnerAdminWebhookTarget;
    const result = await testPartnerAdminNotificationWebhook({ tenantId: body?.tenantId, target });
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The webhook test failed." }, { status: 400 });
  }
}
