import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function parseBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(t)) return true;
    if (["0", "false", "no", "n"].includes(t)) return false;
  }
  return null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const overrideWebhookUrl = s(body.webhookUrl || "");
  const overrideSmsEnabled = parseBool(body.smsEnabled);
  const overrideSmsTo = s(body.smsTo || "");

  const pool = getDbPool();
  const q = await pool.query<{
    tenant_name: string | null;
    tenant_slug: string | null;
    location_id: string | null;
    settings_webhook_url: string | null;
    settings_alerts_enabled: boolean | null;
    settings_sms_enabled: boolean | null;
    settings_sms_to: string | null;
    cfg_webhook_url: string | null;
    cfg_alerts_enabled: boolean | null;
    cfg_sms_enabled: boolean | null;
    cfg_sms_to: string | null;
  }>(
    `
      select
        o.name as tenant_name,
        o.slug as tenant_slug,
        ghl.external_account_id as location_id,
        nullif(sg.ads_alert_webhook_url, '') as settings_webhook_url,
        sg.ads_alerts_enabled as settings_alerts_enabled,
        sg.ads_alert_sms_enabled as settings_sms_enabled,
        nullif(sg.ads_alert_sms_to, '') as settings_sms_to,
        nullif(ghl.config #>> '{alerts,adsWebhookUrl}', '') as cfg_webhook_url,
        case lower(coalesce(ghl.config #>> '{alerts,adsEnabled}', ''))
          when 'true' then true
          when '1' then true
          when 'yes' then true
          when 'false' then false
          when '0' then false
          when 'no' then false
          else null
        end as cfg_alerts_enabled,
        case lower(coalesce(ghl.config #>> '{alerts,adsSmsEnabled}', ''))
          when 'true' then true
          when '1' then true
          when 'yes' then true
          when 'false' then false
          when '0' then false
          when 'no' then false
          else null
        end as cfg_sms_enabled,
        nullif(ghl.config #>> '{alerts,adsSmsTo}', '') as cfg_sms_to
      from app.organizations o
      left join app.organization_settings sg
        on sg.organization_id = o.id
      left join lateral (
        select external_account_id, config
        from app.organization_integrations i
        where i.organization_id = o.id
          and i.provider = 'ghl'
          and i.status = 'connected'
        order by case when i.integration_key = 'owner' then 0 else 1 end, i.updated_at desc
        limit 1
      ) ghl on true
      where o.id = $1::uuid
      limit 1
    `,
    [tenantId],
  );

  const row = q.rows[0];
  if (!row) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const webhookUrl =
    overrideWebhookUrl ||
    s(row.settings_webhook_url || "") ||
    s(row.cfg_webhook_url || "") ||
    s(process.env.ADS_ALERT_GHL_WEBHOOK_URL || "");

  if (!webhookUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No webhook configured. Set Ads Alerts Webhook in tenant settings or ADS_ALERT_GHL_WEBHOOK_URL.",
      },
      { status: 400 },
    );
  }

  const smsEnabled =
    overrideSmsEnabled ??
    (row.settings_sms_enabled === true
      ? true
      : row.settings_sms_enabled === false
        ? false
        : row.cfg_sms_enabled === true);
  const smsTo =
    overrideSmsTo ||
    s(row.settings_sms_to || "") ||
    s(row.cfg_sms_to || "");

  const alertsEnabled =
    row.settings_alerts_enabled === false
      ? false
      : row.settings_alerts_enabled === true
        ? true
        : row.cfg_alerts_enabled !== false;
  if (!alertsEnabled) {
    return NextResponse.json(
      { ok: false, error: "Ads alerts are disabled for this tenant. Enable them first." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const payload = {
    event: "ads_ai_high_critical",
    sample: true,
    generatedAt: now,
    tenantId,
    tenantName: s(row.tenant_name || ""),
    tenantSlug: s(row.tenant_slug || ""),
    integrationKey: "sample",
    locationId: s(row.location_id || "") || null,
    channel: {
      smsEnabled: smsEnabled === true,
      smsTo,
    },
    action: {
      sendSms: smsEnabled === true,
      smsTo,
    },
    notifications: [
      {
        id: "sample-001",
        priority: "high",
        title: "Drop in conversion rate (sample)",
        summary:
          "Conversions down 22% week-over-week while spend is flat. Review query leakage and landing friction.",
      },
      {
        id: "sample-002",
        priority: "critical",
        title: "Budget pacing anomaly (sample)",
        summary:
          "One campaign is projected to overspend 35% by end of week. Apply bid cap and tighten geo filters.",
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    return NextResponse.json({
      ok: res.ok,
      sent: res.ok,
      webhookUrl,
      responseStatus: res.status,
      responsePreview: raw.slice(0, 1200),
      payload,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        webhookUrl,
        error: error instanceof Error ? error.message : "Webhook request failed",
        payload,
      },
      { status: 500 },
    );
  }
}
