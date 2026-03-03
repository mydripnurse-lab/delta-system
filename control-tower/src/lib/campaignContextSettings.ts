import { getDbPool } from "@/lib/db";

export type CampaignContextSettings = {
  businessName: string;
  brandVoice: string;
  industry: string;
  primaryOffer: string;
  targetAudience: string;
  serviceArea: string;
  primaryGoal: string;
  complianceNotes: string;
  internalProjectName: string;
  excludeInternalProjectNameFromAds: boolean;
  defaultBaseUrl: string;
};

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "campaign_context";
const KEY_NAME = "config_v1";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isTrue(v: unknown) {
  const x = norm(v);
  return x === "true" || x === "1" || x === "yes" || x === "y" || x === "active";
}

function safeUrl(raw: string) {
  const x = s(raw);
  if (!x) return "";
  if (/^https?:\/\//i.test(x)) return x;
  return `https://${x}`;
}

export const DEFAULT_CAMPAIGN_CONTEXT_SETTINGS: CampaignContextSettings = {
  businessName: "My Drip Nurse",
  brandVoice: "professional, friendly, trustworthy",
  industry: "Mobile IV Therapy",
  primaryOffer: "At-home mobile IV therapy",
  targetAudience: "Adults looking for hydration, recovery, immunity support, and wellness IV services",
  serviceArea: "United States and Puerto Rico",
  primaryGoal: "Increase qualified leads, booked appointments, and profitable revenue growth",
  complianceNotes: "Avoid medical claims or guaranteed outcomes.",
  internalProjectName: "Delta System",
  excludeInternalProjectNameFromAds: true,
  defaultBaseUrl: "https://mydripnurse.com",
};

export function normalizeCampaignContextSettings(
  input: Record<string, unknown> | null | undefined,
): CampaignContextSettings {
  return {
    businessName: s(input?.businessName) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.businessName,
    brandVoice: s(input?.brandVoice) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.brandVoice,
    industry: s(input?.industry) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.industry,
    primaryOffer: s(input?.primaryOffer) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.primaryOffer,
    targetAudience: s(input?.targetAudience) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.targetAudience,
    serviceArea: s(input?.serviceArea) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.serviceArea,
    primaryGoal: s(input?.primaryGoal) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.primaryGoal,
    complianceNotes: s(input?.complianceNotes) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.complianceNotes,
    internalProjectName: s(input?.internalProjectName) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.internalProjectName,
    excludeInternalProjectNameFromAds:
      input && Object.prototype.hasOwnProperty.call(input, "excludeInternalProjectNameFromAds")
        ? isTrue(input.excludeInternalProjectNameFromAds)
        : DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.excludeInternalProjectNameFromAds,
    defaultBaseUrl: safeUrl(s(input?.defaultBaseUrl)) || DEFAULT_CAMPAIGN_CONTEXT_SETTINGS.defaultBaseUrl,
  };
}

export async function readTenantCampaignContextSettings(tenantId: string) {
  const id = s(tenantId);
  if (!id) return { exists: false, payload: DEFAULT_CAMPAIGN_CONTEXT_SETTINGS, updatedAt: "" };

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
        and is_active = true
      limit 1
    `,
    [id, PROVIDER, SCOPE, MODULE, KEY_NAME],
  );
  const row = q.rows[0];
  if (!row) return { exists: false, payload: DEFAULT_CAMPAIGN_CONTEXT_SETTINGS, updatedAt: "" };

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  return {
    exists: true,
    payload: normalizeCampaignContextSettings(parsed),
    updatedAt: s(row.updated_at),
  };
}

export async function writeTenantCampaignContextSettings(
  tenantId: string,
  input: Record<string, unknown> | null | undefined,
) {
  const id = s(tenantId);
  if (!id) throw new Error("Missing tenant id");

  const payload = normalizeCampaignContextSettings(input);
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_custom_values (
        organization_id, provider, scope, module, key_name,
        key_value, value_type, is_secret, is_active, description
      ) values (
        $1::uuid, $2, $3, $4, $5,
        $6, 'json', false, true, 'Campaign Factory context settings'
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
    [id, PROVIDER, SCOPE, MODULE, KEY_NAME, JSON.stringify(payload)],
  );

  return payload;
}
