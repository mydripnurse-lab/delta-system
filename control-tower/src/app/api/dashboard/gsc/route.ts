import { loadDashboardSnapshot } from "@/lib/dashboardSnapshots";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const tenantId = s(url.searchParams.get("tenantId"));
        if (!tenantId) {
            return new Response(JSON.stringify({ ok: false, error: "Missing tenantId" }), {
                status: 400,
                headers: { "content-type": "application/json" },
            });
        }
        const payload = ((await loadDashboardSnapshot(tenantId, "gsc"))?.payload || {}) as Record<string, unknown>;
        const meta = (payload.meta || null) as Record<string, unknown> | null;
        const queries = (payload.queries || null) as Record<string, unknown> | null;
        const pages = (payload.pages || null) as Record<string, unknown> | null;
        const trend = (payload.trend || null) as Record<string, unknown> | null;
        if (!meta || !queries || !pages || !trend) {
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: `GSC DB snapshot not found for tenant ${tenantId}. Run sync first.`,
                }),
                { status: 412, headers: { "content-type": "application/json" } },
            );
        }

        return new Response(
            JSON.stringify({ ok: true, meta, queries, pages, trend }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    } catch (e: any) {
        return new Response(
            JSON.stringify({
                ok: false,
                error:
                    e?.message ||
                    "No cache found yet. Run POST /api/dashboard/gsc/sync first.",
            }),
            { status: 500, headers: { "content-type": "application/json" } },
        );
    }
}
