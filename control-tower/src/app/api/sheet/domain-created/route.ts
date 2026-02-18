import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getTenantGoogleAuth } from "@/lib/tenantGoogleAuth";
import { getTenantSheetConfig } from "@/lib/tenantSheets";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}

function colToLetter(colIndex0: number) {
    let n = colIndex0 + 1;
    let out = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        out = String.fromCharCode(65 + r) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
}

async function getSheetsClient(tenantId: string) {
    const auth = await getTenantGoogleAuth(tenantId, [
        "https://www.googleapis.com/auth/spreadsheets",
    ]);
    return google.sheets({ version: "v4", auth });
}

async function findAndUpdateDomainCreated(opts: {
    sheets: any;
    spreadsheetId: string;
    sheetName: string;
    locId: string;
    value: string; // "TRUE" | "FALSE"
}) {
    const { sheets, spreadsheetId, sheetName, locId, value } = opts;

    const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:AZ`,
        majorDimension: "ROWS",
    });

    const values: any[][] = getRes.data.values || [];
    if (!values.length) throw new Error(`Sheet "${sheetName}" has no data`);

    const headers = (values[0] || []).map((h) => s(h));
    const idxLoc = headers.findIndex((h) => h === "Location Id");
    if (idxLoc < 0) throw new Error(`Missing header "Location Id" in ${sheetName}`);

    const idxDomainCreated = headers.findIndex((h) => h === "Domain Created");
    if (idxDomainCreated < 0) throw new Error(`Missing header "Domain Created" in ${sheetName}`);

    let foundRowNumber = -1; // 1-based
    for (let i = 1; i < values.length; i++) {
        const row = values[i] || [];
        const rowLoc = s(row[idxLoc]);
        if (rowLoc && rowLoc === locId) {
            foundRowNumber = i + 1;
            break;
        }
    }

    if (foundRowNumber < 0) return null;

    const colLetter = colToLetter(idxDomainCreated);
    const a1 = `${sheetName}!${colLetter}${foundRowNumber}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: a1,
        valueInputOption: "RAW",
        requestBody: { values: [[value]] },
    });

    return { sheetName, rowNumber: foundRowNumber, a1 };
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({} as any));
        const locId = s(body?.locId);
        const kind = s(body?.kind); // "counties" | "cities" | ""
        const tenantId = s(body?.tenantId);
        const valueBool = body?.value;

        if (!locId) {
            return NextResponse.json({ error: "Missing locId" }, { status: 400 });
        }
        if (!tenantId) {
            return NextResponse.json(
                { error: "Missing tenantId (Google auth is tenant-scoped)." },
                { status: 400 },
            );
        }

        const value =
            typeof valueBool === "boolean" ? (valueBool ? "TRUE" : "FALSE") : "TRUE";

        const sheets = await getSheetsClient(tenantId);
        const cfg = await getTenantSheetConfig(tenantId);

        const targets =
            kind === "counties"
                ? [cfg.countyTab]
                : kind === "cities"
                    ? [cfg.cityTab]
                    : [cfg.countyTab, cfg.cityTab];

        for (const sheetName of targets) {
            const updated = await findAndUpdateDomainCreated({
                sheets,
                spreadsheetId: cfg.spreadsheetId,
                sheetName,
                locId,
                value,
            });

            if (updated) {
                return NextResponse.json({ ok: true, ...updated, locId, value });
            }
        }

        return NextResponse.json(
            { error: `locId not found in ${targets.join(" or ")}: ${locId}` },
            { status: 404 },
        );
    } catch (e: any) {
        console.error("POST /api/sheet/domain-created failed:", e);
        return NextResponse.json(
            { error: s(e?.message) || "Unknown error" },
            { status: 500 },
        );
    }
}
