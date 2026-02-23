import { getDbPool } from "@/lib/db";
import { markLeadsWebhookResult, readLeadStore } from "@/lib/prospectingStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function isTruthy(v: unknown) {
  const x = s(v).toLowerCase();
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function resolveAuthCandidates() {
  return [
    s(process.env.PROSPECTING_CRON_SECRET),
    s(process.env.CRON_SECRET),
    s(process.env.DASHBOARD_CRON_SECRET),
  ].filter(Boolean);
}

function enforceCronAuth() {
  const v = s(process.env.ENFORCE_PROSPECTING_CRON_AUTH).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function extractToken(req: Request, body?: JsonMap | null) {
  const qs = new URL(req.url).searchParams;
  const header = s(req.headers.get("x-prospecting-cron-secret"));
  const dashboardHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const auth = s(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const query = s(qs.get("secret"));
  const bodyToken = s(body?.secret);
  return header || dashboardHeader || bearer || query || bodyToken;
}

function isVercelCronRequest(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const vercelId = s(req.headers.get("x-vercel-id"));
  if (vercelId) return true;
  const ua = s(req.headers.get("user-agent")).toLowerCase();
  return ua.includes("vercel-cron");
}

function isInternalCronCall(req: Request) {
  return s(req.headers.get("x-internal-cron-call")) === "1";
}

async function resolveTenantWebhookUrl(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{
    settings_webhook_url: string | null;
    prospecting_config: Record<string, unknown> | null;
    ghl_integration_config: Record<string, unknown> | null;
  }>(
    `
      select
        nullif(os.ads_alert_webhook_url, '') as settings_webhook_url,
        p.config as prospecting_config,
        oi.config as ghl_integration_config
      from app.organizations o
      left join app.organization_settings os
        on os.organization_id = o.id
      left join lateral (
        select config
        from app.organization_integrations p
        where p.organization_id = o.id
          and p.provider = 'prospecting'
          and p.integration_key = 'default'
        limit 1
      ) p on true
      left join lateral (
        select config
        from app.organization_integrations i
        where i.organization_id = o.id
          and i.provider in ('ghl', 'custom')
          and i.integration_key in ('owner', 'default')
        order by case when i.integration_key = 'owner' then 0 else 1 end
        limit 1
      ) oi on true
      where o.id = $1::uuid
      limit 1
    `,
    [tenantId],
  );
  const row = q.rows[0];
  const cfgProspecting = (row?.prospecting_config || {}) as Record<string, unknown>;
  const cfg = (row?.ghl_integration_config || {}) as Record<string, unknown>;
  const webhookFromProspectingCfg =
    s(cfgProspecting.webhookUrl) ||
    s((cfgProspecting.webhooks as Record<string, unknown> | undefined)?.prospecting);
  const webhookFromGhlCfg =
    s(((cfg.alerts as Record<string, unknown> | undefined)?.prospectingWebhookUrl as unknown)) ||
    s(((cfg.webhooks as Record<string, unknown> | undefined)?.prospecting as unknown)) ||
    s(((cfg.webhooks as Record<string, unknown> | undefined)?.default as unknown));
  const settingsUrl = s(row?.settings_webhook_url);
  return webhookFromProspectingCfg || webhookFromGhlCfg || settingsUrl || s(process.env.PROSPECTING_GHL_WEBHOOK_URL);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const tenantId = s(body?.tenantId);
    if (!tenantId) return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    void req;

    const webhookUrlOverride = s(body?.webhookUrl);
    const webhookUrl = webhookUrlOverride || (await resolveTenantWebhookUrl(tenantId));
    if (!webhookUrl) {
      return Response.json(
        {
          ok: false,
          error:
            "Missing webhook URL. Configure integration config webhooks.prospecting (or alerts.prospectingWebhookUrl), or PROSPECTING_GHL_WEBHOOK_URL.",
        },
        { status: 400 },
      );
    }

    const maxLeads = Math.max(1, Math.min(500, Number(body?.maxLeads || 100)));
    const testOnly = isTruthy(body?.testOnly);
    const statuses = Array.isArray(body?.statuses)
      ? (body?.statuses as unknown[]).map((x) => s(x).toLowerCase()).filter(Boolean)
      : ["validated", "new"];
    const includeAlreadySent = isTruthy(body?.includeAlreadySent);
    const includeUnapproved = isTruthy(body?.includeUnapproved);

    const store = await readLeadStore(tenantId);
    const candidates = testOnly
      ? []
      : store.leads
          .filter((x) => statuses.includes(s(x.status).toLowerCase()))
          .filter((x) => includeUnapproved || s(x.reviewStatus || "pending").toLowerCase() === "approved")
          .filter((x) => Boolean(s(x.email) || s(x.phone)))
          .filter((x) => includeAlreadySent || !s(x.webhookSentAt))
          .slice(0, maxLeads);

    if (!candidates.length && !testOnly) {
      return Response.json({ ok: true, tenantId, sent: 0, skipped: 0, reason: "No leads to send." });
    }

    const payload = testOnly
      ? {
          event: "prospecting_webhook_test",
          tenantId,
          generatedAt: new Date().toISOString(),
          leadCount: 1,
          test: true,
          leads: [
            {
              leadId: "test_lead_001",
              businessName: "Test Wellness Clinic",
              website: "https://example.com",
              email: "test@example.com",
              phone: "+1 305-555-0101",
              category: "Mobile IV Therapy",
              services: "Hydration IV, Recovery IV",
              state: "Florida",
              county: "Miami-Dade",
              city: "Miami",
              source: "prospecting_test",
              status: "validated",
              notes: "Webhook test payload from Control Tower",
              reviewStatus: "approved",
            },
          ],
        }
      : {
      event: "prospecting_leads_ready",
      tenantId,
      generatedAt: new Date().toISOString(),
      leadCount: candidates.length,
      leads: candidates.map((x) => ({
        leadId: x.id,
        businessName: x.businessName,
        website: x.website,
        email: x.email,
        phone: x.phone,
        category: x.category,
        services: x.services,
        state: x.state,
        county: x.county,
        city: x.city,
        source: x.source,
        status: x.status,
        notes: x.notes,
        reviewStatus: x.reviewStatus || "pending",
      })),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      await markLeadsWebhookResult(
        tenantId,
        candidates.map((x) => x.id),
        { attemptsDelta: 1, error: `HTTP ${response.status} ${text.slice(0, 240)}` },
      );
      return Response.json(
        { ok: false, error: `Webhook failed (${response.status})`, detail: text.slice(0, 240) },
        { status: 502 },
      );
    }

    const sentAt = new Date().toISOString();
    if (!testOnly) {
      await markLeadsWebhookResult(
        tenantId,
        candidates.map((x) => x.id),
        { sentAt, attemptsDelta: 1, error: "" },
      );
    }

    return Response.json({
      ok: true,
      tenantId,
      webhookUrl,
      sent: testOnly ? 0 : candidates.length,
      testOnly,
      sentAt,
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to push leads to GHL webhook" },
      { status: 500 },
    );
  }
}
