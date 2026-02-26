import { NextResponse } from "next/server";
import { getConversationForThread, getRecentEvents, listConversationThreads } from "@/lib/aiMemory";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

function normalizeThreadId(v: unknown) {
    return String(v || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "default";
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const agent = s(searchParams.get("agent") || "overview");
        const threadId = normalizeThreadId(searchParams.get("threadId") || "default");
        const tenantId = s(searchParams.get("tenantId") || "");

        const [history, events, threads] = await Promise.all([
            getConversationForThread(agent, threadId, 80, tenantId || null),
            getRecentEvents(120, tenantId || null),
            listConversationThreads(agent, 50, tenantId || null),
        ]);

        return NextResponse.json({
            ok: true,
            agent,
            threadId,
            tenantId: tenantId || null,
            history,
            events,
            threads,
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "history failed" },
            { status: 500 },
        );
    }
}
