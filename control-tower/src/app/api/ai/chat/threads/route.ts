import { NextResponse } from "next/server";
import {
    archiveConversationThread,
    createConversationThread,
    reorderPinnedThreads,
    renameConversationThread,
    setConversationThreadPinned,
} from "@/lib/aiMemory";

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

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as { agent?: string; threadId?: string; title?: string; tenantId?: string };
        const agent = s(body?.agent || "overview");
        const threadId = normalizeThreadId(body?.threadId);
        const title = s(body?.title);
        const tenantId = s(body?.tenantId || "");
        const row = await createConversationThread(agent, threadId, title, tenantId || null);
        return NextResponse.json({ ok: true, thread: row });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "create thread failed" },
            { status: 500 },
        );
    }
}

export async function PATCH(req: Request) {
    try {
        const body = (await req.json()) as {
            agent?: string;
            threadId?: string;
            title?: string;
            pinned?: boolean;
            reorderPinnedThreadIds?: string[];
            tenantId?: string;
        };
        const agent = s(body?.agent || "overview");
        const tenantId = s(body?.tenantId || "");
        const reorder = Array.isArray(body?.reorderPinnedThreadIds) ? body.reorderPinnedThreadIds : [];
        if (reorder.length) {
            await reorderPinnedThreads(agent, reorder, tenantId || null);
            return NextResponse.json({ ok: true });
        }
        const threadId = normalizeThreadId(body?.threadId);
        const title = s(body?.title);
        const hasPinned = typeof body?.pinned === "boolean";
        if (!title && !hasPinned) {
            return NextResponse.json({ ok: false, error: "Missing title or pinned." }, { status: 400 });
        }
        let row: { threadId: string; title: string; pinned: boolean } | null = null;
        if (title) {
            row = await renameConversationThread(agent, threadId, title, tenantId || null);
        }
        if (hasPinned) {
            row = await setConversationThreadPinned(agent, threadId, body.pinned === true, tenantId || null);
        }
        if (!row) {
            return NextResponse.json({ ok: false, error: "No updates applied." }, { status: 400 });
        }
        return NextResponse.json({ ok: true, thread: row });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "rename thread failed" },
            { status: 500 },
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const agent = s(searchParams.get("agent") || "overview");
        const threadId = normalizeThreadId(searchParams.get("threadId"));
        const tenantId = s(searchParams.get("tenantId") || "");
        await archiveConversationThread(agent, threadId, tenantId || null);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "archive thread failed" },
            { status: 500 },
        );
    }
}
