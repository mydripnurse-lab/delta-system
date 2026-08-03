import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  testPartnerAdminNotificationWebhook,
  type PartnerAdminWebhookTarget,
} from "@/lib/partnerAdminSettings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const result = await testPartnerAdminNotificationWebhook({
      tenantId: String(body?.tenantId || ""),
      target: String(body?.target || "") as PartnerAdminWebhookTarget,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The webhook test failed.";
    const status = /required|invalid|not configured|not found/i.test(message) ? 400 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
