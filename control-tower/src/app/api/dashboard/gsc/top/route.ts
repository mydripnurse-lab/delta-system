import { loadDashboardSnapshot } from "@/lib/dashboardSnapshots";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}
function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = s(searchParams.get("tenantId"));
        if (!tenantId) return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        const type = s(searchParams.get("type")) || "queries";
        const q = s(searchParams.get("q")).toLowerCase();
        const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") || 100)));

        const snap = await loadDashboardSnapshot(tenantId, "gsc");
        const payload = (snap?.payload || {}) as Record<string, unknown>;
        const json = (type === "pages" ? payload.pages : payload.queries) as Record<string, unknown> | null;
        if (!json) {
            return Response.json(
                { ok: false, error: `GSC DB snapshot not found for tenant ${tenantId}. Run sync first.` },
                { status: 412 },
            );
        }
        const rowsAll = Array.isArray(json?.rows) ? json.rows : [];

        let rows = rowsAll.map((r) => ({
            key: String(r.query || r.page || r.keys?.[0] || ""),
            clicks: num(r.clicks),
            impressions: num(r.impressions),
            ctr: Number.isFinite(Number(r.ctr))
                ? Number(r.ctr)
                : num(r.impressions)
                    ? num(r.clicks) / num(r.impressions)
                    : 0,
            position: num(r.position),
            __state: s(r.__state || r.state || ""),
        }));

        if (q) rows = rows.filter((r) => r.key.toLowerCase().includes(q));

        rows.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
        rows = rows.slice(0, limit);

        return Response.json({ ok: true, type, total: rows.length, rows });
    } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "top failed" }, { status: 500 });
    }
}
