// scripts/src/test-location-token.js
import { loadTokens, getTokens } from "../../../services/tokenStore.js";
import { getLocationAccessToken } from "../../../services/ghlLocationToken.js";

const locationId = process.argv[2];

if (!locationId) {
    console.error("❌ Usage: node test-location-token.js <locationId>");
    process.exit(1);
}

async function main() {
    await loadTokens();
    const tokens = getTokens();

    if (!tokens.access_token) {
        throw new Error("Missing agency access_token in tokenStore");
    }
    if (!tokens.companyId) {
        throw new Error("Missing companyId in tokenStore");
    }

    const res = await getLocationAccessToken({
        companyId: tokens.companyId,
        locationId,
        agencyAccessToken: tokens.access_token, // 👈 CLAVE
    });

    // console.log("✅ Location token response:");
    // console.dir(res, { depth: null });
}

main().catch((e) => {
    console.error("❌ ERROR:", e);
});
