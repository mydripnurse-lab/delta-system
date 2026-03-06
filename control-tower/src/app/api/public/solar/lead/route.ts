import { NextResponse } from "next/server";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function readWebhookUrl(tenantId: string) {
  const integration = await getTenantIntegration(tenantId, "custom", "solar_survey");
  const cfg = integration?.config && typeof integration.config === "object"
    ? (integration.config as Record<string, unknown>)
    : {};
  return s(cfg.webhookUrl);
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(payload.tenantId);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId." }, { status: 400 });
    }

    const webhookUrl = await readWebhookUrl(tenantId);
    const event = {
      source: "solar-survey-widget",
      tenantId,
      submittedAt: new Date().toISOString(),
      ip: req.headers.get("x-forwarded-for") || "",
      userAgent: req.headers.get("user-agent") || "",
      data: payload,
    };

    if (!webhookUrl) {
      return NextResponse.json({
        ok: true,
        message: "No webhook configured for this tenant. Payload captured locally.",
        event,
      });
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    const text = await response.text();

    return NextResponse.json(
      {
        ok: response.ok,
        status: response.status,
        webhookResponse: text,
      },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
