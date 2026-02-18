import { google } from "googleapis";
import { getDbPool } from "@/lib/db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type ServiceAccountJson = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  [k: string]: unknown;
};

export async function getTenantGoogleServiceAccountJson(
  tenantId: string,
): Promise<ServiceAccountJson> {
  const id = s(tenantId);
  if (!id) throw new Error("Missing tenantId");

  const pool = getDbPool();
  const q = await pool.query<{ google_service_account_json: ServiceAccountJson | null }>(
    `
      select google_service_account_json
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [id],
  );

  const json = (q.rows[0]?.google_service_account_json || null) as ServiceAccountJson | null;
  if (!json || typeof json !== "object") {
    throw new Error("Missing google_service_account_json in tenant settings.");
  }
  if (!s(json.client_email) || !s(json.private_key)) {
    throw new Error("Invalid google_service_account_json: missing client_email/private_key.");
  }
  return json;
}

export async function getTenantGoogleAuth(
  tenantId: string,
  scopes: string[],
) {
  const creds = await getTenantGoogleServiceAccountJson(tenantId);
  const privateKey = s(creds.private_key).replace(/\\n/g, "\n");
  const email = s(creds.client_email);
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes,
  });
}

