// scripts/src/test-sheets-read.js
import "dotenv/config";
import { loadSheetIndex } from "../../../services/sheetsClient.js";

async function main() {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = process.env.GOOGLE_SHEET_TAB;

    const idx = await loadSheetIndex({
        spreadsheetId,
        sheetName,
        range: "A:Z",
        accountNameHeader: "Account Name",
        locationIdHeader: "Location Id",
    });

    console.log("✅ Sheet loaded:");
    console.log("Sheet:", idx.sheetName);
    console.log("Headers:", idx.headers.length);
    console.log("Rows:", idx.rows.length);
    console.log("Indexed by Account Name:", idx.mapByAccountName.size);

    // sample
    const firstKey = idx.mapByAccountName.keys().next().value;
    console.log("Sample key:", firstKey);
    console.log("Sample rowInfo:", idx.mapByAccountName.get(firstKey));
}

main().catch((e) => {
    console.error("❌ ERROR:", e.message || e);
    process.exit(1);
});
