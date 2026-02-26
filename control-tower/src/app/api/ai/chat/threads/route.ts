import { NextResponse } from "next/server";
import {
    archiveConversationThread,
    createConversationThread,
    renameConversationThread,
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
        const body = (await req.json()) as { agent?: string; threadId?: string; title?: string };
        const agent = s(body?.agent || "overview");
        const threadId = normalizeThreadId(body?.threadId);
        const title = s(body?.title);
        const row = await createConversationThread(agent, threadId, title);
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
        const body = (await req.json()) as { agent?: string; threadId?: string; title?: string };
        const agent = s(body?.agent || "overview");
        const threadId = normalizeThreadId(body?.threadId);
        const title = s(body?.title);
        if (!title) {
            return NextResponse.json({ ok: false, error: "Missing title." }, { status: 400 });
        }
        const row = await renameConversationThread(agent, threadId, title);
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
        await archiveConversationThread(agent, threadId);
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "archive thread failed" },
            { status: 500 },
        );
    }
}

