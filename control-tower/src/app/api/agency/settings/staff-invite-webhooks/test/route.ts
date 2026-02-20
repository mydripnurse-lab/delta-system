import { NextResponse } from "next/server";
import { requireAgencyPermission } from "@/lib/authz";
import { getDefaultActivationBaseUrl, readInviteWebhookSettings } from "@/lib/staffInvite";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.manage");
  if ("response" in auth) return auth.response;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const settings = await readInviteWebhookSettings();
    const webhookUrl = s(body.webhookUrl) || settings.webhookUrl;
    if (!webhookUrl) {
      return NextResponse.json({ ok: false, error: "Missing webhook URL." }, { status: 400 });
    }

    const payload = {
      event: "staff.invite.test",
      sentAt: new Date().toISOString(),
      staff: {
        fullName: "Test Staff",
        full_name: "Test Staff",
        email: "test.staff@example.com",
        phone: "+1 305 555 0131",
        role: "viewer",
        status: "invited",
      },
      tenant: {
        id: "test-tenant",
        name: "Demo Project",
      },
      invitedBy: {
        name: "Agency Admin",
        email: "admin@example.com",
      },
      invited_by_name: "Agency Admin",
      invited_by_email: "admin@example.com",
      activation: {
        link: `${s(settings.activationBaseUrl) || getDefaultActivationBaseUrl()}?token=test-token`,
        expiresInHours: 72,
      },
      fullName: "Test Staff",
      full_name: "Test Staff",
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Webhook test failed (${res.status})`, detail: text.slice(0, 300) },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sent: true, status: res.status, response: text.slice(0, 300) });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
