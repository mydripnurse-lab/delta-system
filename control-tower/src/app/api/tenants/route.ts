import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { seedTenantStateFilesFromTemplates } from "@/lib/tenantStateTemplateSeed";
import { listAccessibleTenantIdsForUser, requireAuthUser, requireAgencyPermission } from "@/lib/authz";

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

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolvePreferLive(projectValue: number | null, overviewValue: number | null) {
  if (projectValue === null) return overviewValue;
  if ((projectValue === 0 || projectValue < 0) && overviewValue !== null && overviewValue > 0) {
    return overviewValue;
  }
  return projectValue;
}

function pickKpi(payload: unknown, keys: string[]): number | null {
  const obj =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  if (!obj) return null;

  const readPath = (path: string): unknown => {
    const parts = path.split(".");
    let cur: unknown = obj;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || Array.isArray(cur)) return null;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  };

  for (const key of keys) {
    const n = toNum(readPath(key));
    if (n !== null) return n;
  }
  return null;
}

type CreateTenantBody = {
  name?: string;
  slug?: string;
  ownerLocationId?: string;
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
  adsAlertWebhookUrl?: string;
  adsAlertsEnabled?: boolean;
  adsAlertSmsEnabled?: boolean;
  adsAlertSmsTo?: string;
};

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

export async function GET(req: Request) {
  const auth = await requireAuthUser(req);
  if ("response" in auth) return auth.response;

  const canReadAgency = auth.user.globalRoles.some((role) =>
    ["platform_admin", "owner", "agency_admin", "admin"].includes(role),
  );
  const allowedTenantIds = canReadAgency ? [] : await listAccessibleTenantIdsForUser(auth.user);
  if (!canReadAgency && allowedTenantIds.length === 0) {
    return NextResponse.json({ ok: true, total: 0, rows: [] });
  }

  const pool = getDbPool();
  try {
    const result = await pool.query<{
      id: string;
      name: string;
      slug: string;
      status: string;
      created_at: string;
      updated_at: string;
      timezone: string | null;
      locale: string | null;
      currency: string | null;
      root_domain: string | null;
      ghl_company_id: string | null;
      snapshot_id: string | null;
      owner_first_name: string | null;
      owner_last_name: string | null;
      owner_email: string | null;
      owner_phone: string | null;
      app_display_name: string | null;
      brand_name: string | null;
      logo_url: string | null;
      owner_location_id: string | null;
      active_states_raw: number | null;
      total_subaccounts_raw: number | null;
      projects_payload: Record<string, unknown> | null;
      overview_payload: Record<string, unknown> | null;
      projects_captured_at: string | null;
      overview_captured_at: string | null;
    }>(
      `
        select
          o.id,
          o.name,
          o.slug,
          o.status,
          o.created_at,
          o.updated_at,
          s.timezone,
          s.locale,
          s.currency,
          s.root_domain,
          s.ghl_company_id,
          s.snapshot_id,
          s.owner_first_name,
          s.owner_last_name,
          s.owner_email,
          s.owner_phone,
          s.app_display_name,
          s.brand_name,
          s.logo_url,
          i.external_account_id as owner_location_id,
          coalesce(sf.active_states, 0)::int as active_states_raw,
          coalesce(sf.total_subaccounts, 0)::int as total_subaccounts_raw,
          pk.payload as projects_payload,
          ov.payload as overview_payload,
          pk.captured_at::text as projects_captured_at,
          ov.captured_at::text as overview_captured_at
        from app.organizations o
        left join app.organization_settings s
          on s.organization_id = o.id
        left join lateral (
          select external_account_id
          from app.organization_integrations i
          where i.organization_id = o.id
            and i.integration_key = 'owner'
          order by case when i.provider = 'ghl' then 0 else 1 end, i.updated_at desc
          limit 1
        ) i on true
        left join lateral (
          select
            count(*)::int as active_states,
            (
              coalesce(sum(jsonb_array_length(coalesce(f.payload->'counties', '[]'::jsonb))), 0)
              +
              coalesce(
                sum(
                  (
                    select coalesce(sum(jsonb_array_length(coalesce(c->'cities', '[]'::jsonb))), 0)
                    from jsonb_array_elements(coalesce(f.payload->'counties', '[]'::jsonb)) as c
                  )
                ),
                0
              )
            )::int as total_subaccounts
          from app.organization_state_files f
          where f.organization_id = o.id
        ) sf on true
        left join lateral (
          select payload, captured_at
          from app.organization_snapshots sp
          where sp.organization_id = o.id
            and sp.module = 'projects_kpis'
            and sp.snapshot_key = 'latest'
          order by sp.captured_at desc
          limit 1
        ) pk on true
        left join lateral (
          select payload, captured_at
          from app.organization_snapshots sp
          where sp.organization_id = o.id
            and sp.module in ('overview', 'dashboard_overview', 'dashboard')
          order by sp.captured_at desc
          limit 1
        ) ov on true
        ${canReadAgency ? "" : "where o.id = any($1::uuid[])"}
        order by o.created_at desc
      `,
      canReadAgency ? [] : [allowedTenantIds],
    );

    const rows = result.rows.map((r) => {
      const activeStates =
        pickKpi(r.projects_payload, ["kpis.active_states", "kpis.activeStates", "active_states", "activeStates"]) ??
        toNum(r.active_states_raw) ??
        0;
      const totalSubaccounts =
        pickKpi(r.projects_payload, ["kpis.total_subaccounts", "kpis.totalSubaccounts", "total_subaccounts", "totalSubaccounts"]) ??
        toNum(r.total_subaccounts_raw) ??
        0;
      const projectCalls = pickKpi(r.projects_payload, ["kpis.calls", "calls"]);
      const overviewCalls = pickKpi(r.overview_payload, ["kpis.calls", "executive.callsNow", "modules.calls.total", "calls", "summary.calls"]);
      const calls = resolvePreferLive(projectCalls, overviewCalls);
      const projectImpressions = pickKpi(r.projects_payload, ["kpis.impressions", "impressions"]);
      const overviewImpressions = pickKpi(
        r.overview_payload,
        [
          "kpis.impressions",
          "executive.searchImpressionsNow",
          "modules.searchPerformance.totals.impressions",
          "search.current.impressions",
          "modules.gsc.totals.impressions",
          "executive.gscImpressions",
          "impressions",
          "summary.impressions",
        ],
      );
      const impressions = resolvePreferLive(projectImpressions, overviewImpressions);
      const projectRevenue =
        pickKpi(r.projects_payload, ["kpis.revenue", "revenue"]) ??
        null;
      const overviewRevenue =
        pickKpi(r.overview_payload, ["kpis.revenue", "executive.transactionsRevenueNow", "modules.transactions.grossAmount", "revenue", "summary.revenue", "kpis.grossAmount"]) ??
        null;
      const revenue = resolvePreferLive(projectRevenue, overviewRevenue);
      const projectLeads =
        pickKpi(r.projects_payload, ["kpis.leads", "leads"]) ??
        null;
      const overviewLeads =
        pickKpi(r.overview_payload, ["kpis.leads", "executive.leadsNow", "modules.contacts.total", "leads", "summary.leads"]) ??
        null;
      const leads = resolvePreferLive(projectLeads, overviewLeads);
      const callsPrev =
        pickKpi(r.projects_payload, ["kpis_prev.calls", "prev.calls"]) ??
        pickKpi(r.overview_payload, ["executive.callsBefore", "modules.calls.prevTotal"]) ??
        null;
      const impressionsPrev =
        pickKpi(r.projects_payload, ["kpis_prev.impressions", "prev.impressions"]) ??
        pickKpi(r.overview_payload, ["executive.searchImpressionsBefore"]) ??
        null;
      const revenuePrev =
        pickKpi(r.projects_payload, ["kpis_prev.revenue", "prev.revenue"]) ??
        pickKpi(r.overview_payload, ["executive.transactionsRevenueBefore", "modules.transactions.prevGrossAmount"]) ??
        null;
      const leadsPrev =
        pickKpi(r.projects_payload, ["kpis_prev.leads", "prev.leads"]) ??
        pickKpi(r.overview_payload, ["executive.leadsBefore", "modules.contacts.prevTotal"]) ??
        null;
      const callsDeltaPct =
        pickKpi(r.projects_payload, ["kpis_delta_pct.calls", "delta_pct.calls"]) ??
        null;
      const impressionsDeltaPct =
        pickKpi(r.projects_payload, ["kpis_delta_pct.impressions", "delta_pct.impressions"]) ??
        null;
      const revenueDeltaPct =
        pickKpi(r.projects_payload, ["kpis_delta_pct.revenue", "delta_pct.revenue"]) ??
        pickKpi(r.overview_payload, ["executive.transactionsRevenueDeltaPct", "modules.transactions.revenueDeltaPct"]) ??
        null;
      const leadsDeltaPct =
        pickKpi(r.projects_payload, ["kpis_delta_pct.leads", "delta_pct.leads"]) ??
        pickKpi(r.overview_payload, ["executive.leadsDeltaPct", "modules.contacts.deltaPct"]) ??
        null;

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
        timezone: r.timezone,
        locale: r.locale,
        currency: r.currency,
        root_domain: r.root_domain,
        ghl_company_id: r.ghl_company_id,
        snapshot_id: r.snapshot_id,
        owner_first_name: r.owner_first_name,
        owner_last_name: r.owner_last_name,
        owner_email: r.owner_email,
        owner_phone: r.owner_phone,
        app_display_name: r.app_display_name,
        brand_name: r.brand_name,
        logo_url: r.logo_url,
        owner_location_id: r.owner_location_id,
        active_states: activeStates,
        total_subaccounts: totalSubaccounts,
        total_calls: calls ?? 0,
        total_impressions: impressions ?? 0,
        total_revenue: revenue ?? 0,
        total_leads: leads ?? 0,
        prev_calls: callsPrev,
        prev_impressions: impressionsPrev,
        prev_revenue: revenuePrev,
        prev_leads: leadsPrev,
        delta_pct_calls: callsDeltaPct,
        delta_pct_impressions: impressionsDeltaPct,
        delta_pct_revenue: revenueDeltaPct,
        delta_pct_leads: leadsDeltaPct,
      };
    });

    return NextResponse.json({
      ok: true,
      total: result.rowCount ?? 0,
      rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list tenants";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAgencyPermission(req, "agency.manage");
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as CreateTenantBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = s(body.name);
  const providedSlug = s(body.slug);
  const slug = slugify(providedSlug || name);
  const ownerLocationId = s(body.ownerLocationId);
  const snapshotId = s(body.snapshotId) || null;
  const companyId = s(body.companyId) || null;
  const twilioSid = s(body.twilioSid) || null;
  const twilioAuthToken = s(body.twilioAuthToken) || null;
  const mailgunApiKey = s(body.mailgunApiKey) || null;
  const mailgunDomain = s(body.mailgunDomain) || null;
  const googleCloudProjectId = s(body.googleCloudProjectId) || null;
  const googleServiceAccountEmail = s(body.googleServiceAccountEmail) || null;
  const googleServiceAccountKeyfilePath = s(body.googleServiceAccountKeyfilePath) || null;
  let googleServiceAccountJson: Record<string, unknown> | null = null;
  try {
    googleServiceAccountJson = parseOptionalJsonObject(body.googleServiceAccountJson);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid googleServiceAccountJson";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const googleSheetId = s(body.googleSheetId) || null;
  const gscProperty = s(body.gscProperty) || null;
  const ga4PropertyId = s(body.ga4PropertyId) || null;
  const ownerFirstName = s(body.ownerFirstName) || null;
  const ownerLastName = s(body.ownerLastName) || null;
  const ownerEmail = s(body.ownerEmail) || null;
  const ownerPhone = s(body.ownerPhone) || null;
  const timezone = s(body.timezone) || "UTC";
  const locale = s(body.locale) || "en-US";
  const currency = s(body.currency) || "USD";
  const rootDomain = s(body.rootDomain) || null;
  const appDisplayName = s(body.appDisplayName) || name || null;
  const brandName = s(body.brandName) || name || null;
  const logoUrl = s(body.logoUrl) || null;
  const adsAlertWebhookUrl = s(body.adsAlertWebhookUrl) || null;
  const adsAlertsEnabled = body.adsAlertsEnabled !== false;
  const adsAlertSmsEnabled = body.adsAlertSmsEnabled === true;
  const adsAlertSmsTo = s(body.adsAlertSmsTo) || null;

  if (!name) {
    return NextResponse.json({ ok: false, error: "Missing required field: name" }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Could not generate a valid slug from name/slug" },
      { status: 400 },
    );
  }
  if (!ownerLocationId) {
    return NextResponse.json(
      { ok: false, error: "Missing required field: ownerLocationId" },
      { status: 400 },
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orgInsert = await client.query<{ id: string }>(
      `
        insert into app.organizations (name, slug, status)
        values ($1, $2, 'active')
        returning id
      `,
      [name, slug],
    );
    const organizationId = orgInsert.rows[0]?.id;
    if (!organizationId) {
      throw new Error("Failed to create organization");
    }

    await client.query(
      `
        insert into app.organization_settings (
          organization_id, timezone, locale, currency, root_domain, ghl_company_id, snapshot_id, owner_first_name, owner_last_name, owner_email, owner_phone, app_display_name, brand_name, logo_url, google_service_account_json, ads_alert_webhook_url, ads_alerts_enabled, ads_alert_sms_enabled, ads_alert_sms_to
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
      `,
      [
        organizationId,
        timezone,
        locale,
        currency,
        rootDomain,
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

    const ownerConfig = {
      companyId,
      ownerProfile: {
        firstName: ownerFirstName,
        lastName: ownerLastName,
        email: ownerEmail,
        phone: ownerPhone,
      },
      twilio: {
        sid: twilioSid,
        authToken: twilioAuthToken,
      },
      mailgun: {
        apiKey: mailgunApiKey,
        domain: mailgunDomain,
      },
      alerts: {
        adsEnabled: adsAlertsEnabled,
        adsWebhookUrl: adsAlertWebhookUrl,
        adsSmsEnabled: adsAlertSmsEnabled,
        adsSmsTo: adsAlertSmsTo,
      },
      google: {
        cloudProjectId: googleCloudProjectId,
        serviceAccountEmail: googleServiceAccountEmail,
        serviceAccountKeyfilePath: googleServiceAccountKeyfilePath,
        serviceAccountJsonInDb: !!googleServiceAccountJson,
        sheetId: googleSheetId,
        gscProperty,
        ga4PropertyId,
      },
    };

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
          values
            (
              $1,
              'ghl',
              'owner',
              'connected',
              'api_key',
              $2,
              $3::jsonb,
              '{"note":"owner location for custom values and snapshots"}'::jsonb
            )
        `,
        [organizationId, ownerLocationId, JSON.stringify(ownerConfig)],
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
          values
            (
              $1,
              'custom',
              'owner',
              'connected',
              'api_key',
              $2,
              $3::jsonb,
              '{"note":"owner location (fallback provider=custom)"}'::jsonb
            )
        `,
        [organizationId, ownerLocationId, JSON.stringify(ownerConfig)],
      );
    }

    await client.query("COMMIT");

    const stateSeed = rootDomain
      ? await seedTenantStateFilesFromTemplates({
          db: pool,
          organizationId,
          rootDomain,
          source: "template_seed",
        }).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            ok: false,
            tenantId: organizationId,
            rootDomain: s(rootDomain),
            templateDir: "",
            templateFiles: 0,
            upserted: 0,
            message,
            errors: [message],
          };
        })
      : {
          ok: false,
          tenantId: organizationId,
          rootDomain: "",
          templateDir: "",
          templateFiles: 0,
          upserted: 0,
          message: "Tenant created without rootDomain; state template seed skipped.",
          errors: [],
        };

    return NextResponse.json(
      {
        ok: true,
        organization: {
          id: organizationId,
          name,
          slug,
          companyId,
          ownerFirstName,
          ownerLastName,
          ownerEmail,
          ownerPhone,
          timezone,
          locale,
          currency,
          snapshotId,
        },
        integration: {
          provider: "ghl",
          integrationKey: "owner",
          ownerLocationId,
          status: "connected",
        },
        stateSeed,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to create tenant";
    const isSlugConflict =
      message.includes("organizations_slug_uq") || message.includes("duplicate key");
    return NextResponse.json(
      {
        ok: false,
        error: isSlugConflict ? "Slug already exists. Try another slug." : message,
      },
      { status: isSlugConflict ? 409 : 500 },
    );
  } finally {
    client.release();
  }
}
