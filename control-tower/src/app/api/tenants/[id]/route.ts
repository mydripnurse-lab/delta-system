import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { seedTenantStateFilesFromTemplates } from "@/lib/tenantStateTemplateSeed";
import { writeAuditLog } from "@/lib/audit";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function slugify(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseOptionalJsonObject(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("googleServiceAccountJson must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  throw new Error("googleServiceAccountJson must be a JSON object");
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(_req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  try {
    const org = await pool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>(
      `
        select id, name, slug, status, created_at, updated_at
        from app.organizations
        where id = $1
        limit 1
      `,
      [tenantId],
    );
    if (!org.rows[0]) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    let settingsRow: Record<string, unknown> | null = null;
    try {
      const settings = await pool.query(
        `
          select
            timezone,
            locale,
            currency,
            root_domain,
            snapshot_location_id,
            cloudflare_cname_target,
            (nullif(cloudflare_api_token, '') is not null) as has_cloudflare_api_token,
            ghl_company_id,
            snapshot_id,
            owner_first_name,
            owner_last_name,
            owner_email,
            owner_phone,
            app_display_name,
            brand_name,
            logo_url,
            ads_alert_webhook_url,
            ads_alerts_enabled,
            ads_alert_sms_enabled,
            ads_alert_sms_to,
            google_service_account_json,
            created_at,
            updated_at
          from app.organization_settings
          where organization_id = $1
          limit 1
        `,
        [tenantId],
      );
      settingsRow = (settings.rows[0] as Record<string, unknown> | undefined) || null;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      const missingCloudflareColumns =
        msg.includes("cloudflare_cname_target") ||
        msg.includes("cloudflare_api_token") ||
        msg.includes("has_cloudflare_api_token") ||
        msg.includes("snapshot_location_id");
      if (!missingCloudflareColumns) throw error;

      const legacy = await pool.query(
        `
          select
            timezone,
            locale,
            currency,
            root_domain,
            snapshot_location_id,
            ghl_company_id,
            snapshot_id,
            owner_first_name,
            owner_last_name,
            owner_email,
            owner_phone,
            app_display_name,
            brand_name,
            logo_url,
            ads_alert_webhook_url,
            ads_alerts_enabled,
            ads_alert_sms_enabled,
            ads_alert_sms_to,
            google_service_account_json,
            created_at,
            updated_at
          from app.organization_settings
          where organization_id = $1
          limit 1
        `,
        [tenantId],
      );
      const row = (legacy.rows[0] as Record<string, unknown> | undefined) || null;
      settingsRow = row
        ? {
            ...row,
            snapshot_location_id: row?.snapshot_location_id ?? null,
            cloudflare_cname_target: null,
            has_cloudflare_api_token: false,
          }
        : null;
    }

    const integrations = await pool.query(
      `
        select
          id,
          provider,
          integration_key,
          status,
          auth_type,
          external_account_id,
          external_property_id,
          config,
          scopes,
          last_sync_at,
          last_error,
          created_at,
          updated_at
        from app.organization_integrations
        where organization_id = $1
        order by provider asc, integration_key asc
      `,
      [tenantId],
    );

    return NextResponse.json({
      ok: true,
      tenant: org.rows[0],
      settings: settingsRow,
      integrations: integrations.rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read tenant";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

type PatchTenantBody = {
  name?: string;
  slug?: string;
  status?: "active" | "disabled";
  snapshotId?: string;
  companyId?: string;
  twilioSid?: string;
  twilioAuthToken?: string;
  mailgunApiKey?: string;
  mailgunDomain?: string;
  googleCloudProjectId?: string;
  googleServiceAccountEmail?: string;
  googleServiceAccountKeyfilePath?: string;
  googleServiceAccountJson?: Record<string, unknown> | string | null;
  googleSheetId?: string;
  gscProperty?: string;
  ga4PropertyId?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  rootDomain?: string;
  appDisplayName?: string;
  brandName?: string;
  logoUrl?: string;
  ownerLocationId?: string;
  adsAlertWebhookUrl?: string;
  adsAlertsEnabled?: boolean;
  adsAlertSmsEnabled?: boolean;
  adsAlertSmsTo?: string;
  cloudflareCnameTarget?: string;
  cloudflareApiToken?: string;
  snapshotLocationId?: string;
};

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as PatchTenantBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = s(body.name);
  const incomingSlug = s(body.slug);
  const status = s(body.status).toLowerCase();
  const snapshotId = s(body.snapshotId);
  const companyId = s(body.companyId);
  const twilioSid = s(body.twilioSid);
  const twilioAuthToken = s(body.twilioAuthToken);
  const mailgunApiKey = s(body.mailgunApiKey);
  const mailgunDomain = s(body.mailgunDomain);
  const googleCloudProjectId = s(body.googleCloudProjectId);
  const googleServiceAccountEmail = s(body.googleServiceAccountEmail);
  const googleServiceAccountKeyfilePath = s(body.googleServiceAccountKeyfilePath);
  let googleServiceAccountJson: Record<string, unknown> | null = null;
  try {
    googleServiceAccountJson = parseOptionalJsonObject(body.googleServiceAccountJson);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid googleServiceAccountJson";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const googleSheetId = s(body.googleSheetId);
  const gscProperty = s(body.gscProperty);
  const ga4PropertyId = s(body.ga4PropertyId);
  const ownerFirstName = s(body.ownerFirstName);
  const ownerLastName = s(body.ownerLastName);
  const ownerEmail = s(body.ownerEmail);
  const ownerPhone = s(body.ownerPhone);
  const timezone = s(body.timezone);
  const locale = s(body.locale);
  const currency = s(body.currency);
  const rootDomain = s(body.rootDomain);
  const appDisplayName = s(body.appDisplayName);
  const brandName = s(body.brandName);
  const logoUrl = s(body.logoUrl);
  const ownerLocationId = s(body.ownerLocationId);
  const adsAlertWebhookUrl = s(body.adsAlertWebhookUrl);
  const adsAlertsEnabled =
    typeof body.adsAlertsEnabled === "boolean" ? body.adsAlertsEnabled : null;
  const adsAlertSmsEnabled =
    typeof body.adsAlertSmsEnabled === "boolean" ? body.adsAlertSmsEnabled : null;
  const adsAlertSmsTo = s(body.adsAlertSmsTo);
  const cloudflareCnameTarget = s(body.cloudflareCnameTarget);
  const cloudflareApiToken = s(body.cloudflareApiToken);
  const snapshotLocationId = s(body.snapshotLocationId);

  const nextSlug = slugify(incomingSlug || "");
  if (incomingSlug && !nextSlug) {
    return NextResponse.json({ ok: false, error: "Invalid slug" }, { status: 400 });
  }
  if (status && status !== "active" && status !== "disabled") {
    return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `select 1 from app.organizations where id = $1 limit 1`,
      [tenantId],
    );
    if (!exists.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const setOrg: string[] = [];
    const orgVals: unknown[] = [];
    if (name) {
      orgVals.push(name);
      setOrg.push(`name = $${orgVals.length}`);
    }
    if (nextSlug) {
      orgVals.push(nextSlug);
      setOrg.push(`slug = $${orgVals.length}`);
    }
    if (status) {
      orgVals.push(status);
      setOrg.push(`status = $${orgVals.length}`);
    }
    if (setOrg.length > 0) {
      orgVals.push(tenantId);
      await client.query(
        `update app.organizations set ${setOrg.join(", ")} where id = $${orgVals.length}`,
        orgVals,
      );
    }

    await client.query(
      `
        insert into app.organization_settings (
          organization_id, timezone, locale, currency, root_domain, snapshot_location_id, cloudflare_cname_target, cloudflare_api_token, ghl_company_id, snapshot_id, owner_first_name, owner_last_name, owner_email, owner_phone, app_display_name, brand_name, logo_url, google_service_account_json, ads_alert_webhook_url, ads_alerts_enabled, ads_alert_sms_enabled, ads_alert_sms_to
        )
        values (
          $1,
          coalesce(nullif($2,''), 'UTC'),
          coalesce(nullif($3,''), 'en-US'),
          coalesce(nullif($4,''), 'USD'),
          nullif($5,''),
          nullif($6,''),
          nullif($7,''),
          nullif($8,''),
          nullif($9,''),
          nullif($10,''),
          nullif($11,''),
          nullif($12,''),
          nullif($13,''),
          nullif($14,''),
          nullif($15,''),
          nullif($16,''),
          nullif($17,''),
          $18::jsonb,
          nullif($19,''),
          coalesce($20::boolean, true),
          coalesce($21::boolean, false),
          nullif($22,'')
        )
        on conflict (organization_id) do update
        set
          timezone = coalesce(nullif(excluded.timezone,''), app.organization_settings.timezone),
          locale = coalesce(nullif(excluded.locale,''), app.organization_settings.locale),
          currency = coalesce(nullif(excluded.currency,''), app.organization_settings.currency),
          root_domain = coalesce(excluded.root_domain, app.organization_settings.root_domain),
          snapshot_location_id = coalesce(excluded.snapshot_location_id, app.organization_settings.snapshot_location_id),
          cloudflare_cname_target = coalesce(excluded.cloudflare_cname_target, app.organization_settings.cloudflare_cname_target),
          cloudflare_api_token = coalesce(excluded.cloudflare_api_token, app.organization_settings.cloudflare_api_token),
          ghl_company_id = coalesce(excluded.ghl_company_id, app.organization_settings.ghl_company_id),
          owner_first_name = coalesce(excluded.owner_first_name, app.organization_settings.owner_first_name),
          owner_last_name = coalesce(excluded.owner_last_name, app.organization_settings.owner_last_name),
          owner_email = coalesce(excluded.owner_email, app.organization_settings.owner_email),
          owner_phone = coalesce(excluded.owner_phone, app.organization_settings.owner_phone),
          app_display_name = coalesce(excluded.app_display_name, app.organization_settings.app_display_name),
          brand_name = coalesce(excluded.brand_name, app.organization_settings.brand_name),
          logo_url = coalesce(excluded.logo_url, app.organization_settings.logo_url),
          snapshot_id = coalesce(excluded.snapshot_id, app.organization_settings.snapshot_id),
          google_service_account_json = coalesce(excluded.google_service_account_json, app.organization_settings.google_service_account_json),
          ads_alert_webhook_url = coalesce(excluded.ads_alert_webhook_url, app.organization_settings.ads_alert_webhook_url),
          ads_alerts_enabled = coalesce(excluded.ads_alerts_enabled, app.organization_settings.ads_alerts_enabled),
          ads_alert_sms_enabled = coalesce(excluded.ads_alert_sms_enabled, app.organization_settings.ads_alert_sms_enabled),
          ads_alert_sms_to = coalesce(excluded.ads_alert_sms_to, app.organization_settings.ads_alert_sms_to)
      `,
      [
        tenantId,
        timezone,
        locale,
        currency,
        rootDomain,
        snapshotLocationId,
        cloudflareCnameTarget,
        cloudflareApiToken,
        companyId,
        snapshotId,
        ownerFirstName,
        ownerLastName,
        ownerEmail,
        ownerPhone,
        appDisplayName,
        brandName,
        logoUrl,
        googleServiceAccountJson ? JSON.stringify(googleServiceAccountJson) : null,
        adsAlertWebhookUrl,
        adsAlertsEnabled,
        adsAlertSmsEnabled,
        adsAlertSmsTo,
      ],
    );

    if (ownerLocationId) {
      try {
        await client.query(
          `
            insert into app.organization_integrations (
              organization_id,
              provider,
              integration_key,
              status,
              auth_type,
              external_account_id,
              config,
              metadata
            )
            values (
              $1,
              'ghl',
              'owner',
              'connected',
              'api_key',
              $2,
              '{}'::jsonb,
              '{"note":"owner location for custom values and snapshots"}'::jsonb
            )
            on conflict (organization_id, provider, integration_key) do update
            set
              status = 'connected',
              auth_type = 'api_key',
              external_account_id = excluded.external_account_id
          `,
          [tenantId, ownerLocationId],
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("organization_integrations_provider_ck")) throw error;
        await client.query(
          `
            insert into app.organization_integrations (
              organization_id,
              provider,
              integration_key,
              status,
              auth_type,
              external_account_id,
              config,
              metadata
            )
            values (
              $1,
              'custom',
              'owner',
              'connected',
              'api_key',
              $2,
              '{}'::jsonb,
              '{"note":"owner location (fallback provider=custom)"}'::jsonb
            )
            on conflict (organization_id, provider, integration_key) do update
            set
              status = 'connected',
              auth_type = 'api_key',
              external_account_id = excluded.external_account_id
          `,
          [tenantId, ownerLocationId],
        );
      }
    }

    const ownerConfigPatch: Record<string, unknown> = {};
    if (companyId) ownerConfigPatch.companyId = companyId;
    if (twilioSid || twilioAuthToken) {
      ownerConfigPatch.twilio = {
        sid: twilioSid || null,
        authToken: twilioAuthToken || null,
      };
    }
    if (mailgunApiKey || mailgunDomain) {
      ownerConfigPatch.mailgun = {
        apiKey: mailgunApiKey || null,
        domain: mailgunDomain || null,
      };
    }
    if (adsAlertWebhookUrl || adsAlertSmsTo || adsAlertsEnabled !== null || adsAlertSmsEnabled !== null) {
      ownerConfigPatch.alerts = {
        adsEnabled: adsAlertsEnabled,
        adsWebhookUrl: adsAlertWebhookUrl || null,
        adsSmsEnabled: adsAlertSmsEnabled,
        adsSmsTo: adsAlertSmsTo || null,
      };
    }
    if (
      googleCloudProjectId ||
      googleServiceAccountEmail ||
      googleServiceAccountKeyfilePath ||
      googleServiceAccountJson ||
      googleSheetId ||
      gscProperty ||
      ga4PropertyId
    ) {
      ownerConfigPatch.google = {
        cloudProjectId: googleCloudProjectId || null,
        serviceAccountEmail: googleServiceAccountEmail || null,
        serviceAccountKeyfilePath: googleServiceAccountKeyfilePath || null,
        serviceAccountJsonInDb: googleServiceAccountJson ? true : null,
        sheetId: googleSheetId || null,
        gscProperty: gscProperty || null,
        ga4PropertyId: ga4PropertyId || null,
      };
    }
    if (Object.keys(ownerConfigPatch).length > 0) {
      await client.query(
        `
          update app.organization_integrations
          set
            config = coalesce(config, '{}'::jsonb) || $2::jsonb,
            updated_at = now()
          where organization_id = $1
            and integration_key = 'owner'
        `,
        [tenantId, JSON.stringify(ownerConfigPatch)],
      );
    }

    await writeAuditLog(client, {
      organizationId: tenantId,
      actorType: "user",
      actorLabel: "agency-ui",
      action: "tenant.update",
      entityType: "tenant",
      entityId: tenantId,
      payload: {
        changed: {
          name: !!name,
          slug: !!nextSlug,
          status: !!status,
          ownerLocationId: !!ownerLocationId,
          companyId: !!companyId,
          snapshotId: !!snapshotId,
          ownerFirstName: !!ownerFirstName,
          ownerLastName: !!ownerLastName,
          ownerEmail: !!ownerEmail,
          ownerPhone: !!ownerPhone,
          timezone: !!timezone,
          locale: !!locale,
          currency: !!currency,
          rootDomain: !!rootDomain,
          snapshotLocationId: !!snapshotLocationId,
          cloudflareCnameTarget: !!cloudflareCnameTarget,
          cloudflareApiToken: !!cloudflareApiToken,
          logoUrl: !!logoUrl,
          adsAlertWebhookUrl: !!adsAlertWebhookUrl,
          adsAlertsEnabled: adsAlertsEnabled !== null,
          adsAlertSmsEnabled: adsAlertSmsEnabled !== null,
          adsAlertSmsTo: !!adsAlertSmsTo,
        },
      },
    });

    await client.query("COMMIT");

    let stateSeed: Awaited<ReturnType<typeof seedTenantStateFilesFromTemplates>> | null = null;
    if (rootDomain) {
      stateSeed = await seedTenantStateFilesFromTemplates({
        db: pool,
        organizationId: tenantId,
        rootDomain,
        source: "template_seed",
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          ok: false,
          tenantId,
          rootDomain: s(rootDomain),
          templateDir: "",
          templateFiles: 0,
          upserted: 0,
          message,
          errors: [message],
        };
      });
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      updated: {
        organization: setOrg.length > 0,
        settings: true,
        ownerIntegration: !!ownerLocationId,
      },
      stateSeed,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to update tenant";
    const isSlugConflict =
      message.includes("organizations_slug_uq") || message.includes("duplicate key");
    return NextResponse.json(
      { ok: false, error: isSlugConflict ? "Slug already exists. Try another slug." : message },
      { status: isSlugConflict ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(_req, tenantId, "tenant.delete");
  if ("response" in auth) return auth.response;

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const exists = await client.query(
      `select id, name from app.organizations where id = $1 limit 1`,
      [tenantId],
    );
    if (!exists.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    await client.query(`delete from app.organization_state_files where organization_id = $1`, [tenantId]);
    await client.query(`delete from app.organization_integrations where organization_id = $1`, [tenantId]);
    await client.query(`delete from app.organization_custom_values where organization_id = $1`, [tenantId]);
    await client.query(`delete from app.organization_settings where organization_id = $1`, [tenantId]);
    await client.query(
      `
        insert into app.organization_audit_logs (
          organization_id, actor_type, actor_label, action, entity_type, entity_id, severity, payload
        )
        values ($1, 'user', 'agency-ui', 'tenant.delete', 'tenant', $1, 'critical', $2::jsonb)
      `,
      [tenantId, JSON.stringify({ tenantName: exists.rows[0]?.name || null })],
    );
    await client.query(`delete from app.organizations where id = $1`, [tenantId]);

    await client.query("COMMIT");
    return NextResponse.json({
      ok: true,
      deleted: true,
      tenantId,
    });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to delete tenant";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
