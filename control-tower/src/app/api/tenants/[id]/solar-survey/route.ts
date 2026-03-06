import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { getTenantIntegration, upsertTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "solar_survey_builder";
const KEY_NAME = "config_v1";
const INTEGRATION_PROVIDER = "custom";
const INTEGRATION_KEY = "solar_survey";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function kebabToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input).toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
  return fallback;
}

function normalizeNum(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeFloat(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeButtonPosition(input: unknown): "left" | "center" | "right" {
  const v = s(input).toLowerCase();
  if (v === "left" || v === "right") return v;
  return "center";
}

function normalizeFontKey(input: unknown, fallback: string) {
  const key = s(input).toLowerCase();
  if (!key) return fallback;
  return key.replace(/[^a-z0-9_]+/g, "_");
}

function normalizePayload(input: Record<string, unknown> | null | undefined) {
  return {
    id: "default",
    name: s(input?.name) || "Solar Survey",
    folder: kebabToken(s(input?.folder) || "solar-survey") || "solar-survey",
    pageSlug: kebabToken(s(input?.pageSlug) || "solar-survey-widget") || "solar-survey-widget",
    query: s(input?.query) || "embed=1",
    buttonText: s(input?.buttonText) || "Get Solar Estimate",
    buttonPosition: normalizeButtonPosition(input?.buttonPosition),
    modalTitle: s(input?.modalTitle) || "What Will Your Solar System Cost?",
    modalSubtitle:
      s(input?.modalSubtitle) || "Enter your street address to get an accurate solar estimate instantly.",
    addressLabel: s(input?.addressLabel) || "Property address",
    addressPlaceholder: s(input?.addressPlaceholder) || "Ex: 1157 Palo Alto St SE, Palm Bay, FL",
    stepAddressLabel: s(input?.stepAddressLabel) || "Address",
    stepInfoLabel: s(input?.stepInfoLabel) || "Info",
    stepPricingLabel: s(input?.stepPricingLabel) || "Pricing",
    nextLabel: s(input?.nextLabel) || "Next Step",
    submitLabel: s(input?.submitLabel) || "See My Prices",
    themeAccent: normalizeColor(input?.themeAccent, "#2f6df6"),
    themeAccentSecondary: normalizeColor(input?.themeAccentSecondary, "#1ecf98"),
    themeSurface: normalizeColor(input?.themeSurface, "#0f1219"),
    modalFontKey: normalizeFontKey(input?.modalFontKey, "manrope"),
    buttonFontKey: normalizeFontKey(input?.buttonFontKey, "montserrat"),
    modalTitleFontSize: normalizeNum(input?.modalTitleFontSize, 64, 28, 100),
    modalBodyFontSize: normalizeNum(input?.modalBodyFontSize, 15, 12, 30),
    pricingUtilityRate: normalizeFloat(input?.pricingUtilityRate, 0.27, 0.05, 2),
    pricingOffsetTarget: normalizeFloat(input?.pricingOffsetTarget, 0.95, 0.4, 1.5),
    pricingPerformanceRatio: normalizeFloat(input?.pricingPerformanceRatio, 0.82, 0.4, 1.2),
    pricingSystemCostPerKw: normalizeFloat(input?.pricingSystemCostPerKw, 3050, 500, 20000),
    pricingBatteryCost: normalizeFloat(input?.pricingBatteryCost, 14900, 1000, 50000),
    pricingMonthlyFactor: normalizeFloat(input?.pricingMonthlyFactor, 0.0068, 0.001, 0.1),
    pricingBatteryKwPerUnit: normalizeFloat(input?.pricingBatteryKwPerUnit, 5, 1, 20),
    pricingMinSystemKw: normalizeFloat(input?.pricingMinSystemKw, 4, 1, 30),
    pricingSystemSizingDivisor: normalizeFloat(input?.pricingSystemSizingDivisor, 30, 5, 120),
    embedButtonGradientFrom: normalizeColor(input?.embedButtonGradientFrom, "#2f6df6"),
    embedButtonGradientTo: normalizeColor(input?.embedButtonGradientTo, "#1ecf98"),
    embedButtonTextColor: normalizeColor(input?.embedButtonTextColor, "#ffffff"),
    embedButtonRadius: normalizeNum(input?.embedButtonRadius, 999, 0, 999),
    embedButtonPaddingY: normalizeNum(input?.embedButtonPaddingY, 12, 6, 40),
    embedButtonPaddingX: normalizeNum(input?.embedButtonPaddingX, 18, 8, 80),
    embedButtonFontSize: normalizeNum(input?.embedButtonFontSize, 14, 11, 32),
    embedButtonFontWeight: normalizeNum(input?.embedButtonFontWeight, 700, 400, 900),
    embedButtonShadow: normalizeNum(input?.embedButtonShadow, 28, 0, 80),
  };
}

function normalizeIntegrations(input: Record<string, unknown> | null | undefined) {
  return {
    googleMapsApiKey: s(input?.googleMapsApiKey),
    googleSolarApiKey: s(input?.googleSolarApiKey),
    webhookUrl: s(input?.webhookUrl),
  };
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

async function readBuilderPayload(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ key_value: string | null; updated_at: string | null }>(
    `
      select key_value, updated_at
      from app.organization_custom_values
      where organization_id = $1::uuid
        and provider = $2
        and scope = $3
        and module = $4
        and key_name = $5
      limit 1
    `,
    [tenantId, PROVIDER, SCOPE, MODULE, KEY_NAME],
  );
  const row = q.rows[0];
  if (!row) return { payload: normalizePayload(null), updatedAt: "" };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { payload: normalizePayload(parsed), updatedAt: s(row.updated_at) };
}

async function readIntegrationPayload(tenantId: string) {
  const row = await getTenantIntegration(tenantId, INTEGRATION_PROVIDER, INTEGRATION_KEY);
  const cfg = row?.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
  return normalizeIntegrations(cfg);
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const [{ payload, updatedAt }, integrations] = await Promise.all([
      readBuilderPayload(tenantId),
      readIntegrationPayload(tenantId),
    ]);
    return NextResponse.json({ ok: true, payload, integrations, updatedAt });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read solar survey settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = normalizePayload(
      body?.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : body,
    );
    const integrations = normalizeIntegrations(
      body?.integrations && typeof body.integrations === "object"
        ? (body.integrations as Record<string, unknown>)
        : null,
    );
    const pool = getDbPool();

    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Solar Survey builder settings'
        )
        on conflict (organization_id, provider, scope, module, key_name)
        do update set
          key_value = excluded.key_value,
          value_type = excluded.value_type,
          is_secret = excluded.is_secret,
          is_active = excluded.is_active,
          description = excluded.description,
          updated_at = now()
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, KEY_NAME, JSON.stringify(payload)],
    );

    await upsertTenantIntegration({
      organizationId: tenantId,
      provider: INTEGRATION_PROVIDER,
      integrationKey: INTEGRATION_KEY,
      status: "connected",
      authType: "api_key",
      config: integrations,
      metadata: { module: "solar_survey" },
      lastError: null,
    });

    return NextResponse.json({ ok: true, payload, integrations });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save solar survey settings" },
      { status: 500 },
    );
  }
}
