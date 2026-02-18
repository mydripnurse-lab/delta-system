import { google } from "googleapis";
import { getDbPool } from "./db";
import { getTenantGoogleAuth } from "./tenantGoogleAuth";

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

export async function getTenantSheetsApi(tenantId: string) {
  const auth = await getTenantGoogleAuth(tenantId, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
  return google.sheets({ version: "v4", auth });
}

export async function loadTenantSheetTabIndex(opts: {
  tenantId: string;
  spreadsheetId: string;
  sheetName: string;
  range?: string;
}) {
  const tenantId = s(opts.tenantId);
  const spreadsheetId = s(opts.spreadsheetId);
  const sheetName = s(opts.sheetName);
  const range = s(opts.range) || "A:ZZ";

  if (!tenantId) throw new Error("Missing tenantId");
  if (!spreadsheetId) throw new Error("Missing spreadsheetId");
  if (!sheetName) throw new Error("Missing sheetName");

  const sheets = await getTenantSheetsApi(tenantId);
  const a1 = `${sheetName}!${range}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const values = (res.data.values || []) as unknown[][];
  const headers = (values[0] || []).map((h) => s(h));
  const rows = values.slice(1);
  const headerMap = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h) headerMap.set(h, i);
  });

  return {
    headers,
    rows,
    headerMap,
    sheetName,
    range,
    rowCount: rows.length,
  };
}
