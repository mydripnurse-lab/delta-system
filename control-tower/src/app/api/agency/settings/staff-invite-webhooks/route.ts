import { NextResponse } from "next/server";
import { requireAgencyPermission } from "@/lib/authz";
import { readInviteWebhookSettings, saveInviteWebhookSettings } from "@/lib/staffInvite";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.read");
  if ("response" in auth) return auth.response;
  try {
    const payload = await readInviteWebhookSettings();
    return NextResponse.json({ ok: true, settingKey: "staff_invite_webhooks_v1", payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.manage");
  if ("response" in auth) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = await saveInviteWebhookSettings(body);
    return NextResponse.json({ ok: true, settingKey: "staff_invite_webhooks_v1", payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
