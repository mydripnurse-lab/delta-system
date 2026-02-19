import { google } from "googleapis";
import { getTenantGoogleAuth } from "./tenantGoogleAuth";
import { getTenantSheetConfig, type TenantSheetConfig } from "./tenantSheetConfig";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export { getTenantSheetConfig, type TenantSheetConfig };

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
