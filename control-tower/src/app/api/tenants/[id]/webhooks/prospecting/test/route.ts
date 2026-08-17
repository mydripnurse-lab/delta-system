import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

async function resolveWebhookUrl(tenantId: string, override?: string) {
  const direct = s(override);
  if (direct) return direct;
  const pool = getDbPool();
  const q = await pool.query<{ config: Record<string, unknown> | null }>(
    `
      select config
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider = 'prospecting'
        and integration_key = 'default'
      limit 1
    `,
    [tenantId],
  );
  const cfg = (q.rows[0]?.config || {}) as Record<string, unknown>;
  return s(cfg.webhookUrl);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const webhookUrl = await resolveWebhookUrl(tenantId, s(body.webhookUrl));
    if (!webhookUrl) {
      return NextResponse.json({ ok: false, error: "Missing webhook URL." }, { status: 400 });
    }

    const payload = {
      event: "prospecting.webhook.test",
      sentAt: new Date().toISOString(),
      tenant: {
        id: tenantId,
      },
      lead: {
        leadId: "test_prospect_001",
        businessName: "Test IV Wellness Center",
        website: "https://example.com",
        email: "test.prospect@example.com",
        phone: "+1 305 555 0177",
        category: "Mobile IV Therapy",
        services: "Hydration IV, Recovery IV",
        state: "Florida",
        county: "Miami-Dade",
        city: "Miami",
        status: "validated",
        reviewStatus: "approved",
        notes: "This is a test payload from tenant webhook settings.",
      },
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

