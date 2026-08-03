import { NextRequest, NextResponse } from "next/server";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  listPartnerAdminNotificationSettings,
  savePartnerAdminNotificationSettings,
} from "@/lib/partnerAdminSettings";

export const dynamic = "force-dynamic";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The notification settings request failed.";
}

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const settings = await listPartnerAdminNotificationSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePartnerAdmin(req);
  if ("response" in auth) return auth.response;

  try {
    const body = await req.json();
    const settings = await savePartnerAdminNotificationSettings({
      tenantId: body?.tenantId,
      applicantReceivedWebhookUrl: body?.applicantReceivedWebhookUrl,
      adminNotificationWebhookUrl: body?.adminNotificationWebhookUrl,
      adminBaseUrl: body?.adminBaseUrl,
      clearApplicantWebhook: body?.clearApplicantWebhook,
      clearAdminWebhook: body?.clearAdminWebhook,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = errorMessage(error);
    const status = /required|valid url|https|not found/i.test(message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
