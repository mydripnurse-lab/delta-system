import fs from "fs/promises";
import path from "path";
import os from "os";

export type AiRole = "user" | "assistant" | "system";

export type AiMessage = {
    role: AiRole;
    content: string;
    ts: number;
};

export type AiEvent = {
    id: string;
    ts: number;
    agent: string;
    kind: "insight_run" | "chat_turn";
    summary: string;
    metadata?: Record<string, unknown>;
};

type MemoryStore = {
    version: 1;
    updatedAt: number;
    conversations: Record<string, AiMessage[]>;
    threads?: Record<
        string,
        {
            title?: string;
            archived?: boolean;
            createdAt?: number;
            updatedAt?: number;
        }
    >;
    events: AiEvent[];
};

const MAX_EVENTS = 1500;
const MAX_MESSAGES_PER_AGENT = 200;
const THREAD_SEPARATOR = "::";

function memoryPath() {
    const explicit = String(process.env.AI_MEMORY_FILE || "").trim();
    if (explicit) return path.resolve(explicit);

    // Serverless environments (e.g. Vercel) cannot write under /var/task.
    // Use OS tmp as writable storage.
    if (
        process.env.VERCEL === "1" ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.cwd().startsWith("/var/task")
    ) {
        return path.join(os.tmpdir(), "control-tower", "storage", "ai-memory.json");
    }

    return path.join(process.cwd(), "storage", "ai-memory.json");
}

function nowTs() {
    return Date.now();
}

function uid() {
    return `${nowTs()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultStore(): MemoryStore {
    return {
        version: 1,
        updatedAt: nowTs(),
        conversations: {},
        threads: {},
        events: [],
    };
}

async function ensureDir() {
    const p = memoryPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
}

export async function readAiMemory(): Promise<MemoryStore> {
    const p = memoryPath();
    try {
        const raw = await fs.readFile(p, "utf8");
        const parsed = JSON.parse(raw) as Partial<MemoryStore>;
        return {
            version: 1,
            updatedAt: Number(parsed.updatedAt || nowTs()),
            conversations: parsed.conversations || {},
            threads: parsed.threads || {},
            events: Array.isArray(parsed.events) ? parsed.events : [],
        };
    } catch {
        return defaultStore();
    }
}

async function writeAiMemory(store: MemoryStore) {
    await ensureDir();
    store.updatedAt = nowTs();
    await fs.writeFile(memoryPath(), JSON.stringify(store, null, 2), "utf8");
}

export async function appendAiEvent(event: Omit<AiEvent, "id" | "ts">) {
    const store = await readAiMemory();
    const next: AiEvent = {
        id: uid(),
        ts: nowTs(),
        agent: event.agent,
        kind: event.kind,
        summary: event.summary,
        metadata: event.metadata || {},
    };
    store.events.push(next);
    if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(store.events.length - MAX_EVENTS);
    }
    await writeAiMemory(store);
    return next;
}

export async function appendConversationMessage(agent: string, msg: Omit<AiMessage, "ts">) {
    const store = await readAiMemory();
    if (!store.conversations[agent]) store.conversations[agent] = [];
    store.conversations[agent].push({
        role: msg.role,
        content: msg.content,
        ts: nowTs(),
    });
    if (store.conversations[agent].length > MAX_MESSAGES_PER_AGENT) {
        store.conversations[agent] = store.conversations[agent].slice(
            store.conversations[agent].length - MAX_MESSAGES_PER_AGENT,
        );
    }
    await writeAiMemory(store);
    return store.conversations[agent];
}

export async function getConversation(agent: string, limit = 60) {
    const store = await readAiMemory();
    const msgs = store.conversations[agent] || [];
    return msgs.slice(Math.max(0, msgs.length - Math.max(1, limit)));
}

function threadSafe(v: string) {
    return String(v || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "default";
}

function conversationKey(agent: string, threadId?: string) {
    const base = String(agent || "").trim() || "overview";
    const thread = threadSafe(String(threadId || "default"));
    return thread === "default" ? base : `${base}${THREAD_SEPARATOR}${thread}`;
}

function parseConversationKey(key: string) {
    const raw = String(key || "");
    const idx = raw.indexOf(THREAD_SEPARATOR);
    if (idx <= 0) return { agent: raw, threadId: "default" };
    return {
        agent: raw.slice(0, idx),
        threadId: threadSafe(raw.slice(idx + THREAD_SEPARATOR.length)),
    };
}

function normalizeThreadTitle(v: string) {
    return String(v || "").trim().slice(0, 120);
}

function ensureThreadMeta(store: MemoryStore, agent: string, threadId: string) {
    const key = conversationKey(agent, threadId);
    if (!store.threads) store.threads = {};
    const now = nowTs();
    if (!store.threads[key]) {
        store.threads[key] = {
            title: threadId === "default" ? "General" : "",
            archived: false,
            createdAt: now,
            updatedAt: now,
        };
    }
    if (store.threads[key]?.archived) {
        store.threads[key]!.archived = false;
    }
    store.threads[key]!.updatedAt = now;
    return key;
}

export async function appendConversationMessageForThread(
    agent: string,
    threadId: string,
    msg: Omit<AiMessage, "ts">,
) {
    const key = conversationKey(agent, threadId);
    const store = await readAiMemory();
    ensureThreadMeta(store, agent, threadId);
    if (!store.conversations[key]) store.conversations[key] = [];
    store.conversations[key].push({
        role: msg.role,
        content: msg.content,
        ts: nowTs(),
    });
    if (store.conversations[key].length > MAX_MESSAGES_PER_AGENT) {
        store.conversations[key] = store.conversations[key].slice(
            store.conversations[key].length - MAX_MESSAGES_PER_AGENT,
        );
    }
    const meta = store.threads?.[key];
    if (meta && !meta.title && msg.role === "user") {
        meta.title = normalizeThreadTitle(msg.content).slice(0, 60);
    }
    await writeAiMemory(store);
    return store.conversations[key];
}

export async function getConversationForThread(agent: string, threadId: string, limit = 60) {
    const key = conversationKey(agent, threadId);
    const store = await readAiMemory();
    const msgs = store.conversations[key] || [];
    return msgs.slice(Math.max(0, msgs.length - Math.max(1, limit)));
}

export async function listConversationThreads(agent: string, limit = 30) {
    const target = String(agent || "").trim() || "overview";
    const store = await readAiMemory();
    const all = Object.entries(store.conversations || {});
    const rows = all
        .map(([key, messages]) => {
            const parsed = parseConversationKey(key);
            if (parsed.agent !== target) return null;
            const meta = store.threads?.[key];
            if (meta?.archived) return null;
            const arr = Array.isArray(messages) ? messages : [];
            const last = arr[arr.length - 1] || null;
            return {
                threadId: parsed.threadId || "default",
                title: normalizeThreadTitle(String(meta?.title || "")),
                messageCount: arr.length,
                lastTs: Number(last?.ts || 0),
                lastPreview: String(last?.content || "").slice(0, 120),
            };
        })
        .filter((x): x is { threadId: string; title: string; messageCount: number; lastTs: number; lastPreview: string } => Boolean(x))
        .sort((a, b) => b.lastTs - a.lastTs);
    return rows.slice(0, Math.max(1, limit));
}

export async function createConversationThread(agent: string, threadId: string, title?: string) {
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    if (!store.conversations[key]) store.conversations[key] = [];
    if (title) store.threads![key]!.title = normalizeThreadTitle(title);
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return { threadId: parseConversationKey(key).threadId, title: store.threads![key]!.title || "" };
}

export async function renameConversationThread(agent: string, threadId: string, title: string) {
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    store.threads![key]!.title = normalizeThreadTitle(title);
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return { threadId: parseConversationKey(key).threadId, title: store.threads![key]!.title || "" };
}

export async function archiveConversationThread(agent: string, threadId: string) {
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    store.threads![key]!.archived = true;
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return { ok: true };
}

export async function getRecentEvents(limit = 120) {
    const store = await readAiMemory();
    const events = store.events || [];
    return events.slice(Math.max(0, events.length - Math.max(1, limit)));
}
