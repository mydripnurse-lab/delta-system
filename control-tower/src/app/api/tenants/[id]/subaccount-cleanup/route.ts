import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";
import { getAgencyAccessTokenOrThrow } from "@/lib/ghlHttp";
import {
  getTenantSheetConfig,
  getTenantSheetsApi,
  loadTenantSheetTabIndex,
} from "@/lib/tenantSheets";

export const runtime = "nodejs";

type Kind = "counties" | "cities";
type Ctx = { params: Promise<{ id: string }> };

function s(value: unknown) {
  return String(value ?? "").trim();
}

function isTrue(value: unknown) {
  return ["true", "1", "yes", "y", "active", "activated", "complete", "completed", "done"].includes(
    s(value).toLowerCase(),
  );
}

function columnLetter(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function sheetRangeName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function cell(row: unknown[], headerMap: Map<string, number>, header: string) {
  const index = headerMap.get(header);
  return index === undefined ? "" : s(row[index]);
}

function rowLabel(kind: Kind, row: unknown[], headerMap: Map<string, number>) {
  const county = cell(row, headerMap, "County");
  const city = cell(row, headerMap, "City");
  return kind === "cities" ? `${city || "City"}, ${county || "County"}` : county || "County";
}

function locationFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {} as Record<string, unknown>;
  const root = payload as Record<string, unknown>;
  const location = root.location;
  if (location && typeof location === "object" && !Array.isArray(location)) {
    return location as Record<string, unknown>;
  }
  return root;
}

async function agencyRequest(tenantId: string, locationId: string, method: "GET" | "DELETE") {
  const token = await getAgencyAccessTokenOrThrow({ tenantId, integrationKey: "owner" });
  const response = await fetch(`https://services.leadconnectorhq.com/locations/${encodeURIComponent(locationId)}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function sheetContext(tenantId: string, kind: Kind) {
  const config = await getTenantSheetConfig(tenantId);
  const sheetName = kind === "counties" ? config.countyTab : config.cityTab;
  const tab = await loadTenantSheetTabIndex({
    tenantId,
    spreadsheetId: config.spreadsheetId,
    sheetName,
    range: "A:ZZ",
  });
  return { config, sheetName, tab };
}

function findTargetRow(
  tab: Awaited<ReturnType<typeof loadTenantSheetTabIndex>>,
  state: string,
  locationId: string,
) {
  const stateWanted = state.toLowerCase();
  const locationWanted = locationId.toLowerCase();
  const rowIndex = tab.rows.findIndex((row) =>
    cell(row, tab.headerMap, "State").toLowerCase() === stateWanted &&
    cell(row, tab.headerMap, "Location Id").toLowerCase() === locationWanted,
  );
  if (rowIndex < 0) return null;
  return { row: tab.rows[rowIndex], rowNumber: rowIndex + 2 };
}

export async function POST(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params;
  const auth = await requireTenantPermission(request, tenantId, "tenant.delete");
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const state = s(body.state);
    const kind = s(body.kind) as Kind;
    const locationIds = Array.isArray(body.locationIds)
      ? Array.from(new Set(body.locationIds.map(s).filter(Boolean))).slice(0, 500)
      : [];
    const cascadeLocationIds = new Set(
      Array.isArray(body.cascadeLocationIds) ? body.cascadeLocationIds.map(s).filter(Boolean) : locationIds,
    );
    if (!state || !["counties", "cities"].includes(kind) || locationIds.length === 0) {
      return NextResponse.json({ error: "state, kind and locationIds are required" }, { status: 400 });
    }

    const { tab } = await sheetContext(tenantId, kind);
    const cityTab = kind === "counties" ? (await sheetContext(tenantId, "cities")).tab : null;
    const results = [];
    for (const locationId of locationIds) {
      const target = findTargetRow(tab, state, locationId);
      if (!target) {
        results.push({ locationId, exists: false, verified: false, error: "Location ID is not in this state/tab." });
        continue;
      }
      const active = isTrue(cell(target.row, tab.headerMap, "Domain Created")) || isTrue(cell(target.row, tab.headerMap, "Active"));
      const accountName = cell(target.row, tab.headerMap, "Account Name");
      const label = rowLabel(kind, target.row, tab.headerMap);
      if (kind === "counties" && cityTab) {
        const county = cell(target.row, tab.headerMap, "County").toLowerCase();
        const childAccounts = cityTab.rows
          .filter((row) =>
            cell(row, cityTab.headerMap, "State").toLowerCase() === state.toLowerCase() &&
            cell(row, cityTab.headerMap, "County").toLowerCase() === county,
          )
          .map((row) => ({
            locationId: cell(row, cityTab.headerMap, "Location Id"),
            label: rowLabel("cities", row, cityTab.headerMap),
            accountName: cell(row, cityTab.headerMap, "Account Name"),
            active:
              isTrue(cell(row, cityTab.headerMap, "Domain Created")) ||
              isTrue(cell(row, cityTab.headerMap, "Active")),
          }))
          .filter((child) => !!child.locationId)
          .map((child) => ({
            ...child,
            selected: cascadeLocationIds.has(child.locationId),
          }));
        const unselectedChildren = childAccounts.filter((child) => !child.selected);
        if (unselectedChildren.length > 0) {
          results.push({
            locationId,
            label,
            accountName,
            active,
            exists: true,
            verified: false,
            error: `${unselectedChildren.length} child city account(s) must be selected and deleted first.`,
            childAccounts,
            rowNumber: target.rowNumber,
          });
          continue;
        }
      }
      try {
        const { response, data } = await agencyRequest(tenantId, locationId, "GET");
        if (response.status === 404) {
          results.push({ locationId, label, accountName, active, exists: false, verified: true, ghlName: "", rowNumber: target.rowNumber });
          continue;
        }
        if (!response.ok) {
          results.push({ locationId, label, accountName, active, exists: false, verified: false, error: `GHL ${response.status}`, rowNumber: target.rowNumber });
          continue;
        }
        const location = locationFromPayload(data);
        results.push({
          locationId,
          label,
          accountName,
          active,
          exists: true,
          verified: true,
          ghlName: s(location.name || location.businessName),
          rowNumber: target.rowNumber,
        });
      } catch (error) {
        results.push({
          locationId,
          label,
          accountName,
          active,
          exists: false,
          verified: false,
          error: error instanceof Error ? error.message : "Unable to verify GHL account",
          rowNumber: target.rowNumber,
        });
      }
    }

    return NextResponse.json({ ok: true, state, kind, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to preview subaccounts" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: tenantId } = await ctx.params;
  const auth = await requireTenantPermission(request, tenantId, "tenant.delete");
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const state = s(body.state);
    const kind = s(body.kind) as Kind;
    const locationId = s(body.locationId);
    const confirmation = s(body.confirmation);
    const includeActive = body.includeActive === true;
    if (!state || !["counties", "cities"].includes(kind) || !locationId) {
      return NextResponse.json({ error: "state, kind and locationId are required" }, { status: 400 });
    }
    if (confirmation.toLowerCase() !== state.toLowerCase()) {
      return NextResponse.json({ error: `Type ${state} to confirm this cleanup.` }, { status: 409 });
    }

    const { config, sheetName, tab } = await sheetContext(tenantId, kind);
    const target = findTargetRow(tab, state, locationId);
    if (!target) {
      return NextResponse.json({ error: "This Location ID is no longer present in the selected state/tab." }, { status: 404 });
    }
    const active = isTrue(cell(target.row, tab.headerMap, "Domain Created")) || isTrue(cell(target.row, tab.headerMap, "Active"));
    if (active && !includeActive) {
      return NextResponse.json({ error: "Active account blocked. Enable Include active accounts to delete it." }, { status: 409 });
    }
    if (kind === "counties") {
      const cityTab = (await sheetContext(tenantId, "cities")).tab;
      const county = cell(target.row, tab.headerMap, "County").toLowerCase();
      const remainingChildren = cityTab.rows.filter((row) =>
        cell(row, cityTab.headerMap, "State").toLowerCase() === state.toLowerCase() &&
        cell(row, cityTab.headerMap, "County").toLowerCase() === county &&
        !!cell(row, cityTab.headerMap, "Location Id"),
      );
      if (remainingChildren.length > 0) {
        return NextResponse.json(
          { error: `${remainingChildren.length} child city account(s) still exist. Delete them before this county.` },
          { status: 409 },
        );
      }
    }

    const before = {
      rowNumber: target.rowNumber,
      label: rowLabel(kind, target.row, tab.headerMap),
      accountName: cell(target.row, tab.headerMap, "Account Name"),
      locationId,
      status: cell(target.row, tab.headerMap, "Status"),
      domainCreated: cell(target.row, tab.headerMap, "Domain Created"),
    };

    const deletion = await agencyRequest(tenantId, locationId, "DELETE");
    const alreadyAbsent = deletion.response.status === 404;
    if (!deletion.response.ok && !alreadyAbsent) {
      await writeAuditLog(getDbPool(), {
        organizationId: tenantId,
        actorUserId: auth.user.id,
        actorLabel: auth.user.email,
        action: "ghl.subaccount_cleanup_failed",
        entityType: "ghl_location",
        entityId: locationId,
        severity: "critical",
        payload: { state, kind, before, status: deletion.response.status, response: deletion.data },
      });
      return NextResponse.json(
        { error: `GHL refused deletion (${deletion.response.status}).`, details: deletion.data },
        { status: 502 },
      );
    }

    const resetHeaders = ["Location Id", "Account Name", "Status", "Domain Created"];
    const data = resetHeaders.flatMap((header) => {
      const index = tab.headerMap.get(header);
      if (index === undefined) return [];
      return [{
        range: `${sheetRangeName(sheetName)}!${columnLetter(index)}${target.rowNumber}`,
        values: [[header === "Status" || header === "Domain Created" ? "FALSE" : ""]],
      }];
    });
    const sheets = await getTenantSheetsApi(tenantId);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.spreadsheetId,
      requestBody: { valueInputOption: "USER_ENTERED", data },
    });

    // A deleted/reset account is eligible to be created again. Close any stale
    // bot failure so the Sheet row returns to Pending instead of remaining red.
    const pool = getDbPool();
    const resolvedFailures = await pool.query(
      `
        update app.domain_bot_failed_runs
        set
          status = 'resolved',
          resolved_at = now(),
          resolved_by = $1,
          updated_at = now()
        where tenant_id = $2
          and kind = $3
          and loc_id = $4
          and status = 'open'
        returning id
      `,
      [auth.user.id, tenantId, kind, locationId],
    );

    // The creation worker keeps a durable resume record. If it is not reset,
    // a later run can restore the deleted GHL Location ID back into the Sheet.
    const resetCreationState = await pool.query(
      `
        update app.run_delta_item_state
        set
          status = 'pending',
          run_id = null,
          locked_at = null,
          ghl_location_id = null,
          ghl_account_name = null,
          last_error = null,
          last_note = 'reset after GHL subaccount deletion',
          updated_at = now()
        where tenant_id = $1
          and ghl_location_id = $2
        returning item_key
      `,
      [tenantId, locationId],
    );

    await writeAuditLog(pool, {
      organizationId: tenantId,
      actorUserId: auth.user.id,
      actorLabel: auth.user.email,
      action: alreadyAbsent ? "ghl.subaccount_already_absent_reset" : "ghl.subaccount_deleted_and_reset",
      entityType: "ghl_location",
      entityId: locationId,
      severity: "critical",
      payload: {
        state,
        kind,
        before,
        alreadyAbsent,
        sheetName,
        resetHeaders,
        resolvedFailureRecords: resolvedFailures.rowCount ?? 0,
        resetCreationRecords: resetCreationState.rowCount ?? 0,
      },
    });

    return NextResponse.json({
      ok: true,
      locationId,
      label: before.label,
      alreadyAbsent,
      sheetReset: true,
      resolvedFailureRecords: resolvedFailures.rowCount ?? 0,
      resetCreationRecords: resetCreationState.rowCount ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete subaccount" },
      { status: 500 },
    );
  }
}
