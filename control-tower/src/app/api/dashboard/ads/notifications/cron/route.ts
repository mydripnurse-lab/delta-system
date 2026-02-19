import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type CronRun = {
  tenantId: string;
  integrationKey: string;
  ok: boolean;
  created: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
};

type GhlWebhookTarget = {
  tenantId: string;
  integrationKey: string;
  webhookUrl: string;
  locationId: string;
  alertsEnabled: boolean;
  smsEnabled: boolean;
  smsTo: string;
};

function ensureAuthorized(req: Request) {
  const expected = s(process.env.ADS_NOTIF_CRON_KEY);
  if (!expected) return true;
  const provided =
    s(req.headers.get("x-cron-key")) ||
    s(new URL(req.url).searchParams.get("key"));
  return provided && provided === expected;
}

async function listTargets(bodyTenantId: string) {
  const pool = getDbPool();
  if (bodyTenantId) {
    const q = await pool.query<{ organization_id: string; integration_key: string }>(
      `
        select organization_id, integration_key
        from app.organization_integrations
        where organization_id = $1::uuid
          and provider = 'google_ads'
          and status = 'connected'
      `,
      [bodyTenantId],
    );
    return q.rows || [];
  }

  const q = await pool.query<{ organization_id: string; integration_key: string }>(
    `
      select organization_id, integration_key
      from app.organization_integrations
      where provider = 'google_ads'
        and status = 'connected'
      order by organization_id asc
    `,
  );
  return q.rows || [];
}

async function listGhlWebhookTargets(bodyTenantId: string) {
  const pool = getDbPool();
  const params: unknown[] = [];
  let tenantFilter = "";
  if (bodyTenantId) {
    tenantFilter = "and ga.organization_id = $1::uuid";
    params.push(bodyTenantId);
  }

  const q = await pool.query<{
    organization_id: string;
    integration_key: string;
    external_account_id: string | null;
    webhook_url: string | null;
    alerts_enabled: boolean | null;
    sms_enabled: boolean | null;
    sms_to: string | null;
  }>(
    `
      select
        ga.organization_id,
        coalesce(ghl.integration_key, 'owner') as integration_key,
        ghl.external_account_id,
        coalesce(
          nullif(s.ads_alert_webhook_url, ''),
          nullif(ghl.config #>> '{alerts,adsWebhookUrl}', ''),
          nullif(ghl.config #>> '{alerts,ghlWebhookUrl}', ''),
          nullif(ghl.config #>> '{webhooks,adsNotifications}', ''),
          nullif(ghl.config #>> '{webhooks,default}', '')
        ) as webhook_url,
        coalesce(
          s.ads_alerts_enabled,
          case lower(coalesce(ghl.config #>> '{alerts,adsEnabled}', ''))
            when 'true' then true
            when '1' then true
            when 'yes' then true
            when 'false' then false
            when '0' then false
            when 'no' then false
            else null
          end,
          true
        ) as alerts_enabled,
        coalesce(
          s.ads_alert_sms_enabled,
          case lower(coalesce(ghl.config #>> '{alerts,adsSmsEnabled}', ''))
            when 'true' then true
            when '1' then true
            when 'yes' then true
            when 'false' then false
            when '0' then false
            when 'no' then false
            else null
          end,
          false
        ) as sms_enabled,
        coalesce(
          nullif(s.ads_alert_sms_to, ''),
          nullif(ghl.config #>> '{alerts,adsSmsTo}', '')
        ) as sms_to
      from app.organization_integrations ga
      left join lateral (
        select integration_key, external_account_id, config
        from app.organization_integrations i
        where i.organization_id = ga.organization_id
          and i.provider = 'ghl'
          and i.status = 'connected'
        order by case when i.integration_key = 'owner' then 0 else 1 end, i.updated_at desc
        limit 1
      ) ghl on true
      left join app.organization_settings s
        on s.organization_id = ga.organization_id
      where ga.provider = 'google_ads'
        and ga.status = 'connected'
        ${tenantFilter}
    `,
    params,
  );

  return (q.rows || [])
    .map((r) => ({
      tenantId: s(r.organization_id),
      integrationKey: s(r.integration_key || "owner"),
      webhookUrl: s(r.webhook_url || ""),
      locationId: s(r.external_account_id || ""),
      alertsEnabled: r.alerts_enabled !== false,
      smsEnabled: r.sms_enabled === true,
      smsTo: s(r.sms_to || ""),
    }))
    .filter((r) => r.tenantId && r.alertsEnabled && r.webhookUrl);
}

async function loadHighCritical(tenantId: string, integrationKey: string) {
  const pool = getDbPool();
  const q = await pool.query<{
    id: string;
    priority: string;
    title: string;
    summary: string;
    created_at: string;
  }>(
    `
      select id, priority, title, summary, created_at::text
      from app.ads_ai_notifications
      where organization_id = $1::uuid
        and module = 'ads'
        and integration_key = $2
        and status = 'open'
        and priority in ('high', 'critical')
        and created_at >= now() - interval '2 hours'
      order by
        case priority when 'critical' then 1 else 2 end asc,
        created_at desc
      limit 12
    `,
    [tenantId, integrationKey],
  );
  return q.rows || [];
}

async function sendSlackAlert(payload: {
  totalTargets: number;
  runs: CronRun[];
  highCritical: Array<{
    tenantId: string;
    integrationKey: string;
    items: Array<{ id: string; priority: string; title: string; summary: string }>;
  }>;
}) {
  const webhook = s(process.env.ADS_ALERT_SLACK_WEBHOOK_URL);
  if (!webhook) return { sent: false, reason: "Missing ADS_ALERT_SLACK_WEBHOOK_URL" };

  const totalCreated = payload.runs.reduce((acc, r) => acc + (r.created || 0), 0);
  const anyHighCritical = payload.highCritical.some((x) => x.items.length > 0);
  if (!anyHighCritical) return { sent: false, reason: "No high/critical open notifications." };

  const lines: string[] = [];
  lines.push(`*Ads AI Daily Observer*`);
  lines.push(`Targets: *${payload.totalTargets}* · Created: *${totalCreated}*`);
  for (const h of payload.highCritical) {
    if (!h.items.length) continue;
    lines.push(`\n*Tenant ${h.tenantId}* (${h.integrationKey})`);
    for (const item of h.items.slice(0, 4)) {
      lines.push(`• [${item.priority.toUpperCase()}] ${item.title}`);
    }
  }

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Slack alert failed (${res.status}) ${txt.slice(0, 240)}`);
  }
  return { sent: true, reason: "" };
}

async function sendEmailWebhookAlert(payload: {
  totalTargets: number;
  runs: CronRun[];
  highCritical: Array<{
    tenantId: string;
    integrationKey: string;
    items: Array<{ id: string; priority: string; title: string; summary: string }>;
  }>;
}) {
  const webhook = s(process.env.ADS_ALERT_EMAIL_WEBHOOK_URL);
  if (!webhook) return { sent: false, reason: "Missing ADS_ALERT_EMAIL_WEBHOOK_URL" };

  const anyHighCritical = payload.highCritical.some((x) => x.items.length > 0);
  if (!anyHighCritical) return { sent: false, reason: "No high/critical open notifications." };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "ads_ai_notifications_high_critical",
      generatedAt: new Date().toISOString(),
      payload,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Email webhook failed (${res.status}) ${txt.slice(0, 240)}`);
  }
  return { sent: true, reason: "" };
}

async function sendGhlWebhookAlerts(payload: {
  highCritical: Array<{
    tenantId: string;
    integrationKey: string;
    items: Array<{ id: string; priority: string; title: string; summary: string }>;
  }>;
  ghlTargets: GhlWebhookTarget[];
}) {
  const globalWebhook = s(process.env.ADS_ALERT_GHL_WEBHOOK_URL);
  const results: Array<{ tenantId: string; sent: boolean; reason: string }> = [];

  for (const item of payload.highCritical) {
    if (!item.items.length) continue;

    const tenantTargets = payload.ghlTargets.filter((x) => x.tenantId === item.tenantId);
    const url = s(tenantTargets[0]?.webhookUrl || globalWebhook);
    if (!url) {
      results.push({
        tenantId: item.tenantId,
        sent: false,
        reason: "No tenant GHL webhook configured.",
      });
      continue;
    }

    const locationId = s(tenantTargets[0]?.locationId || "");
    const body = {
      event: "ads_ai_high_critical",
      generatedAt: new Date().toISOString(),
      tenantId: item.tenantId,
      integrationKey: item.integrationKey,
      locationId: locationId || null,
      channel: {
        smsEnabled: tenantTargets[0]?.smsEnabled === true,
        smsTo: s(tenantTargets[0]?.smsTo || ""),
      },
      action: {
        sendSms: tenantTargets[0]?.smsEnabled === true,
        smsTo: s(tenantTargets[0]?.smsTo || ""),
      },
      notifications: item.items,
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        results.push({
          tenantId: item.tenantId,
          sent: false,
          reason: `GHL webhook failed (${res.status}) ${txt.slice(0, 140)}`,
        });
      } else {
        results.push({ tenantId: item.tenantId, sent: true, reason: "" });
      }
    } catch (error: unknown) {
      results.push({
        tenantId: item.tenantId,
        sent: false,
        reason: error instanceof Error ? error.message : "GHL webhook failed",
      });
    }
  }

  return {
    sent: results.some((r) => r.sent),
    runs: results,
  };
}

export async function POST(req: Request) {
  try {
    if (!ensureAuthorized(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body.tenantId || "");
    const range = s(body.range || "last_28_days");
    const force = body.force === true;
    const targets = await listTargets(tenantId);
    const ghlTargets = await listGhlWebhookTargets(tenantId);
    const url = new URL(req.url);

    const runs: CronRun[] = [];
    for (const t of targets) {
      const payload = {
        tenantId: t.organization_id,
        integrationKey: t.integration_key || "default",
        range,
        force,
      };
      try {
        const res = await fetch(`${url.origin}/api/dashboard/ads/notifications`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        runs.push({
          tenantId: t.organization_id,
          integrationKey: t.integration_key || "default",
          ok: !!(res.ok && json?.ok),
          created: Number(json?.generated?.created || 0),
          skipped: !!json?.generated?.skipped,
          reason: s(json?.generated?.reason || ""),
          error: res.ok && json?.ok ? "" : s(json?.error || `HTTP ${res.status}`),
        });
      } catch (error: unknown) {
        runs.push({
          tenantId: t.organization_id,
          integrationKey: t.integration_key || "default",
          ok: false,
          created: 0,
          error: error instanceof Error ? error.message : "Request failed",
        });
      }
    }

    const highCritical: Array<{
      tenantId: string;
      integrationKey: string;
      items: Array<{ id: string; priority: string; title: string; summary: string }>;
    }> = [];
    for (const run of runs) {
      const rows =
        run.created > 0
          ? await loadHighCritical(run.tenantId, run.integrationKey)
          : [];
      highCritical.push({
        tenantId: run.tenantId,
        integrationKey: run.integrationKey,
        items: rows.map((r) => ({
          id: s(r.id),
          priority: s(r.priority),
          title: s(r.title),
          summary: s(r.summary),
        })),
      });
    }

    const alertPayload = {
      totalTargets: targets.length,
      runs,
      highCritical,
    };
    let slackResult: { sent: boolean; reason: string } = { sent: false, reason: "" };
    let emailResult: { sent: boolean; reason: string } = { sent: false, reason: "" };
    let ghlResult: { sent: boolean; runs: Array<{ tenantId: string; sent: boolean; reason: string }> } = {
      sent: false,
      runs: [],
    };
    try {
      slackResult = await sendSlackAlert(alertPayload);
    } catch (error: unknown) {
      slackResult = {
        sent: false,
        reason: error instanceof Error ? error.message : "Slack alert error",
      };
    }
    try {
      emailResult = await sendEmailWebhookAlert(alertPayload);
    } catch (error: unknown) {
      emailResult = {
        sent: false,
        reason: error instanceof Error ? error.message : "Email alert error",
      };
    }
    try {
      ghlResult = await sendGhlWebhookAlerts({
        highCritical,
        ghlTargets,
      });
    } catch (error: unknown) {
      ghlResult = {
        sent: false,
        runs: [
          {
            tenantId: "n/a",
            sent: false,
            reason: error instanceof Error ? error.message : "GHL alert error",
          },
        ],
      };
    }

    return NextResponse.json({
      ok: true,
      mode: "daily_plus_anomaly",
      generatedAt: new Date().toISOString(),
      totalTargets: targets.length,
      runs,
      highCritical,
      alerts: {
        slack: slackResult,
        emailWebhook: emailResult,
        ghlWebhook: ghlResult,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to run ads notifications cron" },
      { status: 500 },
    );
  }
}
