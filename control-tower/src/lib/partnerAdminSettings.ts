import { getDbPool } from "@/lib/db";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";

const DEFAULT_ADMIN_BASE_URL = "https://admin.mydripnurse.com";

function s(value: unknown) {
  return String(value ?? "").trim();
}

function validatedUrl(value: unknown, label: string, options?: { required?: boolean }) {
  const raw = s(value);
  if (!raw) {
    if (options?.required) throw new Error(`${label} is required.`);
    return "";
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && isLocal)) {
    throw new Error(`${label} must use HTTPS.`);
  }

  return url.toString().replace(/\/$/, "");
}

type SettingsRow = {
  organization_id: string;
  organization_name: string;
  form_key: string;
  enabled: boolean;
  applicant_received_webhook_url: string | null;
  admin_notification_webhook_url: string | null;
  admin_base_url: string | null;
  updated_at: string;
};

export type PartnerAdminNotificationSettings = {
  tenantId: string;
  tenantName: string;
  formKey: string;
  enabled: boolean;
  applicantReceivedWebhookConfigured: boolean;
  adminNotificationWebhookConfigured: boolean;
  adminBaseUrl: string;
  updatedAt: string;
};

function safeSettings(row: SettingsRow): PartnerAdminNotificationSettings {
  return {
    tenantId: row.organization_id,
    tenantName: row.organization_name,
    formKey: row.form_key,
    enabled: Boolean(row.enabled),
    applicantReceivedWebhookConfigured: Boolean(s(row.applicant_received_webhook_url)),
    adminNotificationWebhookConfigured: Boolean(s(row.admin_notification_webhook_url)),
    adminBaseUrl: s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

const SETTINGS_SELECT = `
  select c.organization_id::text,
         o.name as organization_name,
         c.form_key,
         c.enabled,
         c.applicant_received_webhook_url,
         c.admin_notification_webhook_url,
         c.admin_base_url,
         c.updated_at::text
    from app.staff_form_configs c
    join app.organizations o on o.id = c.organization_id
`;

export async function listPartnerAdminNotificationSettings() {
  await ensureStaffSchema();
  const query = await getDbPool().query<SettingsRow>(`${SETTINGS_SELECT} order by o.name asc`);
  return query.rows.map(safeSettings);
}

export async function savePartnerAdminNotificationSettings(input: {
  tenantId: string;
  applicantReceivedWebhookUrl?: string;
  adminNotificationWebhookUrl?: string;
  adminBaseUrl: string;
  clearApplicantWebhook?: boolean;
  clearAdminWebhook?: boolean;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");

  const applicantWebhook = validatedUrl(
    input.applicantReceivedWebhookUrl,
    "Applicant received webhook",
  );
  const adminWebhook = validatedUrl(
    input.adminNotificationWebhookUrl,
    "Admin notification webhook",
  );
  const adminBaseUrl = validatedUrl(input.adminBaseUrl, "Admin base URL", { required: true });

  const query = await getDbPool().query<SettingsRow>(
    `update app.staff_form_configs c
        set applicant_received_webhook_url = case
              when $5::boolean then null
              when nullif($2::text, '') is not null then $2::text
              else c.applicant_received_webhook_url
            end,
            admin_notification_webhook_url = case
              when $6::boolean then null
              when nullif($3::text, '') is not null then $3::text
              else c.admin_notification_webhook_url
            end,
            admin_base_url = $4,
            updated_at = now()
       from app.organizations o
      where c.organization_id = $1::uuid
        and o.id = c.organization_id
      returning c.organization_id::text,
                o.name as organization_name,
                c.form_key,
                c.enabled,
                c.applicant_received_webhook_url,
                c.admin_notification_webhook_url,
                c.admin_base_url,
                c.updated_at::text`,
    [
      tenantId,
      applicantWebhook,
      adminWebhook,
      adminBaseUrl,
      Boolean(input.clearApplicantWebhook),
      Boolean(input.clearAdminWebhook),
    ],
  );

  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");
  return safeSettings(row);
}

export type PartnerAdminWebhookTarget = "applicant_received" | "admin_notification";

export async function testPartnerAdminNotificationWebhook(input: {
  tenantId: string;
  target: PartnerAdminWebhookTarget;
}) {
  await ensureStaffSchema();
  const tenantId = s(input.tenantId);
  if (!tenantId) throw new Error("Tenant ID is required.");
  if (input.target !== "applicant_received" && input.target !== "admin_notification") {
    throw new Error("Invalid webhook target.");
  }

  const query = await getDbPool().query<SettingsRow>(
    `${SETTINGS_SELECT} where c.organization_id = $1::uuid limit 1`,
    [tenantId],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Partner form configuration was not found for this tenant.");

  const webhookUrl = input.target === "applicant_received"
    ? s(row.applicant_received_webhook_url)
    : s(row.admin_notification_webhook_url);
  if (!webhookUrl) throw new Error("This webhook has not been configured yet.");

  const submittedAt = new Date().toISOString();
  const adminBaseUrl = s(row.admin_base_url) || DEFAULT_ADMIN_BASE_URL;
  const payload = input.target === "applicant_received"
    ? {
        event: "partner.application.received.test",
        success: true,
        test: true,
        submittedAt,
        applicant: {
          firstName: "Test",
          lastName: "Applicant",
          email: "test-applicant@mydripnurse.com",
          phone: "+1 555 010 0100",
          company: "My Drip Nurse Test",
        },
        coverage: [{ state: "Florida", county: "Orange County", locationId: "test-location-id" }],
      }
    : {
        event: "partner.application.admin_notification.test",
        success: true,
        test: true,
        submittedAt,
        applicant: {
          fullName: "Test Applicant",
          email: "test-applicant@mydripnurse.com",
          company: "My Drip Nurse Test",
        },
        requestedCounties: ["Orange County, Florida"],
        adminProfileUrl: `${adminBaseUrl}/applications/test-application-id`,
      };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const responseText = (await response.text()).slice(0, 800);
    if (!response.ok) {
      throw new Error(`Webhook test failed with HTTP ${response.status}.`);
    }
    return {
      ok: true,
      target: input.target,
      status: response.status,
      response: responseText,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Webhook test timed out after 10 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
