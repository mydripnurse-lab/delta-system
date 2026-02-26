import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
    appendAiEvent,
    appendConversationMessageForThread,
    getConversationForThread,
    getRecentEvents,
} from "@/lib/aiMemory";

export const runtime = "nodejs";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type ChatRequest = {
    agent: string;
    message: string;
    threadId?: string;
    context?: Record<string, unknown>;
};

function s(v: unknown) {
    return String(v ?? "").trim();
}

function clip(v: string, n = 1400) {
    return v.length > n ? `${v.slice(0, n)}...` : v;
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
        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json(
                { ok: false, error: "Missing OPENAI_API_KEY in environment." },
                { status: 500 },
            );
        }

        const body = (await req.json()) as ChatRequest;
        const agent = s(body?.agent || "overview");
        const threadId = normalizeThreadId(body?.threadId);
        const userMsg = s(body?.message);
        const context = body?.context || {};

        if (!userMsg) {
            return NextResponse.json({ ok: false, error: "Missing message." }, { status: 400 });
        }

        await appendConversationMessageForThread(agent, threadId, { role: "user", content: userMsg });
        await appendAiEvent({
            agent,
            kind: "chat_turn",
            summary: `User asked: ${clip(userMsg, 180)}`,
            metadata: { role: "user", threadId },
        });

        const convo = await getConversationForThread(agent, threadId, 30);
        const events = await getRecentEvents(80);
        const eventsCompact = events.map((e) => ({
            ts: e.ts,
            agent: e.agent,
            kind: e.kind,
            summary: e.summary,
        }));

        const response = await client.responses.create({
            model: "gpt-5.2",
            reasoning: { effort: "none" },
            input: [
                {
                    role: "system",
                    content:
                        "You are a multi-dashboard business copilot with CEO reasoning. " +
                        "You can collaborate across Calls, Leads, GSC, GA, Ads, YouTube Ads and Overview agents. " +
                        "Use conversation history, recent AI events, and provided context. " +
                        "Be concrete, action-oriented, and cite numeric evidence from context when available. " +
                        "If data/setup is missing, clearly call it out and propose next best steps.",
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        agent,
                        threadId,
                        context,
                        recent_events: eventsCompact,
                        conversation: convo.map((m) => ({ role: m.role, content: m.content })),
                        current_question: userMsg,
                    }),
                },
            ],
        });

        const outText = s((response as any)?.output_text || "");
        if (!outText) {
            return NextResponse.json(
                { ok: false, error: "Empty model output." },
                { status: 502 },
            );
        }

        await appendConversationMessageForThread(agent, threadId, { role: "assistant", content: outText });
        await appendAiEvent({
            agent,
            kind: "chat_turn",
            summary: `Assistant replied: ${clip(outText, 220)}`,
            metadata: { role: "assistant", threadId },
        });

        const history = await getConversationForThread(agent, threadId, 50);
        return NextResponse.json({ ok: true, reply: outText, history, threadId });
    } catch (e: unknown) {
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "chat failed" },
            { status: 500 },
        );
    }
}
