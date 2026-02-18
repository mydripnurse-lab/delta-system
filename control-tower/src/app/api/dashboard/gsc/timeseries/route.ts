import { loadDashboardSnapshot } from "@/lib/dashboardSnapshots";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}
function num(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function sliceByDate(rows: any[], start: string, end: string) {
    if (!start || !end) return rows;
    const a = new Date(start).getTime();
    const b = new Date(end).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return rows;
    return rows.filter((r) => {
        const d = new Date(String(r.date || "")).getTime();
        if (!Number.isFinite(d)) return true;
        return d >= a && d <= b;
    });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const tenantId = s(searchParams.get("tenantId"));
        if (!tenantId) return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        const start = s(searchParams.get("start"));
        const end = s(searchParams.get("end"));

        const payload = ((await loadDashboardSnapshot(tenantId, "gsc"))?.payload || {}) as Record<string, unknown>;
        const trend = (payload.trend || null) as Record<string, unknown> | null;
        if (!trend) {
            return Response.json(
                { ok: false, error: `GSC DB snapshot not found for tenant ${tenantId}. Run sync first.` },
                { status: 412 },
            );
        }
        const rowsAll = Array.isArray(trend?.rows) ? trend.rows : [];
        const rows = sliceByDate(rowsAll, start, end)
            .map((r) => ({
                date: String(r.date || ""),
                clicks: num(r.clicks),
                impressions: num(r.impressions),
                ctr: Number.isFinite(Number(r.ctr)) ? Number(r.ctr) : (num(r.impressions) ? num(r.clicks) / num(r.impressions) : 0),
                position: num(r.position),
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        return Response.json({ ok: true, rows });
    } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || "timeseries failed" }, { status: 500 });
    }
}
