// control-tower/src/app/api/dashboard/gsc/refresh/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const tenantId = s(url.searchParams.get("tenantId"));
        const integrationKey = s(url.searchParams.get("integrationKey")) || "default";
        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }
        const range = url.searchParams.get("range") || "last_28_days";
        const start = url.searchParams.get("start") || "";
        const end = url.searchParams.get("end") || "";

        const syncUrl = new URL("/api/dashboard/gsc/sync", url.origin);
        syncUrl.searchParams.set("tenantId", tenantId);
        syncUrl.searchParams.set("integrationKey", integrationKey);
        syncUrl.searchParams.set("range", range);
        if (start) syncUrl.searchParams.set("start", start);
        if (end) syncUrl.searchParams.set("end", end);
        syncUrl.searchParams.set("force", "1");
        const r = await fetch(syncUrl.toString(), { cache: "no-store" });
        const txt = await r.text();
        let data: Record<string, unknown> = {};
        try {
            data = JSON.parse(txt) as Record<string, unknown>;
        } catch {
            data = { raw: txt };
        }
        return NextResponse.json({ ok: r.ok, ...data }, { status: r.status || 200 });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || "Failed to refresh GSC cache" },
            { status: 500 }
        );
    }
}
