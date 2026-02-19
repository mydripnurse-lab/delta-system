import fs from "fs/promises";
import path from "path";
import os from "os";

function s(v: any) {
    return String(v ?? "").trim();
}

export function adsCachePath(key: string) {
    const root = s(process.env.DASH_CACHE_DIR);
    const base = root
        ? (path.isAbsolute(root) ? root : path.resolve(process.cwd(), root))
        : path.join(os.tmpdir(), "control-tower-cache");
    return path.join(base, "ads", `${key}.json`);
}

function adsTmpFallbackPath(key: string) {
    return path.join(os.tmpdir(), "control-tower-cache", "ads", `${key}.json`);
}

export async function readCache(key: string) {
    const paths = [adsCachePath(key), adsTmpFallbackPath(key)];
    for (const p of paths) {
        try {
            const raw = await fs.readFile(p, "utf8");
            return JSON.parse(raw);
        } catch {
            // try next path
        }
    }
    return null;
}

export async function writeCache(key: string, data: any) {
    const primary = adsCachePath(key);
    try {
        await fs.mkdir(path.dirname(primary), { recursive: true });
        await fs.writeFile(primary, JSON.stringify(data, null, 2), "utf8");
        return primary;
    } catch {
        const fallback = adsTmpFallbackPath(key);
        await fs.mkdir(path.dirname(fallback), { recursive: true });
        await fs.writeFile(fallback, JSON.stringify(data, null, 2), "utf8");
        return fallback;
    }
}

export function cacheFresh(envelope: any, ttlSeconds: number) {
    const t = Number(envelope?.generatedAt ? Date.parse(envelope.generatedAt) : 0);
    if (!t) return false;
    return Date.now() - t < ttlSeconds * 1000;
}
