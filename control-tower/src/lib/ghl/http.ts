// control-tower/src/lib/ghl/http.ts
export const API_BASE = "https://services.leadconnectorhq.com";
export const VERSION = "2021-07-28";

async function resolveBearerLike(input: unknown): Promise<string> {
    let cur: unknown = input;
    let hops = 0;
    while (typeof cur === "function" && hops < 3) {
        cur = await (cur as () => unknown)();
        hops++;
    }
    if (cur && typeof (cur as Promise<unknown>).then === "function") {
        cur = await (cur as Promise<unknown>);
    }
    return String(cur ?? "").trim();
}

function looksLikeInvalidBearerToken(token: string): boolean {
    if (!token) return true;
    if (/\s/.test(token)) return true;
    const low = token.toLowerCase();
    if (low.includes("=>") || low.includes("function") || low.startsWith("async")) return true;
    return false;
}

export async function ghlFetchJson(
    pathOrUrl: string,
    opts: {
        method: string;
        bearer: string | (() => Promise<string> | string);
        body?: any;
        headers?: Record<string, string>;
    },
) {
    const url = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const resolved = await resolveBearerLike(opts.bearer);
    const token = looksLikeInvalidBearerToken(resolved) ? "" : resolved;
    if (!token) {
        throw new Error(`Missing GHL bearer token for ${url}`);
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Version: VERSION,
        Accept: "application/json",
        ...(opts.headers || {}),
    };

    let body: any = undefined;
    if (opts.body !== undefined) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }

    const r = await fetch(url, { method: opts.method, headers, body });
    const text = await r.text();

    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }

    if (!r.ok) {
        const err: any = new Error(`GHL API error (${r.status}) ${url}`);
        err.status = r.status;
        err.data = json;
        throw err;
    }

    return json;
}
