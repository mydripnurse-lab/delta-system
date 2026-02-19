import { getDbPool } from "./db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type OwnerConfig = {
  google?: {
    sheetId?: string;
    countyTab?: string;
    cityTab?: string;
    headersTab?: string;
    headersRange?: string;
    callReportTab?: string;
  };
};

export type TenantSheetConfig = {
  spreadsheetId: string;
  countyTab: string;
  cityTab: string;
  headersTab: string;
  headersRange: string;
  callReportTab: string;
};

export async function getTenantSheetConfig(tenantId: string): Promise<TenantSheetConfig> {
  const id = s(tenantId);
  if (!id) throw new Error("Missing tenantId");

  const pool = getDbPool();
  const q = await pool.query<{
    config: OwnerConfig | null;
  }>(
    `
      select config
      from app.organization_integrations
      where organization_id = $1
        and provider in ('ghl', 'custom')
        and integration_key = 'owner'
      order by updated_at desc
      limit 1
    `,
    [id],
  );

  const cfg = (q.rows[0]?.config || null) as OwnerConfig | null;
  const g = cfg?.google || {};
  const spreadsheetId = s(g.sheetId);

  if (!spreadsheetId) {
    throw new Error(
      "Missing tenant Google Sheet ID. Set integration config google.sheetId in organization_integrations (owner).",
    );
  }

  return {
    spreadsheetId,
    countyTab: s(g.countyTab) || "Counties",
    cityTab: s(g.cityTab) || "Cities",
    headersTab: s(g.headersTab) || "Headers",
    headersRange: s(g.headersRange) || "A:ZZ",
    callReportTab: s(g.callReportTab) || "Call Report",
  };
}
