// services/tokenStore.js
import fs from "fs/promises";
import path from "path";

const TOKENS_PATH = path.resolve(process.cwd(), "storage", "tokens.json");
const TENANT_ID = String(process.env.TENANT_ID || "").trim();
const DB_FIRST_MODE = !!TENANT_ID;

let tokens = {
    access_token: "",
    refresh_token: "",
    expires_at: 0,
    scope: "",
    userType: "",
    companyId: "",
    locationId: "",
    oauth_state: "",
};

export function tokensPath() {
    return DB_FIRST_MODE ? `db:tenant:${TENANT_ID}` : TOKENS_PATH;
}

function mergeTokensFromEnv() {
    const exp = Number(process.env.GHL_EXPIRES_AT || 0);
    tokens = {
        ...tokens,
        access_token: String(process.env.GHL_ACCESS_TOKEN || tokens.access_token || ""),
        refresh_token: String(process.env.GHL_REFRESH_TOKEN || tokens.refresh_token || ""),
        expires_at: Number.isFinite(exp) ? exp : Number(tokens.expires_at || 0),
        scope: String(process.env.GHL_SCOPES || tokens.scope || ""),
        userType: String(process.env.GHL_USER_TYPE || tokens.userType || ""),
        companyId: String(process.env.GHL_COMPANY_ID || tokens.companyId || ""),
        locationId: String(process.env.GHL_LOCATION_ID || tokens.locationId || ""),
    };
}

function emitTokenUpdateMarker() {
    if (!DB_FIRST_MODE) return;
    try {
        const payload = {
            access_token: String(tokens.access_token || ""),
            refresh_token: String(tokens.refresh_token || ""),
            expires_at: Number(tokens.expires_at || 0),
            scope: String(tokens.scope || ""),
            companyId: String(tokens.companyId || ""),
            locationId: String(tokens.locationId || ""),
        };
        process.stdout.write(`__GHL_TOKEN_UPDATE__ ${JSON.stringify(payload)}\n`);
    } catch {
        // ignore marker errors
    }
}

export async function loadTokens() {
    if (DB_FIRST_MODE) {
        mergeTokensFromEnv();
        return tokens;
    }
    try {
        const raw = await fs.readFile(TOKENS_PATH, "utf-8");
        const parsed = JSON.parse(raw || "{}");
        tokens = { ...tokens, ...parsed };
        return tokens;
    } catch {
        // si no existe todavía, lo creamos
        await fs.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
        await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf-8");
        return tokens;
    }
}

export function getTokens() {
    return tokens;
}

export async function saveTokens(next) {
    tokens = { ...tokens, ...next };
    if (DB_FIRST_MODE) {
        emitTokenUpdateMarker();
        return tokens;
    }
    await fs.mkdir(path.dirname(TOKENS_PATH), { recursive: true });
    await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf-8");
    return tokens;
}

export function isExpiredSoon(bufferSec = 120) {
    if (!tokens.expires_at) return true;
    return Date.now() > Number(tokens.expires_at) - bufferSec * 1000;
}
